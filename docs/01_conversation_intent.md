# 01 — 原始對話意圖與設計過程

> 這份文件記錄 WorkshopAI 從零到現在的完整思考過程。
> 目的是讓接手的開發者（或 Claude Code）理解每個設計選擇背後的「為什麼」。

---

## 起點：Glen 的原始問題

Glen 是 Primax Group 的 Group Digital Transformation Lead，同時是認證的 LEGO SERIOUS PLAY 和 BOX 引導師。

他的問題從這裡開始：

> 「如果我要製作一個可以在工作坊或教育訓練結束後有 AI 能力的問卷調查或回饋表，你覺得怎麼樣可以幫助使用者可以將學習成效提升到 Level 3 以上？」

### 第一輪的錯誤方向

第一個回應設計了一個四階段的問卷系統（報名前、活動中前段、活動中後段、活動後），重點放在「收集資料」和「行為追蹤」。

Glen 立刻指出問題：

> 「但你提了這些建議都是假設學員在工作坊或者是培訓中有意願且願意填寫這麼多文件或資料...我想要談的是更多可以在工作坊活動操作視覺化的工具或者是 AI 賦能的工具提升討論的有趣性豐富性跟跳脫框架的工具。」

### 關鍵認知轉移

**L3 不是靠問出來的，是靠設計出來的。**

從認知神經科學角度：學習成效取決於「認知重組」（cognitive restructuring）是否發生，需要：
1. 注意力激活（Attention）
2. 情緒標記（Emotional Tagging）← 傳統工具最忽略這步
3. 主動提取與重建（Active Retrieval）
4. 行為意圖連結（Behavioral Encoding）

AI 工具的槓桿點是**放大這些轉換節點**，而不是在最後加個問卷。

---

## 工具方向的演進

### 第一個方向：現有工具研究

研究了 2024-2025 年的工作坊 AI 工具生態：
- **Mentimeter / Slido / Wooclap**：即時投票、字詞雲、問答
- **Miro / Mural / Stormz**：視覺協作白板、AI 自動歸類
- **SessionLab**：工作坊設計器 + AI 追問生成
- **AI 角色扮演平台**：VirtualSpeech、Rehearsal

**Wooclap 的獨特性**：明確以認知科學為設計依據，AI 代理整理回答並生成追問。

**Stormz 的設計原則**（後來影響了字卡系統）：
- AI 生成的想法標記 🤖 符號，與人類想法視覺區隔
- 先讓學員生成想法，再讓 AI 提出不同視角
- 建議 facilitator 維護「AI 後台區」，避免認知超載

### 從工具選型到自建

Glen 的決定：不用現有工具，自建一個整合所有功能的工具。

**理由**：
1. 現有工具分散，無法串連報到 → 活動 → 反思的完整流程
2. 字卡選擇無法連動到後面的 AI 行為
3. 講師端無法即時看到每個學員的 AI 對話內容
4. 資料不存入自己的資料庫

---

## 字卡系統的設計邏輯

### 從「破冰工具」到「認知錨點」

字卡不是「讓大家選一個感覺來暖場」，而是：

**字卡選擇 = 學員在工作坊中的立場宣告 + AI 行為的驅動資料**

### 三維度設計

Glen 和我討論後確定了 HR & 總務 AI 轉型工作坊的 12 張字卡設計：

**維度 A：心理立場**（我現在在哪裡？）
- 🔭 觀望中 → AI 角色扮演對手：「催促轉型的主管」
- ⚡ 已在用了 → 對手：「質疑 AI 效果的同事」
- ⚖️ 半信半疑 → 對手：「過度樂觀的顧問」
- 🌊 被推著走 → 對手：「同樣不情願的同事」

**維度 B：工作現實**（我最在意的日常痛點）
- 📄 文件海 → 討論聚焦：流程自動化
- 💬 人心難測 → 聚焦：AI 輔助溝通
- 📊 數字壓力 → 聚焦：績效分析
- 🏛️ 規則叢林 → 聚焦：合規與治理

**維度 C：期待與恐懼**（最深的期待或擔心）
- 🔓 解放重複 → 反思方向：「解放後，你想做什麼？」
- 🍚 飯碗問題 → 練習：「如何表達恐懼而不被標籤」
- ✨ 品質提升 → 探索：「什麼是更好的決策品質？」
- ❓ 誰來負責 → 探索：AI 治理與責任框架

### 連動效果

```
學員選 🔭「觀望中」（維度 A）
    → AI 角色扮演自動配對「催促轉型的主管」
    → 練習：如何在被催的情況下表達真實擔憂

學員選 📄「文件海」（維度 B）
    → AI 生成追問聚焦在「什麼樣的文件處理讓你最崩潰？」
    → 視覺化請求時，概念圖重點放在流程節點

群體選擇分佈
    → 主持人看到「70% 選 B 維度，30% 選 C 維度」
    → AI 群體洞察自動提示：「今天的群體關注現實多於情緒」
```

---

## 介面設計的演進

### v1：單一 HTML 工具（workshop-ai-tool.html）

最初的版本把講師、學員、投影三個視角合在一個 HTML 裡，用 tab 切換。

**問題**：
- 學員手機體驗差（不是手機優先設計）
- API key 在前端暴露
- 三個視角需求差異太大，無法兼顧

### v2：兩個獨立介面

**學員端（student.html）**：
- 設計語言：溫暖有機（Instrument Serif + DM Sans，米白底色）
- 三個畫面流程：進入 → 報到 → AI 助理
- 手機優先：所有觸控目標 ≥ 44px，輸入框字體 ≥ 16px（防 iOS 縮放）
- 引導教學 overlay：進入工作坊後顯示，可隨時收合/展開
- **學員完全不需要設定任何東西**

**講師端（instructor.html）**：
- 設計語言：工業控制台（IBM Plex Mono + IBM Plex Sans TC，純黑底）
- 三欄佈局：模組設計器 ｜ 學員格狀監控 ｜ 詳情 + 洞察
- 測試按鈕：Claude Key 和 Gemini Key 各有獨立測試
- 寫入 Supabase：開始工作坊時把 config 寫入 sessions 表

---

## API Key 架構的演進

### v1 錯誤設計（已廢棄）

讓學員自己設定 API key，存在 localStorage。

**問題**：
- 安全風險：key 在 HTML 裡，任何人可以提取
- 體驗差：學員要去申請 key？完全不合理
- 不一致：每個學員的 key 可能不同

### v2 正確設計（現在的版本）

```
講師端 → 儲存 key 在 localStorage（只在講師電腦）
        → 開始工作坊時寫入 Supabase sessions.config（不含 key）
        
Supabase Secrets → 存放 ANTHROPIC_API_KEY 和 GEMINI_API_KEY
        
Edge Function（ai-proxy） → 從 Secrets 讀取 key
                          → 驗證 sessionId 合法性
                          → 呼叫 AI API
                          → 回傳結果給學員
                          
學員端 → 只送 sessionId + 對話內容
       → 永遠不知道任何 key
```

---

## 視覺化功能的演進

### v1：Placeholder（無用）
只是 `setTimeout` 模擬延遲，顯示靜態卡片。

### v2：Claude SVG（可用但非真實圖片）
Claude 根據對話脈絡生成 SVG 概念圖，直接 innerHTML 渲染。
優點：不需要額外 key，立刻可用。
缺點：不是真實圖片。

### v3：Gemini Nano Banana（真實圖片）+ Claude SVG（fallback）
- 有 Gemini key → 呼叫 `gemini-2.5-flash-image`，回傳 base64 圖片
- 無 Gemini key → Claude 生成 SVG

**Nano Banana 是什麼**：
Nano Banana 是 Google Gemini 原生圖片生成能力的品牌名稱（類比 OpenAI 的 DALL-E）。
三個模型：
- `gemini-2.5-flash-image`（Nano Banana，快速）
- `gemini-3.1-flash-image-preview`（Nano Banana 2，品質提升）
- `gemini-3-pro-image-preview`（Nano Banana Pro，最高品質）

**API 呼叫方式**：與 Gemini 文字 API 相同結構，只是 `responseModalities` 加入 `IMAGE`，回傳 inline base64 data。

---

*記錄人：Claude Sonnet 4.6*
*記錄日期：2026-04-15*
