# 04 — API 介面定義

## Edge Function：ai-proxy

**Endpoint**：`POST {supabaseUrl}/functions/v1/ai-proxy`

所有請求必須包含 `sessionId`（除了 ping），Edge Function 會驗證 session 是否 active。

---

### type: ping（健康檢查）

**Request**：
```json
{ "type": "ping" }
```

**Response**：
```json
{ "pong": true, "ok": true, "timestamp": "2026-04-15T10:00:00Z" }
```

---

### type: chat（Claude 對話）

**Request**：
```json
{
  "type": "chat",
  "sessionId": "uuid",
  "participantId": "uuid",
  "systemPrompt": "你是...",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response**：
```json
{ "text": "AI 回應內容" }
```

**Error**：
```json
{ "error": "Invalid or inactive session" }
```

---

### type: visual（視覺化生成）

**Request**：
```json
{
  "type": "visual",
  "sessionId": "uuid",
  "participantId": "uuid",
  "userPrompt": "幫我畫出 AI 轉型的阻力圖",
  "convoContext": "學員：...AI：...",
  "picks": ["🔭 觀望中", "📄 文件海"],
  "mood": "💡 好奇",
  "systemPrompt": "..."
}
```

**Response（Gemini 真實圖片）**：
```json
{
  "type": "image",
  "base64": "iVBORw0KGgo...",
  "mimeType": "image/png",
  "followUp": "這張圖生成完成了。你覺得..."
}
```

**Response（Claude SVG fallback）**：
```json
{
  "type": "svg",
  "svg": "<svg viewBox='0 0 400 280'>...</svg>",
  "followUp": "概念圖生成完成。這個結構有反映出..."
}
```

---

## Supabase REST API

### 驗證 join_code

```
GET /rest/v1/sessions?join_code=eq.{code}&status=eq.active&select=id,config
Headers:
  apikey: {anon_key}
  Authorization: Bearer {anon_key}
```

### 建立 participant

```
POST /rest/v1/participants
Headers:
  apikey: {anon_key}
  Authorization: Bearer {anon_key}
  Content-Type: application/json
  Prefer: return=representation
Body:
  {
    "session_id": "uuid",
    "display_name": "陳佳慧",
    "checkin_data": { "picks": [...], "mood": "..." },
    "memory": { "profile": {...}, "learning_state": {...} }
  }
```

### 更新 participant memory

```
PATCH /rest/v1/participants?id=eq.{participantId}
Body:
  { "memory": {...}, "last_active": "2026-04-15T10:00:00Z" }
```

### 建立 session

```
POST /rest/v1/sessions
Body:
  {
    "join_code": "ABC123",
    "status": "active",
    "config": { "workshop_title": "...", "ai_config": {...} },
    "started_at": "2026-04-15T09:00:00Z"
  }
```

---

## Supabase Realtime 頻道

### 學員訂閱：模組推送

```javascript
supabase.channel('session:' + sessionId)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'sessions',
    filter: `id=eq.${sessionId}`
  }, handler)
  .subscribe()
```

觸發條件：`sessions.active_module_id` 欄位被更新（講師點「推送模組」時）

### 講師訂閱：新學員

```javascript
supabase.channel('participants:' + sessionId)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'participants',
    filter: `session_id=eq.${sessionId}`
  }, handler)
  .subscribe()
```

### 講師訂閱：學員對話更新

```javascript
supabase.channel('conversations:' + sessionId)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'conversations',
    filter: `session_id=eq.${sessionId}`
  }, handler)
  .subscribe()
```
