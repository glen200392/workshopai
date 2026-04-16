#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# WorkshopAI — 部署腳本
# 執行前確認：
#   1. 已安裝 Supabase CLI（npm i -g supabase）
#   2. 已登入（supabase login）
#   3. 已連結專案（supabase link --project-ref 你的專案id）
# ═══════════════════════════════════════════════════════════════

set -e  # 任何指令失敗就停止

echo "═══════════════════════════════════"
echo "  WorkshopAI 部署"
echo "═══════════════════════════════════"

# ── Step 1：推送資料庫 Migration ──
echo ""
echo "▶ Step 1：推送資料庫 Schema..."
supabase db push

# ── Step 2：部署 Edge Function ──
echo ""
echo "▶ Step 2：部署 AI Proxy Edge Function..."
supabase functions deploy ai-proxy --no-verify-jwt

# ── Step 3：設定 Secrets（如果尚未設定）──
echo ""
echo "▶ Step 3：檢查 Secrets..."
echo ""
echo "請確認以下 Secrets 已設定（只需設定一次）："
echo "  supabase secrets set ANTHROPIC_API_KEY=sk-ant-..."
echo "  supabase secrets set GEMINI_API_KEY=AIza..."
echo ""

read -p "Secrets 已設定了嗎？[y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "✓ 繼續..."
else
    echo "請先設定 Secrets 再繼續："
    echo "  supabase secrets set ANTHROPIC_API_KEY=你的key"
    echo "  supabase secrets set GEMINI_API_KEY=你的key"
    exit 1
fi

# ── Step 4：驗證 Edge Function ──
echo ""
echo "▶ Step 4：驗證 Proxy 連線..."

SUPABASE_URL=$(supabase status | grep "API URL" | awk '{print $3}')
if [ -z "$SUPABASE_URL" ]; then
    echo "⚠ 無法自動取得 Supabase URL，請手動驗證："
    echo "  curl -X POST \$SUPABASE_URL/functions/v1/ai-proxy -H 'Content-Type: application/json' -d '{\"type\":\"ping\"}'"
else
    RESULT=$(curl -s -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
        -H "Content-Type: application/json" \
        -d '{"type":"ping"}')
    echo "Proxy 回應：$RESULT"
    if echo "$RESULT" | grep -q '"ok":true'; then
        echo "✓ Edge Function 運作正常！"
    else
        echo "⚠ Proxy 回應異常，請檢查 Edge Function logs："
        echo "  supabase functions logs ai-proxy"
    fi
fi

# ── Step 5：顯示前端配置 ──
echo ""
echo "═══════════════════════════════════"
echo "  部署完成！"
echo "═══════════════════════════════════"
echo ""
echo "▶ 下一步：更新前端 CONFIG"
echo ""
echo "在 frontend/student.html 頂部的 CONFIG 物件填入："
SUPABASE_URL=$(supabase status 2>/dev/null | grep "API URL" | awk '{print $3}' || echo "https://你的專案id.supabase.co")
ANON_KEY=$(supabase status 2>/dev/null | grep "anon key" | awk '{print $3}' || echo "eyJ...")
echo ""
echo "  const CONFIG = {"
echo "    proxyUrl:    '${SUPABASE_URL}/functions/v1/ai-proxy',"
echo "    supabaseUrl: '${SUPABASE_URL}',"
echo "    supabaseKey: '${ANON_KEY}',"
echo "    demoMode:    false,"
echo "  };"
echo ""
echo "▶ 將 frontend/ 資料夾上傳到靜態托管（Vercel / GitHub Pages）"
echo "▶ 開啟 instructor.html，在「場次設定」填入 Supabase URL 和 Anon Key"
echo "▶ 在「AI 設定」填入 Claude/Gemini Key 並點測試"
echo "▶ 點「開始工作坊」，複製代碼給學員"
echo ""
