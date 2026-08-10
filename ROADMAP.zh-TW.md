[English](./ROADMAP.md) | 繁體中文

# VVibe Skills — Roadmap

從外部 skill 目錄對照 VVibe 架構後，整理出的候選新 skill。
**狀態：候選清單，待團隊討論——目前皆未動工。**

來源：Snyk《Top 8 Claude skills for entrepreneurs, startup founders &
solopreneurs》
(<https://snyk.io/articles/top-8-claude-skills-entrepreneurs-startup-founders-solopreneurs>)，
2026-06-08 檢視。

## 怎樣算一個好的 VVibe skill

符合以下四點才值得進這個 repo：

1. **讀 Product Brain**——使用共用、agent 持有的產品語境，而不是每次動作都重新推導創作者的產品（見 `vvibe-product-brain`）。
2. **結果寫回 dashboard / API**——透過 `vibe_*` MCP 工具或 `VVIBE_API_KEY`，讓創作者在 VVibe dashboard 看到成果。
3. **服務 creator / vibe-coder 客群**——不是企業 IT，也不是投資人。
4. **與現有 skill 互補**，而非重疊。

## 現有 skills（脈絡參考）

已上線的 skill——完整說明見 [README.md](./README.md)：
`vvibe-analytics`、`vvibe-member`、`vvibe-sentry`、`vvibe-email`、
`vvibe-product-brain`、`vvibe-blog-writer`、`vvibe-blog-render`。

`vvibe-product-brain` 是上游餵料來源；所有產生文案的 skill 都先讀它。它的
SKILL.md 已預告 `conversion` 是規劃中的 consumer skill——下面好幾個候選就是在補這個接縫。

---

## 候選 skills（依優先序）

### P1 — `vvibe-conversion`（Landing Page Mastery）

**對應：** Snyk #6，*Landing Page Mastery*（高轉換 landing page + 100 點稽核）。

**為何最適合：** 補完 VVibe 已經走了大半的閉環。讀 Product Brain（brand voice /
audience / `forbidden_claims` 都已存在）→ 產生或稽核轉換頁 → 把轉換事件接進
`vvibe-analytics` → 把轉換分數寫回 dashboard。它是 `vvibe-email`（已在做 waitlist
landing page）的自然延伸。

**讀取：** Product Brain（voice、audience、FAQ、`forbidden_claims`）。
**寫入：** 轉換分數 / 稽核報告到 dashboard；搭配 `vvibe-analytics` 事件與
`vvibe-blog-render` 路由。

### P1 — VVibe 行銷套組（Corey Haines 模式）

**對應：** Snyk #1，*Marketing Skills by Corey Haines*（25 個互通的行銷 skill，共用一份「product marketing context」檔）。

**為何：** 他的「共用 product marketing context 檔」正是 Product Brain 的設計。一組讀
Brain 的行銷 skill（轉換文案、email 序列、定價）就是 `vvibe-product-brain`
當初要餵的接縫。範圍要收斂——先做 2–3 個最高價值的，而不是 25 個。

**讀取：** Product Brain。
**寫入：** 透過現有 skill（`vvibe-email`、`vvibe-blog-writer`）產出草稿 + dashboard。

### P2 — `vvibe-financials`（SaaS Financial Projections）

**對應：** Snyk #4，*SaaS Financial Projections*（MRR / ARR / LTV / CAC、估值倍數）。

**為何（以及護城河）：** 一般財務 skill 靠使用者自己填假設。VVibe 手上已有**真實**資料
——`vvibe-member` 訂閱狀態 + `vvibe-analytics` 流量——所以投影可以用**真實 MRR/ARR**
餵，而不是用猜的。這是沒有這份資料就 clone 不走的差異化。

**待團隊決議：** 這需要把 dashboard 指標（會員訂閱狀態、analytics）開放給 skill
讀取，是個架構決定——要讀什麼、透過哪個契約。

### P3 — 定位 / 訊息評分器（Wondelai 框架）

**對應：** Snyk #2，*Wondelai Product & Strategy*（JTBD / StoryBrand / Hook
Model + 評分）。

**為何：** 與其整套 clone 框架，不如用「評分」這個角度去**為 Product Brain 的定位段落打分並強化**
——等於是 `vvibe-product-brain` 產出的品質升級器。

### P3 — 顧客訪談分析（從 nginity 精選）

**對應：** Snyk #5，*nginity 48-skill library*（別整包 clone）。

**為何：** 唯一值得拿的是顧客訪談分析——萃取 pain point / 功能需求 / Jobs pattern，
並**回填 Product Brain 的 `growth_context`**。RICE 排序是次要選項。

### P4 — 募資 deck 產生器（利基）

**對應：** Snyk #3，*Anthropic PPTX*。

**為何低優先：** 投資人 deck 偏離 creator 核心，而且通用 PPTX skill 已存在。只有在用
**真實 dashboard 指標 + Product Brain** 作底（用真實數字而非杜撰）時，做 VVibe 版才有意義。

### 生態 — VVibe skill 鷹架（Skill Creator）

**對應：** Snyk #7，*Anthropic Skill Creator*。

**為何：** 不是給 creator 的，但 VVibe 是開源（`npx skills add`）。一個能產出符合
[PROVIDER.md](./PROVIDER.md) 與 Product Brain 契約的 skill 鷹架，能幫團隊與社群一致地擴充目錄。

---

## 已涵蓋

- **Snyk #8，*Snyk Fix*** → 已上線為 **`vvibe-sentry`**（orchestrates gitleaks /
  osv-scanner / semgrep + 回報 dashboard）。與 Snyk Fix 的唯一差距是自動修復——
  `vvibe-sentry` 是 read-only、不改動程式碼。**可能的強化：** opt-in 的 `fix`
  模式。（團隊決定——這歸在既有 skill，而非新 skill。）

## 核准後的建議建構順序

1. `vvibe-conversion`
2. VVibe 行銷套組
3. `vvibe-financials`（資料護城河那個——卡在指標開放的架構決議上）
