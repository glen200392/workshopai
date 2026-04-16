# 06 — 驗收測試清單

> 這份清單是完整驗收的標準。所有項目通過才算「生產就緒」。
> 每個項目旁邊有測試方法，不靠人工目視，用具體操作驗證。

---

## TIER 0：本機 Demo 模式（無需後端，現在就能跑）

在瀏覽器直接開啟 `frontend/student.html`，不需要任何設定。

- [ ] **T0-1**：開啟 student.html，看到 WorkshopAI 進入畫面（米白底色，有光暈）
- [ ] **T0-2**：輸入任意代碼（如 `TEST`），點「進入工作坊」→ 進入報到步驟 1（填名字）
- [ ] **T0-3**：填名字後繼續 → 步驟 2 顯示 12 張字卡，分三個維度
- [ ] **T0-4**：選 2 張字卡（選第 3 張時自動取消第 1 張）
- [ ] **T0-5**：繼續 → 步驟 3 顯示 5 個能量按鈕，選一個
- [ ] **T0-6**：點「完成報到」→ 進入 AI 助理畫面
- [ ] **T0-7**：引導教學 overlay 出現，顯示 5 個功能說明卡片
- [ ] **T0-8**：點「了解了，開始吧 →」→ overlay 動畫收起，右下角出現 `?` FAB
- [ ] **T0-9**：點 `?` FAB → overlay 重新出現
- [ ] **T0-10**：AI 開場白出現，**包含學員的名字和字卡選擇**（個人化確認）
- [ ] **T0-11**：在對話框輸入文字 → 出現三點 thinking 動畫 → Demo 模式回應出現
- [ ] **T0-12**：點「🎨 視覺化」action chip → 輸入框出現預設文字 → 發送 → 出現示範 SVG 概念圖
- [ ] **T0-13**：點「⚡ 挑戰我」→ 輸入框出現角色扮演提示文字
- [ ] **T0-14**：刷新頁面，重新輸入同一代碼 → **不會重複報到**（localStorage 記憶身份）
- [ ] **T0-15**：點「使用示範模式體驗」→ 自動填入 DEMO01 並進入

開啟 `frontend/instructor.html`：

- [ ] **T0-16**：開啟後自動生成 6 碼代碼顯示在頂部
- [ ] **T0-17**：Demo 資料 1.5 秒後自動載入（5 位學員卡片出現）
- [ ] **T0-18**：點學員卡片 → 右欄出現完整對話記錄和字卡資訊
- [ ] **T0-19**：頂部「📺 投影模式」→ 中欄切換到詞雲 + 熱圖視圖
- [ ] **T0-20**：左欄「AI 設定」Tab → 可以看到兩個 Key 輸入框和測試按鈕
- [ ] **T0-21**：左欄「模組」Tab → 點「▶ 推送」→ 該模組標記為「進行中」
- [ ] **T0-22**：右欄「AI 洞察」Tab → 輸入問題 → 點執行 → 示範模式回傳預設洞察
- [ ] **T0-23**：右欄「場次設定」→ 「↓ 匯出場次記錄」→ 下載 JSON 檔案

---

## TIER 1：後端串接（需要 Supabase 和 Anthropic API Key）

### 1-A 部署驗證

```bash
# 執行後端部署
cd backend
supabase link --project-ref YOUR_PROJECT_ID
supabase db push
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GEMINI_API_KEY=AIza...   # 選用
supabase functions deploy ai-proxy --no-verify-jwt
```

- [ ] **T1-1**：`supabase db push` 執行成功，無報錯
- [ ] **T1-2**：Supabase Dashboard → Table Editor → 看到 5 張表（sessions, participants, conversations, modules, events）
- [ ] **T1-3**：`curl -X POST https://xxx.supabase.co/functions/v1/ai-proxy -H "Content-Type: application/json" -d '{"type":"ping"}'` → 回傳 `{"pong":true,"ok":true}`

### 1-B 講師端設定

在 instructor.html 的右欄「場次設定」填入：
- Supabase URL
- Supabase Anon Key

在左欄「AI 設定」填入：
- Anthropic API Key

- [ ] **T1-4**：點「測試」（Claude Key）→ 顯示綠色「✓ 連線正常」
- [ ] **T1-5**：點「儲存 AI 設定」→ Toast 出現「✓ AI 設定已儲存」
- [ ] **T1-6**：刷新講師頁面 → Key 狀態仍顯示「已儲存」（localStorage 持久化）
- [ ] **T1-7**：場次設定 → 點「⟳ 檢查 Proxy 連線」→ 顯示「✓ Edge Function 運作正常」

### 1-C 場次建立流程

- [ ] **T1-8**：點「▶ 開始工作坊」→ 頂部代碼變成可複製狀態，狀態點變綠並閃爍
- [ ] **T1-9**：Supabase Dashboard → sessions 表 → 出現一筆 status=active 的記錄
- [ ] **T1-10**：sessions 記錄的 `config.ai_config.proxyUrl` = 正確的 Edge Function URL
- [ ] **T1-11**：sessions 記錄的 `config` **不包含任何 API key**（驗證 key 不洩漏）

### 1-D 學員端串接

在 student.html 的 `CONFIG` 填入 supabaseUrl 和 supabaseKey，`demoMode: false`

- [ ] **T1-12**：輸入講師端顯示的代碼 → 看到工作坊名稱出現（從 Supabase 讀取）
- [ ] **T1-13**：完成報到 → Supabase participants 表出現一筆新記錄
- [ ] **T1-14**：participants 記錄包含：display_name、checkin_data（picks + mood）、memory.profile
- [ ] **T1-15**：**講師端格狀牆即時出現學員卡片**（Realtime 測試）
- [ ] **T1-16**：刷新學員頁面，重新輸入代碼 → **直接進入 AI 助理畫面**（不重複報到，localStorage `_pid_CODE` 恢復身份）

### 1-E AI 對話流程

- [ ] **T1-17**：學員輸入訊息 → thinking 動畫 → **真正的 Claude 回應**出現（非 demo 預設回應）
- [ ] **T1-18**：Supabase conversations 表 → 出現 role=user 和 role=assistant 兩筆記錄
- [ ] **T1-19**：**講師端即時看到學員的對話**（Realtime conversations 訂閱）
- [ ] **T1-20**：學員說「幫我畫出來」或點「🎨 視覺化」→ 生成中 spinner 出現 → 圖片/SVG 出現
  - 有 Gemini Key：應出現真實圖片（base64 img 標籤，非 SVG）
  - 無 Gemini Key：應出現 SVG 概念圖（非靜態 demo SVG，而是根據對話內容生成）

### 1-F 講師控制功能

- [ ] **T1-21**：講師推送「模組 2」→ 學員端**自動出現任務卡**「AI 焦慮開場討論」（Realtime sessions 訂閱）
- [ ] **T1-22**：Supabase sessions 表 → `active_module_id` 欄位更新為對應模組 ID
- [ ] **T1-23**：講師點「AI 群體洞察」→ 填入問題 → 收到真正的 Claude 分析（非示範文字）
- [ ] **T1-24**：講師點學員卡片的「重置」→ Supabase participants 表 → memory.conversation_summary 變成空字串
- [ ] **T1-25**：講師點「■ 結束」→ Supabase sessions.status 變成 `ended`
- [ ] **T1-26**：場次結束後匯出 JSON → 包含所有學員的 picks、messages、memory

---

## TIER 2：多人同場壓力測試（需要 ≥ 3 台設備）

- [ ] **T2-1**：3 台手機同時報到 → 講師端格狀牆即時出現 3 張卡片，順序正確
- [ ] **T2-2**：3 位學員同時對話 → 不互相干擾，各自的 AI 夥伴記得各自的字卡
- [ ] **T2-3**：講師推送模組 → 3 台手機**同時出現**任務卡（Realtime 廣播）
- [ ] **T2-4**：講師廣播訊息 → Supabase sessions.config.broadcast 更新，3 台手機下次對話時 AI 會提到廣播內容
- [ ] **T2-5**：一位學員斷線重連 → 對話歷史透過 localStorage 恢復，不重複報到

---

## TIER 3：手機體驗細節

在真實手機（iOS + Android 各一）上執行：

- [ ] **T3-1**：iPhone 瀏海不被 UI 遮擋（safe-area insets 正確）
- [ ] **T3-2**：輸入框獲焦時，鍵盤彈出，對話區域自動上移（不被鍵盤遮住）
- [ ] **T3-3**：輸入中文時無自動縮放（font-size ≥ 16px 確認）
- [ ] **T3-4**：字卡選擇的觸控目標夠大（≥44px，不需要精確點擊）
- [ ] **T3-5**：橫屏旋轉 → UI 不崩版，dvh 重新計算
- [ ] **T3-6**：iOS Safari：滾動對話區時不觸發頁面彈跳（overscroll-behavior: contain）
- [ ] **T3-7**：Enter 鍵送出訊息，Shift+Enter 換行

---

## 已知的非阻塞問題（可接受，記錄備查）

| 編號 | 問題 | 影響 | 計畫處理 |
|---|---|---|---|
| K-01 | 記憶沒有自動壓縮（每 6 輪 summarize）| 20 輪後 system prompt 略大 | P1.1 |
| K-02 | SVG 生成 max_tokens 是 2000，複雜圖可能被截斷 | SVG 不完整時改用文字 | 改 3000 |
| K-03 | 廣播只更新 sessions.config，學員需下次對話才感知 | 即時感略差 | 可改 Supabase Realtime channel broadcast |
| K-04 | pushToUser 用 conversations role=system 實作，學員需下次呼叫 AI 才感知 | 即時感略差 | 未來改 Realtime 直接觸發 |
| K-05 | 無 Auth，任何人知道代碼都能加入 | 工作坊場景可接受 | P2 加 PIN 二次驗證 |
| K-06 | demoMode 分支留在生產程式碼 | 無安全風險，有功能分叉 | 部署時確認 demoMode: false |

---

## 驗收簽核

| Tier | 項目數 | 通過條件 |
|---|---|---|
| TIER 0 | 23 項 | 全部通過才能進行 TIER 1 |
| TIER 1 | 26 項 | 全部通過才算後端完成 |
| TIER 2 | 5 項 | 多人場景驗收 |
| TIER 3 | 7 項 | 手機體驗驗收 |

全部 61 項通過 = **生產就緒（Production Ready）**

---

*最後更新：2026-04-15*
*版本：v0.5*
