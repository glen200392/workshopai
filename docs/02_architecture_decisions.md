# 02 — 架構決策記錄（ADR）

> Architecture Decision Records：每個重大技術選擇的正式記錄

---

## ADR-001：前端框架選擇

**狀態**：已決定（暫時）

**情境**：需要快速產出可演示的 prototype，讓 Glen 能在工作坊中實際試用。

**決策**：使用 vanilla HTML + CSS + JS，不使用框架。

**理由**：
- 零建置工具，直接雙擊 HTML 就能開啟
- 學員端只需分享連結或 QR Code
- 不需要伺服器，可部署在任何靜態托管
- 快速驗證流程，再決定是否需要重構

**後果**：
- ✅ 立刻可以演示
- ⚠️ 之後需要 Next.js 重構（接入 Supabase Realtime 較複雜）
- ⚠️ 兩個 HTML 之間沒有共用元件，維護成本稍高

**下一步觸發條件**：當 Supabase Realtime 整合需求超過 vanilla JS 可維護範圍時，才考慮 Next.js。

---

## ADR-002：AI 呼叫的 Proxy 架構

**狀態**：已決定

**情境**：需要呼叫 Anthropic Claude API 和 Google Gemini API，但不能讓 key 暴露在學員端。

**決策**：Supabase Edge Function 作為 proxy，key 儲存在 Supabase Secrets。

**替代方案考慮**：
| 方案 | 優點 | 缺點 |
|---|---|---|
| 學員端直接持有 key | 最簡單 | key 暴露、學員體驗差 |
| Next.js API Route | 常見方案 | 需要部署 Node.js 服務 |
| Cloudflare Workers | 高性能 | 引入新服務 |
| **Supabase Edge Function** | 已在技術棧、Deno runtime、整合 Secrets 管理 | 略有冷啟動 |

**決策理由**：Supabase 已是既定技術棧（資料庫、Realtime 都用），邊車 Edge Function 不引入新服務。

**API 合約**：
```
POST {supabaseUrl}/functions/v1/ai-proxy
Body: { type, sessionId, participantId, ...payload }
Response: { text } | { type:'image', base64, mimeType } | { type:'svg', svg }
```

---

## ADR-003：即時同步機制

**狀態**：已決定（尚未實作）

**情境**：講師端需要即時看到學員的對話狀態；學員端需要即時收到講師推送的模組。

**決策**：使用 Supabase Realtime（PostgreSQL CDC）。

**替代方案**：
| 方案 | 狀態 |
|---|---|
| Socket.IO | 需要獨立 WebSocket 服務 → 排除 |
| Pusher | 第三方服務，有費用 → 排除 |
| Polling | 效能差，延遲高 → 排除 |
| **Supabase Realtime** | 已在技術棧，基於 PostgreSQL → 採用 |

**訂閱設計**：
```javascript
// 學員端：監聽模組切換
supabase.channel('session:' + sessionId)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'sessions',
    filter: `id=eq.${sessionId}`
  }, payload => {
    if(payload.new.active_module_id !== S.activeModule) {
      handleModuleChange(payload.new);
    }
  }).subscribe()

// 講師端：監聽新學員報到
supabase.channel('participants:' + sessionId)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'participants',
    filter: `session_id=eq.${sessionId}`
  }, payload => {
    addParticipantCard(payload.new);
  }).subscribe()
```

---

## ADR-004：資料庫 Schema 設計

**狀態**：已決定

**核心原則**：
1. JSONB for flexible config（sessions.config, participants.memory, modules.ai_config）
2. 所有行為都記錄在 events 表（append-only）
3. conversations 是完整 log，不截斷

**memory JSONB 結構**（participants.memory）：
```json
{
  "profile": {
    "name": "陳佳慧",
    "picks": ["🔭 觀望中", "📄 文件海"],
    "mood": "💡 好奇",
    "roleHint": "催促轉型的主管"
  },
  "learning_state": {
    "visited_modules": ["checkin", "discussion_1"],
    "key_insights": ["擔心 AI 判斷出錯誰負責"],
    "unresolved_questions": ["AI 出錯的責任歸屬"]
  },
  "conversation_summary": "...",
  "last_updated": "2026-04-15T10:23:00Z"
}
```

**sessions.config JSONB 結構**（講師設定）：
```json
{
  "workshop_title": "HR AI 轉型思維工作坊",
  "join_code": "ABC123",
  "ai_config": {
    "claudeModel": "claude-sonnet-4-20250514",
    "geminiModel": "gemini-2.5-flash-image",
    "globalPrompt": "...",
    "tools": ["image", "summarize", "roleplay"],
    "memoryStrategy": "session",
    "proxyUrl": "https://xxx.supabase.co/functions/v1/ai-proxy"
  },
  "checkin_cards": [...],
  "modules": [...]
}
```

---

## ADR-005：學員識別策略

**狀態**：已決定

**決策**：匿名加入（只需名字），不需要帳號或 email。

**理由**：
- 降低進入門檻（工作坊學員不願意為一次活動建帳號）
- 隱私保護（HR 工作坊討論敏感話題）
- 簡化技術複雜度

**學員識別機制**：
```
sessionId（工作坊場次）+ participantId（Supabase 自動生成 UUID）
→ 儲存在 localStorage（學員刷新頁面後保持同一身份）
```

**講師端顯示**：用名字 + 字卡選擇識別學員，不顯示任何個人識別資訊。

---

## ADR-006：視覺化策略（雙路徑）

**狀態**：已決定

**決策**：Gemini Nano Banana（真實圖片）為主，Claude SVG 為備援。

**路由邏輯**：
```
學員說「幫我畫出來」
    ↓
後端 proxy（ai-proxy）：
    有 GEMINI_KEY?
    ├── 是 → gemini-2.5-flash-image（或更高版本）
    │         返回 base64 圖片
    └── 否 → Claude 生成 SVG 程式碼
              返回 SVG 字串
```

**為什麼這樣分**：
- Gemini 生成的是真實圖片（JPEG/PNG），視覺效果更好
- Claude SVG 是結構化向量圖，更精確表達概念關係
- 兩者都不需要學員感知，對學員是透明的

---

## ADR-007：手機體驗標準

**狀態**：已決定

**學員端必須滿足的標準**：
- 觸控目標 ≥ 44px（Apple HIG 標準）
- 輸入框字體 ≥ 16px（防 iOS 自動縮放）
- 支援 safe area insets（iPhone 瀏海 / Home Bar）
- 使用 `100dvh` 而非 `100vh`（Dynamic Viewport Height）
- 所有滾動容器 `-webkit-overflow-scrolling: touch`
- 防雙擊縮放
- 鍵盤彈出時自動 scroll input 進視野

**字體選擇**：
- 學員端：Instrument Serif（溫暖有機感）+ DM Sans
- 講師端：IBM Plex Mono + IBM Plex Sans TC（控制台感）

---

*最後更新：2026-04-15*
