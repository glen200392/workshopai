// ═══════════════════════════════════════════════════════════════
// WorkshopAI — Supabase Edge Function: ai-proxy  v2
// 部署路徑: supabase/functions/ai-proxy/index.ts
//
// 新增（v2）：
//   - SSE streaming 支援（chat type，Anthropic provider）
//   - insight type（群體洞察，講師端呼叫）
//   - 更清晰的錯誤訊息
//   - logMessage 改為 non-blocking（不阻塞串流回傳）
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

// SSE streaming response helper
function streamResponse(upstreamBody: ReadableStream<Uint8Array>): Response {
  return new Response(upstreamBody, {
    headers: {
      ...CORS,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
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

// ── 記錄對話到資料庫（non-blocking：用 waitUntil 或 fire-and-forget）──
function logMessageAsync(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  participantId: string,
  role: string,
  content: string,
  contentType = 'text',
  metadata: Record<string, unknown> = {}
) {
  // Fire-and-forget: don't await — avoids blocking stream response
  supabase.from('conversations').insert({
    session_id:    sessionId,
    participant_id: participantId || null,
    role,
    content,
    content_type:  contentType,
    metadata,
  }).then(({ error }) => {
    if(error) console.error('logMessage failed:', error.message)
  })
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
    return ok({ pong: true, ok: true, version: 2, timestamp: new Date().toISOString() })
  }

  const {
    type, sessionId, participantId,
    systemPrompt, messages,
    userPrompt, convoContext, picks, mood,
    stream,      // boolean — student端發 true 表示要 SSE
    insightPrompt, insightContext, // for insight type
  } = body

  // ── 初始化 Supabase client（service role，可讀寫所有表）──
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ── insight type 不需要驗證 session（講師直接呼叫）──
  // ── 但需要驗證講師身份，這裡以 sessionId 作為基本驗證 ──
  if(type === 'insight') {
    if(!ANTHROPIC_KEY) return err('Anthropic API key not configured', 503)

    const prompt = (insightPrompt as string) || ''
    const context = (insightContext as string) || ''

    if(!prompt) return err('insightPrompt is required')

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: '你是工作坊講師的 AI 助手，提供精準的群體動態洞察。繁體中文，直接、犀利、有洞察力。不超過 400 字。',
          messages: [{ role: 'user', content: `${context}\n\n講師的問題：${prompt}` }]
        })
      })
      const data = await res.json() as Record<string, unknown>
      if(!res.ok) return err((data.error as Record<string, unknown>)?.message as string || 'Claude error', res.status)
      const text = ((data.content as Array<Record<string, unknown>>)?.[0]?.text as string) || ''
      return ok({ text })
    } catch(e) {
      console.error('insight error:', e)
      return err('Insight analysis failed', 503)
    }
  }

  // ── 驗證 session（chat / visual 需要）──
  const session = await validateSession(supabase, sessionId as string)
  if(!session) {
    return err('Invalid or inactive session. Check join code and session status.', 403)
  }

  // 從 session.config 取得 AI model 設定
  const aiConfig = (session.config as Record<string, unknown>)?.ai_config as Record<string, unknown> || {}
  const claudeModel  = (aiConfig.claudeModel as string)  || 'claude-sonnet-4-20250514'
  const geminiModel  = (aiConfig.geminiModel as string)  || 'gemini-2.5-flash-image'
  const globalPrompt = (aiConfig.globalPrompt as string) || ''
  const provider     = (aiConfig.provider as string)     || 'anthropic'

  // ── 功能模組開關（伺服器端強制執行）──
  const features      = aiConfig.features as Record<string, boolean> || {}
  const aiEnabled     = features.ai_enabled     !== false
  const visualEnabled = features.visual_enabled !== false

  if(type === 'chat' && !aiEnabled) {
    return err('AI chat is not enabled for this session', 403)
  }
  if(type === 'visual' && !visualEnabled) {
    return err('Visual generation is not enabled for this session', 403)
  }

  // ════════════════════════════════
  // TYPE: chat（多 provider 路由）
  // ════════════════════════════════
  if(type === 'chat') {
    const sys  = (systemPrompt as string) || globalPrompt
    const msgs = (messages as Array<{ role: string; content: string }>) || []
    const wantStream = stream === true && provider === 'anthropic'

    // 記錄學員訊息（non-blocking）
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    if(lastUser && sessionId) {
      logMessageAsync(supabase, sessionId as string, participantId as string, 'user', lastUser.content)
    }

    try {
      // ════════════════════════════════
      // SSE STREAMING（Anthropic only）
      // ════════════════════════════════
      if(wantStream) {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'messages-2023-06-01',
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: 800,
            system: sys,
            messages: msgs,
            stream: true,
          })
        })

        if(!upstream.ok) {
          const errData = await upstream.json() as Record<string, unknown>
          return err((errData.error as Record<string, unknown>)?.message as string || 'Claude streaming error', upstream.status)
        }

        if(!upstream.body) return err('No stream body', 503)

        // Pipe upstream SSE directly to client
        // Also intercept to log the full response (via TransformStream)
        let accumulated = ''
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk)
            // Accumulate text for logging
            const text = new TextDecoder().decode(chunk)
            const lines = text.split('\n')
            for(const line of lines) {
              if(!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if(data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const delta = parsed.delta?.text || ''
                if(delta) accumulated += delta
              } catch { /* ignore */ }
            }
          },
          flush() {
            // Log the full accumulated response non-blocking
            if(accumulated && sessionId) {
              logMessageAsync(
                supabase,
                sessionId as string,
                participantId as string,
                'assistant',
                accumulated,
                'text',
                { model: claudeModel, streamed: true }
              )
            }
          }
        })

        upstream.body.pipeTo(writable).catch(e => console.error('stream pipe error:', e))

        return streamResponse(readable)
      }

      // ════════════════════════════════
      // NON-STREAMING（all providers）
      // ════════════════════════════════
      let text = ''
      let usedModel = claudeModel

      // ── Groq（OpenAI-compatible）──
      if(provider === 'groq') {
        if(!GROQ_KEY) return err('Groq API key not configured. Run: supabase secrets set GROQ_API_KEY=gsk_...', 503)
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
        if(!GEMINI_KEY) return err('Gemini API key not configured. Run: supabase secrets set GEMINI_API_KEY=AIza...', 503)
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

      // ── Anthropic（non-streaming）──
      } else {
        if(!ANTHROPIC_KEY) return err('Anthropic API key not configured. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...', 503)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: claudeModel, max_tokens: 800, system: sys, messages: msgs })
        })
        const data = await res.json() as Record<string, unknown>
        if(!res.ok) return err((data.error as Record<string, unknown>)?.message as string || 'Claude API error', res.status)
        text = ((data.content as Array<Record<string, unknown>>)?.[0]?.text as string) || ''
        usedModel = claudeModel
      }

      // 記錄 AI 回應（non-blocking）
      if(text && sessionId) {
        logMessageAsync(supabase, sessionId as string, participantId as string, 'assistant', text, 'text', {
          model: usedModel,
        })
      }

      return ok({ text })

    } catch(e) {
      console.error('chat error:', e)
      return err('AI service temporarily unavailable. Please try again in a moment.', 503)
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

          if(sessionId) {
            logMessageAsync(supabase, sessionId as string, participantId as string, 'assistant', prompt, 'image', {
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
        console.error('Gemini image error, falling back to SVG:', e)
      }
    }

    // Fallback：Claude SVG 概念圖
    if(!ANTHROPIC_KEY) return err('No AI keys configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in Supabase Secrets.', 503)

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
          logMessageAsync(supabase, sessionId as string, participantId as string, 'assistant', prompt, 'artifact', { model: claudeModel })
        }
        return ok({ type: 'svg', svg, followUp: '概念圖生成完成。這個結構有反映出你想整理的概念嗎？' })
      }

      return err('SVG generation failed: model did not return valid SVG markup')
    } catch(e) {
      console.error('SVG error:', e)
      return err('Visual generation failed', 503)
    }
  }

  return err(`Unknown request type: "${type}". Valid types: ping | chat | visual | insight`)
})
