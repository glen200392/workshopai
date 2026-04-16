# 05 — 下一步開發優先級

> 給 Claude Code 的明確任務清單，依優先級排序

---

## 當前狀態（v0.3）

✅ 完成的：
- 學員端完整 UI（報到 3 步驟 + AI 助理主畫面）
- 講師端完整 UI（三欄佈局 + 所有控制功能）
- AI proxy Edge Function（Claude 對話 + Gemini 圖片 + SVG fallback）
- Supabase Schema 設計
- Key 安全架構（學員端無 key）
- 示範模式（demoMode: true，無後端也能展示）
- 引導教學 overlay
- 投影大螢幕模式

⏳ 尚未完成的：
- Supabase 真正接通（目前是 stub）
- Realtime 訂閱（目前學員端不會即時收到模組推送）
- Edge Function 實際部署
- 場次結束後的完整記錄匯出

---

## P0：核心串接（本週必做）

### P0.1 接通 Supabase（student.html）

**檔案**：`frontend/student.html`

**任務 1**：`joinSession()` 改為真正查詢 sessions 表

```javascript
async function joinSession() {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if(code.length < 4) { showToast('請輸入課程代碼'); return; }

  // 查詢 Supabase
  const res = await fetch(
    `${CONFIG.supabaseUrl}/rest/v1/sessions?join_code=eq.${code}&status=eq.active&select=id,config`,
    { headers: { 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` }}
  );
  const data = await res.json();
  if(!data.length) { showToast('找不到此代碼，請確認後再試'); return; }

  const session = data[0];
  S.sessionId = session.id;
  S.joinCode = code;
  S.sessionConfig = session.config;

  // 從 session config 注入 proxy URL
  CONFIG.proxyUrl = session.config?.ai_config?.proxyUrl || '';
  CONFIG.demoMode = !CONFIG.proxyUrl;

  renderCheckinStep(1);
  showScreen('screen-checkin');
}
```

**任務 2**：`completeCheckin()` 改為寫入 participants 表

```javascript
async function completeCheckin() {
  // ... 建構 memory ...

  if(CONFIG.supabaseUrl && S.sessionId) {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        session_id: S.sessionId,
        display_name: S.name,
        checkin_data: { picks: S.picks, mood: S.mood },
        memory: S.memory,
      })
    });
    const data = await res.json();
    S.participantId = data[0]?.id;
    // 存入 localStorage（刷新頁面後保持身份）
    localStorage.setItem('_pid', S.participantId);
    localStorage.setItem('_sid', S.sessionId);
  }

  initSession();
  showScreen('screen-session');
}
```

**任務 3**：`callProxy()` 移除 demoMode 分支，改為實際 fetch

```javascript
async function callProxy(type, payload) {
  if(!CONFIG.proxyUrl) {
    // demoMode fallback
    return { demo: true };
  }
  const res = await fetch(CONFIG.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      sessionId: S.sessionId,
      participantId: S.participantId,
      ...payload
    })
  });
  if(!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`);
  return res.json();
}
```

---

### P0.2 Realtime 訂閱（student.html）

在 `initSession()` 後加入：

```javascript
function subscribeToSession() {
  if(!CONFIG.supabaseUrl || !S.sessionId) return;

  // 動態載入 supabase-js（避免增加 HTML 大小）
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload = () => {
    const sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

    // 監聽模組推送
    sb.channel('session:' + S.sessionId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'sessions',
        filter: `id=eq.${S.sessionId}`
      }, payload => {
        const newModuleId = payload.new.active_module_id;
        if(newModuleId && newModuleId !== S.activeModule) {
          S.activeModule = newModuleId;
          fetchAndShowModule(newModuleId);
        }
      })
      .subscribe();
  };
  document.head.appendChild(script);
}

async function fetchAndShowModule(moduleId) {
  // 從 session config 找到對應模組
  const module = (S.sessionConfig?.modules || []).find(m => m.id === moduleId);
  if(!module) return;

  document.getElementById('moduleBadge').textContent = module.name;
  addMessage('task', { title: module.name, desc: module.prompt }, 'task');
  addMessage('ai', `講師剛推送了新活動：「${module.name}」。${module.prompt}`);
}
```

---

### P0.3 Realtime（instructor.html）

在 `startSession()` 後加入：

```javascript
function subscribeToRealtime() {
  if(!S.supabaseUrl || !S.sessionId) return;

  const sb = supabase.createClient(S.supabaseUrl, S.supabaseKey);

  // 新學員報到
  sb.channel('participants:' + S.sessionId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'participants',
      filter: `session_id=eq.${S.sessionId}`
    }, payload => {
      const p = payload.new;
      const checkin = p.checkin_data || {};
      S.participants.push({
        id: p.id,
        name: p.display_name,
        picks: checkin.picks || [],
        mood: checkin.mood || '',
        joinedAt: new Date(p.joined_at).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit'}),
        isActive: true,
        messages: [],
        memory: p.memory || {},
      });
      renderParticipants(S.participants);
      addLog('checkin', `${p.display_name} 已報到`, 'participant');
    })
    .subscribe();

  // 學員新訊息
  sb.channel('conversations:' + S.sessionId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'conversations',
      filter: `session_id=eq.${S.sessionId}`
    }, payload => {
      const c = payload.new;
      const p = S.participants.find(p => p.id === c.participant_id);
      if(p) {
        p.messages.push({ role: c.role, content: c.content });
        renderParticipants(S.participants);
        // 如果目前選中這個學員，更新右欄
        if(S.selectedParticipant?.id === c.participant_id) {
          showParticipantDetail(p);
        }
      }
    })
    .subscribe();
}
```

---

## P1：完善體驗（下週）

### P1.1 記憶持久化

當對話達到一定長度（每 5-6 輪），自動總結並更新 `participants.memory`：

```javascript
async function updateParticipantMemory() {
  if(S.messages.length % 6 !== 0) return; // 每 6 輪更新一次

  const summaryResult = await callProxy('chat', {
    systemPrompt: '你是記憶摘要助手，請將以下對話整理成 2-3 句摘要，保留關鍵洞察和未解問題。只輸出摘要文字。',
    messages: S.messages.slice(-6).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content
    }))
  });

  if(summaryResult.text && CONFIG.supabaseUrl) {
    S.memory.conversation_summary = summaryResult.text;
    S.memory.last_updated = new Date().toISOString();

    await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/participants?id=eq.${S.participantId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
        },
        body: JSON.stringify({ memory: S.memory })
      }
    );
  }
}
```

### P1.2 講師「重置記憶」真正生效

目前只是前端重置，需要也更新 Supabase：

```javascript
async function resetMemory(e, id) {
  e?.stopPropagation();
  const p = S.participants.find(p => p.id === id);
  if(!confirm(`確定要重置 ${p?.name} 的 AI 記憶？`)) return;

  const emptyMemory = {
    profile: p.memory?.profile,
    learning_state: { visited_modules: [], key_insights: [], unresolved_questions: [] },
    conversation_summary: '',
    last_updated: new Date().toISOString(),
  };

  if(S.supabaseUrl) {
    await fetch(`${S.supabaseUrl}/rest/v1/participants?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': S.supabaseKey,
        'Authorization': `Bearer ${S.supabaseKey}`,
      },
      body: JSON.stringify({ memory: emptyMemory })
    });
  }

  if(p) p.memory = emptyMemory;
  renderParticipants(S.participants);
  showToast('↺ 記憶已重置');
}
```

### P1.3 場次結束時批量儲存

`endSession()` 後觸發：
- 更新 sessions.status = 'ended'
- 批量 upsert 所有參與者的最終 memory
- 生成場次摘要報告（Claude 分析）

---

## P2：Nice-to-have（之後）

### P2.1 角色扮演追蹤
把角色扮演的對話標記在 conversations.metadata，方便後續分析。

### P2.2 講師端圖表
場次結束後，顯示：
- 字卡選擇分佈圓餅圖
- 對話量時間軸
- 關鍵詞 TF-IDF 分析

### P2.3 學員反思報告
場次結束時，自動生成每位學員的個人反思 PDF：
- 字卡選擇 + 對應洞察
- 關鍵對話摘要
- AI 給的行動建議

### P2.4 Next.js 重構
當以下任一條件達成時考慮：
- 需要 SSR 或 Server Components
- 需要完整的路由系統（/join/[code]、/host/[id]）
- 需要更複雜的狀態管理

---

## 技術債清單

| 項目 | 風險 | 處理時間 |
|---|---|---|
| vanilla JS 沒有型別 | 中（容易出現 undefined 錯誤）| P2 時用 JSDoc 或 TS 重構 |
| 兩個 HTML 無法共用元件 | 低（目前是 prototype）| Next.js 重構時解決 |
| demoMode 分支會留在生產程式碼 | 低（有 CONFIG.demoMode flag）| 部署時設 false |
| localStorage key 命名不統一 | 低 | 整理成常數 |

---

*最後更新：2026-04-15*
