-- ═══════════════════════════════════════════════════════════════
-- WorkshopAI — Supabase 初始化 Migration
-- 執行方式：在 Supabase SQL Editor 貼上執行，或：
--   supabase db push
-- ═══════════════════════════════════════════════════════════════

-- ── 工作坊場次 ──
CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code         TEXT UNIQUE NOT NULL,
  host_id           TEXT,
  status            TEXT NOT NULL DEFAULT 'waiting',
  -- status: waiting | active | ended
  config            JSONB NOT NULL DEFAULT '{}',
  -- config 結構見 docs/02_architecture_decisions.md ADR-004
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  active_module_id  TEXT,
  -- 講師推送的當前模組 ID，Realtime 訂閱此欄位觸發學員端切換
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 學員（匿名，不需帳號）──
CREATE TABLE IF NOT EXISTS participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  checkin_data  JSONB NOT NULL DEFAULT '{}',
  -- checkin_data: { picks: [], mood: '', roleHint: '' }
  memory        JSONB NOT NULL DEFAULT '{}',
  -- memory 結構見 CLAUDE.md 六、資料庫 Schema
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN NOT NULL DEFAULT true
);

-- ── 對話記錄（完整 log，append-only）──
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id  UUID REFERENCES participants(id),
  module_id       TEXT,
  role            TEXT NOT NULL,
  -- role: user | assistant | system
  content         TEXT,
  content_type    TEXT NOT NULL DEFAULT 'text',
  -- content_type: text | image | artifact | svg
  artifact_url    TEXT,
  -- 若為圖片，存 Supabase Storage URL（base64 不存在這裡）
  metadata        JSONB NOT NULL DEFAULT '{}',
  -- metadata: { model, input_tokens, output_tokens, latency_ms }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 工作坊模組定義 ──
CREATE TABLE IF NOT EXISTS modules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq          INT NOT NULL,
  type         TEXT NOT NULL,
  -- type: checkin | discussion | roleplay | convergence | reflection | survey
  title        TEXT,
  ai_config    JSONB NOT NULL DEFAULT '{}',
  -- ai_config: { system_prompt, tools, model, max_turns, temperature }
  duration_min INT NOT NULL DEFAULT 15,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 行為事件 log ──
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES sessions(id),
  participant_id  UUID REFERENCES participants(id),
  event_type      TEXT NOT NULL,
  -- event_type: checkin | module_start | module_end | message_sent
  --             visual_generated | roleplay_start | session_end | error
  payload         JSONB NOT NULL DEFAULT '{}',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════
-- Indexes
-- ════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sessions_join_code
  ON sessions(join_code);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status);

CREATE INDEX IF NOT EXISTS idx_participants_session
  ON participants(session_id);

CREATE INDEX IF NOT EXISTS idx_conversations_session
  ON conversations(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_participant
  ON conversations(participant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_events_session
  ON events(session_id, created_at);

-- ════════════════════════════
-- Realtime（讓這些表支援即時訂閱）
-- ════════════════════════════

-- 注意：Supabase 預設已啟用 Realtime，但需要手動加到 publication
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- ════════════════════════════
-- Row Level Security（RLS）
-- ════════════════════════════

-- 目前為 prototype，暫時關閉 RLS（生產環境需要開啟）
-- 學員端只使用 anon key + session 驗證（在 Edge Function 中）
ALTER TABLE sessions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants  DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE modules       DISABLE ROW LEVEL SECURITY;
ALTER TABLE events        DISABLE ROW LEVEL SECURITY;

-- 生產環境 RLS policy（TODO：在 P2 階段實作）
-- CREATE POLICY "學員只能讀自己的 session"
--   ON sessions FOR SELECT
--   USING (status = 'active');
--
-- CREATE POLICY "學員只能寫自己的 participant"
--   ON participants FOR INSERT
--   WITH CHECK (true);  -- Edge Function 負責驗證

-- ════════════════════════════
-- Sample Data（開發測試用）
-- ════════════════════════════

-- 插入示範 session（可選，用於本地開發）
-- INSERT INTO sessions (join_code, status, config) VALUES (
--   'DEMO01',
--   'active',
--   '{
--     "workshop_title": "HR AI 轉型思維工作坊（示範）",
--     "ai_config": {
--       "claudeModel": "claude-sonnet-4-20250514",
--       "geminiModel": "gemini-2.5-flash-image",
--       "globalPrompt": "你是 HR AI 轉型工作坊的學習夥伴。",
--       "tools": ["image", "summarize", "roleplay"],
--       "memoryStrategy": "session",
--       "proxyUrl": "http://localhost:54321/functions/v1/ai-proxy"
--     }
--   }'
-- );
