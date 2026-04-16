# WorkshopAI — 工作坊 AI 協作平台

> 讓每位學員從報到到結束都有專屬 AI 學習夥伴的工作坊引導工具

---

## 目錄

1. [這是什麼](#這是什麼)
2. [兩個介面](#兩個介面)
3. [快速開始（無後端版）](#快速開始無後端版)
4. [完整部署（含後端）](#完整部署含後端)
5. [資料庫結構](#資料庫結構)
6. [AI 設定說明](#ai-設定說明)
7. [工作坊流程設計](#工作坊流程設計)
8. [已知限制與開發路徑](#已知限制與開發路徑)
9. [技術棧總覽](#技術棧總覽)

---

## 這是什麼

WorkshopAI 是一套針對企業內部工作坊與培訓設計的 **AI 人機協作工具**，核心概念是：

- **學員端**：每位學員有自己的 AI 學習夥伴，從報到開始就有記憶，陪伴整個工作坊流程
- **講師端**：即時監控所有學員狀態、設計活動模組、推送任務、觸發 AI 群體洞察
- **AI 能力**：對話、角色扮演、想法視覺化（圖片生成）、整理收斂、個人反思回饋

目前設計情境為 **HR & 總務 AI 轉型思維工作坊**，但模組設計為可抽換，適用任何主題。

---

## 兩個介面

### `student.html` — 學員端（手機）

| 畫面 | 功能 |
|------|------|
| 進入畫面 | 輸入 6 碼課程代碼加入 |
| 報到畫面（3步） | 填名字 → 選字卡（12張，3個維度）→ 選能量狀態 |
| AI 助理主畫面 | 多輪對話、Artifact 圖片渲染、快速動作 chips |

**學員完成報到後，AI 夥伴會根據字卡選擇自動個人化：**
- 字卡 A（心理立場）→ 決定角色扮演的練習對手
- 字卡 B（工作現實）→ 個人化討論題目方向
- 字卡 C（期待或擔心）→ AI 助理引導的重點

---

### `instructor.html` — 講師 + 主持人端（桌機）

三欄佈局：

```
┌──────────────┬──────────────────────┬──────────────┐
│  左欄         │  中欄（主監控區）     │  右欄         │
│  模組設計器   │                      │  學員詳情     │
│  AI Agent設定 │  格狀學員牆          │  對話記錄     │
│  報到字卡設定 │  ──────────────────  │  AI 群體洞察  │
│              │  投影大螢幕模式       │  場次設定     │
│              │  ──────────────────  │              │
│              │  事件 Log            │              │
└──────────────┴──────────────────────┴──────────────┘
```

**頂部工具列**：
- 開始 / 結束工作坊
- 6碼課程代碼（點擊複製）
- 即時統計（在線人數 / 對話總數 / 活躍模組）
- 廣播訊息 / 群體洞察 / 投影模式切換

---

## 快速開始（無後端版）

> 兩個 HTML 檔案可以不需要後端直接用瀏覽器開啟，使用示範模式。

### Step 1：開啟講師端

```
直接用瀏覽器開啟 instructor.html
```

1. 頂部點擊「▶ 開始工作坊」
2. 複製畫面上的 6 碼課程代碼
3. 切換左欄 Tab → 「AI 設定」→ 填入 Anthropic API Key

### Step 2：開啟學員端（可用手機掃 QR Code）

```
直接用瀏覽器開啟 student.html
```

1. 輸入課程代碼
2. 完成三步報到
3. 開始與 AI 夥伴對話

> **示範模式**：未填 API Key 時，AI 回應由預設的情境感回應模擬，無需 API 也可展示完整流程。

### Step 3：講師操作

- **推送模組**：左欄點擊模組「▶ 推送」→ 學員端自動顯示當前任務卡
- **監控學員**：中欄格狀牆即時更新對話狀態
- **查看個別學員**：點擊任一學員卡片 → 右欄展開完整對話記錄 + AI 記憶
- **重置記憶**：學員卡片上「重置」按鈕，或右欄「場次設定」→ 重置所有
- **群體洞察**：頂部「🧠 群體洞察」→ AI 分析全體字卡選擇與對話摘要
- **投影模式**：頂部「📺 投影模式」→ 切換到詞雲 + 回應串流 + 熱圖的大螢幕視圖

---

## 完整部署（含後端）

> 需要即時多設備同步時，必須接 Supabase。

### 環境需求

- Supabase 專案（免費方案即可啟動 MVP）
- Anthropic API Key（Claude Sonnet）
- Gemini API Key（圖片生成，可選）
- 靜態網站託管（Vercel / Cloudflare Pages / GitHub Pages）

### Supabase 設定

**Step 1：建立資料表**

在 Supabase SQL Editor 執行以下 SQL：

```sql
-- 工作坊場次
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code    TEXT UNIQUE NOT NULL,
  host_id      TEXT,
  status       TEXT DEFAULT 'waiting',  -- waiting | active | ended
  config       JSONB DEFAULT '{}',      -- 全局設定、AI config
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  active_module_id TEXT
);

-- 學員
CREATE TABLE participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  checkin_data JSONB DEFAULT '{}',      -- picks, mood, roleHint
  memory       JSONB DEFAULT '{}',      -- AI 記憶，全 session 保留
  joined_at    TIMESTAMPTZ DEFAULT now(),
  last_active  TIMESTAMPTZ DEFAULT now(),
  is_active    BOOLEAN DEFAULT true
);

-- 對話記錄（完整 log）
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES sessions ON DELETE CASCADE,
  participant_id  UUID REFERENCES participants,
  module_id       TEXT,
  role            TEXT NOT NULL,        -- user | assistant | system
  content         TEXT,
  content_type    TEXT DEFAULT 'text',  -- text | image | artifact
  artifact_url    TEXT,
  metadata        JSONB DEFAULT '{}',   -- model, tokens, latency
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 行為事件 log
CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES sessions,
  participant_id  UUID REFERENCES participants,
  event_type      TEXT NOT NULL,
  payload         JSONB DEFAULT '{}',
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 工作坊模組定義
CREATE TABLE modules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions ON DELETE CASCADE,
  seq          INT NOT NULL,
  type         TEXT NOT NULL,
  title        TEXT,
  ai_config    JSONB DEFAULT '{}',      -- system_prompt, tools, model
  duration_min INT DEFAULT 15,
  is_active    BOOLEAN DEFAULT false
);

-- 索引
CREATE INDEX idx_conversations_session ON conversations(session_id, created_at);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_events_session ON events(session_id, created_at);
```

**Step 2：開啟 Realtime**

```sql
-- 讓這三張表支援即時訂閱
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
```

**Step 3：填入連線設定**

講師端 → 右欄 → 「場次設定」Tab：
- Supabase URL：`https://你的專案id.supabase.co`
- Supabase Anon Key：從 Supabase Dashboard > Settings > API 取得

學員端 HTML 頂部 `CONFIG` 物件：
```javascript
const CONFIG = {
  supabaseUrl: 'https://你的專案id.supabase.co',
  supabaseKey: '你的 anon key',
  demoMode: false,   // 關閉示範模式
};
```

---

## 資料庫結構

### `participants.memory` 欄位結構

每位學員的 AI 記憶儲存在這個 JSONB 欄位，在整個 session 期間持續更新：

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
    "key_insights": [
      "擔心 AI 出錯的責任歸屬",
      "文件自動化是最想解決的痛點"
    ],
    "unresolved_questions": [
      "AI 輔助決策出錯，HR 要負責嗎？"
    ]
  },
  "conversation_summary": "陳佳慧對 AI 轉型持觀望態度，主要痛點是文件處理，對責任歸屬有明顯疑慮。",
  "last_updated": "2026-04-15T10:23:00Z"
}
```

### `sessions.config` 欄位結構

```json
{
  "workshop_title": "HR AI 轉型思維工作坊",
  "welcome_message": "歡迎參加今天的工作坊",
  "ai_config": {
    "model": "claude-sonnet-4-20250514",
    "fallback_model": "ollama/llama3",
    "global_system_prompt": "你是一個 HR & 總務 AI 轉型工作坊的學習夥伴...",
    "tools_enabled": ["image_generation", "summarize", "roleplay"],
    "memory_strategy": "session",
    "temperature": 0.7,
    "max_tokens": 800
  },
  "checkin_cards": [
    { "emoji": "🔭", "word": "觀望中", "sub": "先看看再說", "dim": "A", "roleHint": "催促轉型的主管" }
  ]
}
```

---

## AI 設定說明

### 模型路由策略

| 情境 | 建議模型 | 原因 |
|------|----------|------|
| 一般對話 / 角色扮演 | `claude-sonnet-4-20250514` | 品質與速度平衡 |
| 快速回應（即時感需求高）| `claude-haiku-4-5-20251001` | 延遲低，適合角色扮演 |
| 圖片生成 | `gemini-imagen-3` / Stability AI | Claude 不生成圖片 |
| 隱私敏感內容 | `ollama/llama3`（本地）| 不出雲端 |
| 群體洞察分析 | `claude-sonnet-4-20250514` | 需要高品質推論 |

### System Prompt 設計原則

學員端 AI 夥伴的 System Prompt 由三層組成：

```
層一：全局人格（講師在 AI 設定中寫）
  → 定義 AI 夥伴的基本語氣、規則、限制

層二：記憶注入（自動從 participants.memory 讀取）
  → 注入學員的字卡選擇、能量狀態、已有洞察

層三：模組情境（講師在模組中寫）
  → 當前活動的具體引導方向
```

### 工具調用（Tools）

講師可在「AI 設定」Tab 啟用以下工具：

| 工具 | 觸發時機 | 呼叫的 API |
|------|----------|-----------|
| 🎨 圖片生成 | 學員說「視覺化」「畫出來」「圖片」 | Gemini Imagen / Stability AI |
| 📋 想法整理 | 學員說「幫我整理」「摘要」 | Claude（內建）|
| ⚡ 角色扮演 | 學員選擇「挑戰我」chip | Claude + 角色 system prompt |
| 🔍 網路搜尋 | 需要外部資料時 | 自建 proxy |
| 📊 數據分析 | 需要圖表時 | Claude + code execution |

---

## 工作坊流程設計

### 預設模組（HR AI 轉型主題）

| # | 類型 | 名稱 | 時間 | AI 行為 |
|---|------|------|------|---------|
| 1 | checkin | 學員報到 Check-in | 10分 | 引導選字卡，建立個人化記憶 |
| 2 | discussion | AI 焦慮開場討論 | 20分 | 探索真實感受，不評判，鼓勵說出擔憂 |
| 3 | roleplay | 困難對話練習 | 25分 | 扮演阻力角色，練習推進AI採用的溝通 |
| 4 | convergence | 想法收斂與整理 | 15分 | 協助整理關鍵洞察，形成行動計畫 |
| 5 | reflection | 個人行動承諾 | 10分 | 承諾一個具體改變，設定可測量指標 |

### 字卡三維度設計邏輯

字卡不只是 check-in 工具，它驅動後續整個流程：

```
維度 A（心理立場）→ 決定角色扮演的練習對手
  🔭 觀望中     → AI 扮演「催促轉型的主管」
  ⚡ 已在用了   → AI 扮演「質疑效果的同事」
  ⚖️ 半信半疑   → AI 扮演「過度樂觀的顧問」
  🌊 被推著走   → AI 扮演「同樣不情願的同事」

維度 B（工作現實）→ 個人化討論題目的切入點
  📄 文件海     → 聚焦流程自動化場景
  💬 人心難測   → 聚焦 AI 輔助溝通場景
  📊 數字壓力   → 聚焦績效分析場景
  🏛️ 規則叢林   → 聚焦合規與治理場景

維度 C（期待或擔心）→ AI 引導的深度反思方向
  🔓 解放重複   → 探索「解放後，你想做什麼？」
  🍚 飯碗問題   → 練習「如何表達恐懼而不被標籤」
  ✨ 品質提升   → 探索「什麼是更好的決策品質？」
  ❓ 誰來負責   → 探索 AI 治理與責任框架
```

---

## 已知限制與開發路徑

### 現在的限制

| 限制 | 影響 | 解決方向 |
|------|------|---------|
| 無後端時學員間不同步 | 講師看不到即時對話 | 接 Supabase Realtime |
| 圖片生成為 placeholder | 無法真正生成視覺化 | 接 Gemini Imagen API |
| API Key 在前端 | 生產環境不安全 | 建後端 proxy（Next.js API Route）|
| 無登入機制 | 講師端無身份驗證 | Supabase Auth |
| 記憶只存 localStorage | 重開瀏覽器消失 | 寫入 participants.memory |

### 建議開發順序

```
Phase 1（1-2週）：接通資料庫
  → 建 Supabase tables
  → 學員報到寫入 participants
  → 對話寫入 conversations
  → Realtime 訂閱讓講師端即時看到學員狀態

Phase 2（2-3週）：後端 proxy
  → Next.js API Route /api/ai/chat
  → API Key 移到伺服器端
  → 串流回應（SSE / ReadableStream）
  → 接 Gemini Imagen

Phase 3（3-4週）：進階功能
  → 講師端模組推送 → Realtime 觸發學員端切換
  → 記憶定期 summarize（防 context 過長）
  → 場次結束後的完整報告生成
  → 多語言支援（台灣中文 + 英文）
```

---

## 技術棧總覽

### 當前（純前端）

```
student.html      手機端 HTML/CSS/JS（vanilla）
instructor.html   桌機端 HTML/CSS/JS（vanilla）
Claude API        直接從前端呼叫（demo 用，生產需 proxy）
```

### 建議生產架構

```
前端
  Next.js 14 App Router
  /app/join/[code]      → student.html 的 React 版本
  /app/host/[id]        → instructor.html 的 React 版本
  Tailwind CSS + shadcn/ui

後端
  Next.js API Routes
  /api/ai/chat          → Claude 代理（stream）
  /api/ai/image         → Gemini Imagen 代理
  /api/sessions/[id]    → 場次控制

資料庫
  Supabase PostgreSQL   → 資料存儲
  Supabase Realtime     → WebSocket 即時同步
  Supabase Storage      → 生成圖片存放

部署
  Vercel                → 前端 + API Routes
  Supabase              → DB + Realtime + Storage
```

### 核心依賴版本

| 套件 | 版本 | 用途 |
|------|------|------|
| @anthropic-ai/sdk | ^0.30 | Claude API |
| @supabase/supabase-js | ^2.45 | 資料庫 + Realtime |
| next | 14.x | 全端框架 |
| tailwindcss | ^3.4 | 樣式 |

---

## 授權與聯絡

此工具目前為 Primax Group DTO 內部開發原型。

如需協助整合 Supabase 或部署至生產環境，請聯絡 Glen（Group Digital Transformation Lead）。

---

*最後更新：2026-04-15*
*版本：v0.3-prototype（雙端分離版）*
