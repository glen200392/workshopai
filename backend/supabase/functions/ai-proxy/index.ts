// ═══════════════════════════════════════════════════════════════
// WorkshopAI — Supabase Edge Function: ai-proxy
// 部署路徑: supabase/functions/ai-proxy/index.ts
//
// 職責：
//   - 接收學員端 AI 呼叫（帶 sessionId）
//   - 驗證 session 合法性
//   - 從 Supabase Secrets 讀取 API key
//   - 轉發給 Claude / Gemini
//   - 記錄對話至資料庫
//   - 學員端永遠看不到任何 key
//
// 部署指令：
//   supabase functions deploy ai-proxy --no-verify-jwt
//
// Secrets 設定（只需設定一次）：
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set GEMINI_API_KEY=AIza...
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── 從環境變數（Supabase Secrets）讀取，不硬編碼 ──
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const GEMINI_KEY    = Deno.env.get('GEMINI_API_KEY')    ?? ''
const GROQ_KEY      = Deno.env.get('GROQ_API_KEY')      ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// CORS headers — 允許任何來源（前端是靜態 HTML）
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── 驗證 session 是否 active ──
async function validateSession(supabase: ReturnType<typeof createClient>, sessionId: string) {
  if(!sessionId) return null
  const { data } = await supabase
    .from('sessions')
    .select('id, status, config')
    .eq('id', sessionId)
    .eq('status', 'active')
    .single()
  return data
}

// ── 記錄對話到資料庫 ──
async function logMessage(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  participantId: string,
  role: string,
  content: string,
  contentType = 'text',
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('conversations').insert({
      session_id:    sessionId,
      participant_id: participantId || null,
      role,
      content,
      content_type:  contentType,
      metadata,
    })
  } catch(e) {
    console.error('logMessage failed:', e)
  }
}

// ── 主處理器 ──
serve(async (req: Request) => {

  // CORS preflight
  if(req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if(req.method !== 'POST') {
    return err('Method not allowed', 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON')
  }

  // Health check
  if(body.type === 'ping') {
    return ok({ pong: true, ok: true, timestamp: new Date().toISOString() })
  }

  const { type, sessionId, participantId, systemPrompt, messages, userPrompt, convoContext, picks, mood } = body

  // ── 初始化 Supabase client（service role，可讀寫所有表）──
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ── 驗證 session ──
  const session = await validateSession(supabase, sessionId as string)
  if(!session) {
    return err('Invalid or inactive session', 403)
  }

  // 從 session.config 取得 AI model 設定
  const aiConfig = (session.config as Record<string, unknown>)?.ai_config as Record<string, unknown> || {}
  const claudeModel  = (aiConfig.claudeModel as string)  || 'claude-sonnet-4-20250514'
  const geminiModel  = (aiConfig.geminiModel as string)  || 'gemini-2.5-flash-image'
  const globalPrompt = (aiConfig.globalPrompt as string) || ''
  const provider     = (aiConfig.provider as string)     || 'anthropic'

  // ════════════════════════════════
  // TYPE: chat（多 provider 路由）
  // ════════════════════════════════
  if(type === 'chat') {
    const sys  = (systemPrompt as string) || globalPrompt
    const msgs = (messages as Array<{ role: string; content: string }>) || []

    // 記錄學員訊息
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    if(lastUser && sessionId) {
      await logMessage(supabase, sessionId as string, participantId as string, 'user', lastUser.content)
    }

    try {
      let text = ''
      let usedModel = claudeModel

      // ── Groq（OpenAI-compatible）──
      if(provider === 'groq') {
        if(!GROQ_KEY) return err('Groq API key not configured. Set GROQ_API_KEY in Supabase Secrets.', 503)
        const groqModel = 'llama-3.3-70b-versatile'
        usedModel = groqModel
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: groqModel, max_tokens: 800,
            messages: sys ? [{ role: 'system', content: sys }, ...msgs] : msgs,
          })
        })
        const data = await res.json() as Record<string, unknown>
        if(!res.ok) return err((data.error as Record<string, unknown>)?.message as string || 'Groq error', res.status)
        text = ((data.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content as string || ''

      // ── Gemini Text ──
      } else if(provider === 'gemini') {
        if(!GEMINI_KEY) return err('Gemini API key not configured. Set GEMINI_API_KEY in Supabase Secrets.', 503)
        const geminiTextModel = 'gemini-2.0-flash'
        usedModel = geminiTextModel
        const contents = sys
          ? [{ role: 'user', parts: [{ text: sys + '\n\n---\n' + (msgs[0]?.content || '') }] },
             ...msgs.slice(1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))]
          : msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiTextModel}:generateContent?key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents }) }
        )
        const data = await res.json() as Record<string, unknown>
        if(!res.ok) return err((data.error as Record<string, unknown>)?.message as string || 'Gemini error', res.status)
        text = (((data.candidates as Array<Record<string, unknown>>)?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>)?.[0]?.text as string || ''

      // ── Anthropic（預設）──
      } else {
        if(!ANTHROPIC_KEY) return err('Anthropic API key not configured. Set ANTHROPIC_API_KEY in Supabase Secrets.', 503)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: claudeModel, max_tokens: 800, system: sys, messages: msgs })
        })
        const data = await res.json() as Record<string, unknown>
        if(!res.ok) return err((data.error as Record<string, unknown>)?.message as string || 'Claude API error', res.status)
        text = ((data.content as Array<Record<string, unknown>>)?.[0]?.text as string) || ''
        if(text && sessionId) {
          await logMessage(supabase, sessionId as string, participantId as string, 'assistant', text, 'text', {
            model: usedModel,
            input_tokens:  (data.usage as Record<string, unknown>)?.input_tokens,
            output_tokens: (data.usage as Record<string, unknown>)?.output_tokens,
          })
        }
        return ok({ text })
      }

      // 非 Anthropic provider 的記錄
      if(text && sessionId) {
        await logMessage(supabase, sessionId as string, participantId as string, 'assistant', text, 'text', { model: usedModel })
      }
      return ok({ text })

    } catch(e) {
      console.error('chat error:', e)
      return err('AI service unavailable', 503)
    }
  }

  // ════════════════════════════════
  // TYPE: visual（圖片生成 or SVG）
  // ════════════════════════════════
  if(type === 'visual') {
    const prompt = userPrompt as string || ''
    const context = convoContext as string || ''

    // 優先嘗試 Gemini 真實圖片
    if(GEMINI_KEY) {
      const imagePrompt =
        `工作坊主題：HR 與 AI 轉型。\n` +
        `學員背景：字卡${(picks as string[])?.join('、') || ''}，能量${mood || ''}。\n` +
        `對話脈絡：\n${context}\n\n` +
        `視覺化請求：${prompt}\n\n` +
        `生成一張清晰的概念視覺化圖片：現代扁平風格，深綠色背景(#1a2820)，` +
        `螢光綠(#5aad78)主色，繁體中文標籤，展示概念關係，適合手機閱讀。`

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: imagePrompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
            })
          }
        )

        const data = await res.json() as Record<string, unknown>
        const parts = ((data.candidates as Array<Record<string, unknown>>)?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> || []
        const imagePart = parts.find((p: Record<string, unknown>) => (p.inlineData as Record<string, unknown>)?.mimeType?.toString().startsWith('image/'))
        const textPart  = parts.find((p: Record<string, unknown>) => p.text)

        if(imagePart) {
          const inlineData = imagePart.inlineData as Record<string, unknown>

          // 儲存生成圖片記錄
          if(sessionId) {
            await logMessage(supabase, sessionId as string, participantId as string, 'assistant', prompt, 'image', {
              model: geminiModel,
              mimeType: inlineData.mimeType,
            })
          }

          return ok({
            type:     'image',
            base64:   inlineData.data,
            mimeType: inlineData.mimeType,
            followUp: (textPart?.text as string) || '圖像生成完成，你覺得有抓到你想整理的概念嗎？',
          })
        }
        // Gemini 沒回傳圖片 → fallthrough 到 SVG
      } catch(e) {
        console.error('Gemini error, falling back to SVG:', e)
      }
    }

    // Fallback：Claude SVG 概念圖
    if(!ANTHROPIC_KEY) return err('No AI keys configured', 503)

    const svgPrompt =
      `根據以下工作坊對話，生成一個清晰的 SVG 概念視覺化圖表。\n\n` +
      `對話內容：\n${context}\n\n` +
      `視覺化請求：「${prompt}」\n\n` +
      `要求：\n` +
      `- 只輸出純 SVG 程式碼，從 <svg 到 </svg>\n` +
      `- viewBox="0 0 400 280"，背景 #1a2820\n` +
      `- 顏色：#5aad78（綠）、#c17f24（琥珀）、#4d9fff（藍）、#d8eedf（白字）\n` +
      `- 有標題、節點、連接線/箭頭，繁體中文，字號 ≥ 11px`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 2000,
          system: '你是視覺化設計師，只輸出 SVG 程式碼，不加任何說明。',
          messages: [{ role: 'user', content: svgPrompt }]
        })
      })

      const data = await res.json() as Record<string, unknown>
      const raw  = ((data.content as Array<Record<string, unknown>>)?.[0]?.text as string) || ''
      const match = raw.match(/<svg[\s\S]*?<\/svg>/i)
      const svg  = match?.[0] || null

      if(svg) {
        if(sessionId) {
          await logMessage(supabase, sessionId as string, participantId as string, 'assistant', prompt, 'artifact', { model: claudeModel })
        }
        return ok({ type: 'svg', svg, followUp: '概念圖生成完成。這個結構有反映出你想整理的概念嗎？' })
      }

      return err('SVG generation failed')
    } catch(e) {
      console.error('SVG error:', e)
      return err('Visual generation failed', 503)
    }
  }

  return err(`Unknown type: ${type}`)
})
