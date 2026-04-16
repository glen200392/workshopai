# CLAUDE.md — WorkshopAI 專案全局指引

> 這份文件是給 Claude Code 的完整交接說明。
> 閱讀完這份文件後，你應該能完整理解這個專案的**為什麼、是什麼、怎麼做**，並能獨立接手繼續開發。

---

## 一、這個專案是什麼

WorkshopAI 是一套**企業內部工作坊與培訓的 AI 人機協作工具**。

### 核心價值主張

傳統企業工作坊的問題：
- 學員是被動聆聽者，沒有個人化體驗
- 講師無法即時了解每個人的狀態
- 活動結束後資料消失，沒有後續追蹤
- L1/L2 學習成效，無法到達 L3（行為改變）

WorkshopAI 的解法：
- **每位學員有自己的 AI 學習夥伴**，從報到開始到結束全程陪伴
- AI 夥伴根據學員的字卡選擇**個人化**：對話風格、角色扮演對手、討論切入點都不同
- **即時視覺化**：學員說「幫我畫出來」，AI 生成概念圖（Gemini Nano Banana 圖片或 Claude SVG）
- **講師全局監控**：即時看到所有學員的對話狀態、AI 記憶、字卡分佈
- **完整記錄**：所有對話、行為事件存入 Supabase，場次結束後可審視

### 設計情境（第一版）

**HR & 總務 AI 轉型思維工作坊**（Primax Group 內部使用）
- 參與者：HR 和總務人員，對 AI 轉型有不同程度的接受度
- 規模：20-80 人
- 設備：學員用手機，講師/主持人用電腦

---

## 二、設計哲學與決策原則

### 設計 DNA（從原始對話中提煉）

```
結構強制 > 人為紀律
  → API key 不讓學員設定，由後端代持
  → 字卡選擇直接驅動後續 AI 行為，不靠學員記憶

務實極簡主義
  → 現在：兩個 HTML 檔 + 一個 Edge Function，直接開啟就能跑
  → 未來：Next.js 重構，但只在必要時

建構凍結意識
  → 原型已完成，不要繼續加功能，要先跑通後端串接
  → 最高優先級：Supabase Realtime 讓學員端真正即時同步

學員體驗第一
  → 學員不需要設定任何東西，不需要帳號，不需要 key
  → 報到流程必須在手機上 30 秒完成
  → AI 夥伴開場就個人化，不是通用問候
```

### 關鍵設計決策記錄

| 決策 | 選擇 | 原因 |
|---|---|---|
| API Key 管理 | 後端持有，學員端完全不知道 | 安全性 + 學員體驗（不要讓學員自己設定）|
| 視覺化生成 | Gemini Nano Banana（真實圖片）+ Claude SVG（fallback）| Gemini 生成真實圖，沒有 Gemini key 時 Claude 生成 SVG |
| 即時同步 | Supabase Realtime（PostgreSQL CDC）| 已在技術棧內，不引入 Socket.IO |
| 前端框架 | 現在 vanilla HTML，未來 Next.js | 先驗證流程，再重構 |
| 資料庫 | Supabase PostgreSQL | 同時提供 Realtime、Auth、Storage、Edge Functions |
| 學員識別 | 匿名（姓名 + sessionId），不需帳號 | 降低使用門檻 |
| 字卡設計 | 3 維度 × 4 張 = 12 張，每張連動後續行為 | 字卡不是 check-in，是驅動整個學習路徑的資料 |

---

## 三、架構圖

```
┌─────────────────────────────────────────────────────────┐
│                   WorkshopAI Platform                    │
├────────────────┬──────────────────┬─────────────────────┤
│  講師/主持人端  │   學員端（手機）  │   投影大螢幕         │
│  instructor    │   student        │   instructor 投影模式 │
│  .html（桌機） │   .html（手機）  │                     │
└───────┬────────┴────────┬─────────┴─────────────────────┘
        │                 │
        ▼                 ▼
┌───────────────────────────────────────┐
│         Supabase Edge Function        │
│         ai-proxy/index.ts             │
│                                       │
│  - 驗證 sessionId                     │
│  - 從 Secrets 讀取 API key            │
│  - 路由到 Claude（對話）              │
│  - 路由到 Gemini（圖片）              │
│  - 記錄對話到資料庫                   │
└───────────────┬───────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌──────────────┐  ┌──────────────────────┐
│ Supabase     │  │  External AI APIs    │
│ PostgreSQL   │  │                      │
│ + Realtime   │  │  Claude API          │
│ + Storage    │  │  (對話/SVG/洞察)     │
│              │  │                      │
│  sessions    │  │  Gemini Nano Banana  │
│  participants│  │  (真實圖片生成)      │
│  conversations│  └──────────────────────┘
│  modules     │
│  events      │
└──────────────┘
```

---

## 四、檔案結構說明

```
workshopai/
│
├── CLAUDE.md                    ← 你現在讀的這份（Claude Code 主要參考）
├── README.md                    ← 人類閱讀的部署說明
│
├── frontend/
│   ├── student.html             ← 學員端（手機優先，vanilla HTML）
│   └── instructor.html          ← 講師 + 主持人端（桌機，vanilla HTML）
│
├── backend/
│   └── supabase/
│       ├── functions/
│       │   └── ai-proxy/
│       │       └── index.ts     ← Edge Function：AI proxy（唯一後端邏輯）
│       └── migrations/
│           └── 001_initial.sql  ← 資料庫建表 SQL
│
├── docs/
│   ├── 01_conversation_intent.md   ← 原始對話的意圖與設計過程
│   ├── 02_architecture_decisions.md ← 架構決策記錄（ADR）
│   ├── 03_card_system_design.md    ← 字卡系統設計邏輯
│   ├── 04_api_contracts.md         ← API 介面定義
│   └── 05_next_steps.md            ← 下一步開發優先級
│
└── config/
    ├── supabase.example.env     ← 環境變數範本
    └── deploy.sh                ← 一鍵部署腳本
```

---

## 五、三個核心檔案說明

### `frontend/student.html` — 學員端

**設計目標**：手機上 30 秒完成報到，AI 夥伴立即個人化對話

**三個畫面**：
1. `#screen-join` — 輸入 6 碼課程代碼
2. `#screen-checkin` — 三步驟報到（名字→字卡→能量）
3. `#screen-session` — AI 助理主畫面（對話 + 視覺化 artifact）

**重要函式**：
- `callProxy(type, payload)` — 所有 AI 呼叫統一入口，學員端沒有任何 key
- `generateVisual(prompt, thinkingEl)` — 視覺化生成（走 proxy → Gemini 或 SVG）
- `buildSystemPrompt()` — 從 `S.memory` 建構個人化 system prompt
- `initSession()` — 報到後初始化，注入個人化開場白
- `dismissTutorial()` / `reopenTutorial()` — 引導教學 overlay 控制

**State 結構**：
```javascript
const S = {
  sessionId, joinCode, participantId,
  name, picks, mood,           // 報到資料
  memory: {                    // AI 記憶（整個 session 保留）
    profile: { name, picks, mood, roleHint },
    learning_state: { visited_modules, key_insights, unresolved_questions },
    conversation_summary,
  },
  messages,                    // 對話歷史
  sessionConfig,               // 由 session 注入（ai config、cards...）
}
```

**CONFIG 物件**（部署時需填入）：
```javascript
const CONFIG = {
  proxyUrl:    '',   // Supabase Edge Function URL（學員用）
  supabaseUrl: '',   // Supabase project URL
  supabaseKey: '',   // anon key（公開，安全）
  demoMode:    true, // true = 無後端示範模式
}
```

---

### `frontend/instructor.html` — 講師端

**設計目標**：三欄佈局，即時監控所有學員，完整的工作坊控制面板

**三欄**：
- 左欄：工作坊流程設計（模組管理、AI 設定、報到字卡設定）
- 中欄：學員格狀監控 / 投影大螢幕 / 事件 Log
- 右欄：學員詳情 + AI 群體洞察 + 場次設定

**重要函式**：
- `startSession()` — 開始工作坊，寫入 Supabase session config
- `writeSessionToSupabase()` — 把 aiConfig（不含 key）寫入 sessions 表
- `saveAgentConfig()` — 儲存 key 到 localStorage，更新 aiConfig
- `testClaudeKey()` / `testGeminiKey()` — 直接呼叫 API 測試 key 有效性
- `runInsight()` — 用講師的 Claude key 直接分析群體狀態（不走 proxy）
- `pushModule(id)` — 推送活動模組，觸發 Supabase Realtime 通知學員端
- `renderParticipants()` — 渲染學員格狀牆

**State 結構**：
```javascript
const S = {
  sessionId, joinCode, isLive,
  supabaseUrl, supabaseKey,
  claudeKey, geminiKey,      // 僅在講師端 localStorage
  aiConfig: {
    claudeModel, geminiModel,
    globalPrompt, tools, memoryStrategy,
  },
  participants: [...],       // 即時學員資料
  modules: [...],            // 工作坊模組列表
  logs: [...],               // 事件日誌
}
```

---

### `backend/supabase/functions/ai-proxy/index.ts` — Edge Function

**職責**：唯一持有 API key 的地方，所有 AI 呼叫的代理

**處理的請求類型**：
- `ping` — 健康檢查
- `chat` — Claude 對話（帶 system prompt + messages）
- `visual` — 視覺化生成（Gemini 圖片 → Claude SVG fallback）

**安全機制**：
1. 驗證 `sessionId` 是否 active（查 Supabase sessions 表）
2. API key 從 `Deno.env`（Supabase Secrets）讀取，不在程式碼裡
3. 所有對話自動寫入 `conversations` 表

---

## 六、資料庫 Schema

詳見 `backend/supabase/migrations/001_initial.sql`

| 表 | 用途 | 關鍵欄位 |
|---|---|---|
| `sessions` | 每次工作坊場次 | `join_code`, `status`, `config`(JSONB), `active_module_id` |
| `participants` | 學員（匿名） | `session_id`, `display_name`, `checkin_data`(JSONB), `memory`(JSONB) |
| `conversations` | 完整對話記錄 | `participant_id`, `role`, `content`, `content_type`, `metadata`(JSONB) |
| `modules` | 工作坊模組定義 | `session_id`, `seq`, `type`, `ai_config`(JSONB), `is_active` |
| `events` | 行為事件 log | `event_type`, `payload`(JSONB), `error_message` |

---

## 七、給 Claude Code 的具體任務指引

### 任務 A（P0）：接通 Supabase

在 `frontend/student.html` 的 `joinSession()` 中：
1. 呼叫 Supabase REST API 查詢 sessions 表，驗證 join_code
2. 取得 `config.ai_config.proxyUrl` 存入 `CONFIG.proxyUrl`

在 `completeCheckin()` 中：
3. 寫入 participants 表，取得 participantId

把 `callProxy()` 的 demoMode 分支改為：
4. 真正 fetch `CONFIG.proxyUrl`

加入 Realtime 訂閱：
5. 學員端訂閱 `sessions.active_module_id` 變更 → 自動切換模組畫面

### 任務 B（P1）：講師端 Realtime

6. 訂閱 `participants` INSERT → 格狀牆即時出現新學員
7. 訂閱 `conversations` INSERT → 學員卡片即時更新最後對話

### 任務 C：Edge Function 部署

```bash
# 設定 Secrets（只需一次）
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GEMINI_API_KEY=AIza...

# 部署
supabase functions deploy ai-proxy --no-verify-jwt

# 驗證
curl -X POST https://xxx.supabase.co/functions/v1/ai-proxy \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'
# 應回傳 {"pong":true,"ok":true}
```

### 不要做的事

- ❌ 不要重構成 Next.js（現在還不是時候）
- ❌ 不要讓學員端持有任何 API key
- ❌ 不要引入 Socket.IO（用 Supabase Realtime）
- ❌ 不要改變字卡系統設計（已定案）

---

## 八、對話過程中的關鍵轉折點

**轉折 1：從「問卷工具」到「活動中使用的 AI 工具」**
原始需求是做一個會後問卷，討論後認識到：L3 學習成效不靠問卷產生，而是靠在活動中設計有意義的認知摩擦。

**轉折 2：字卡從 check-in 裝飾到核心驅動資料**
字卡選擇驅動整個後續 AI 行為：角色扮演對手、討論切入點、反思方向。

**轉折 3：學員不應該持有 API key**
早期版本讓學員設定 key，後來改為：講師持有 → Supabase Secrets → Edge Function 代持。

**轉折 4：Nano Banana = Gemini 原生圖片生成**
Nano Banana 是 Google Gemini 圖片生成功能的品牌名稱，底層是 Gemini API，模型字串是 `gemini-2.5-flash-image`。

---

*最後更新：2026-04-15*
*版本：v0.3-prototype*
*原始設計者：Glen（Primax Group Digital Transformation Lead）*
*工具：Claude Sonnet 4.6（claude.ai）→ 交接給 Claude Code*
