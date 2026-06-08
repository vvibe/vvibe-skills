[English](./POSITIONING.md) | 繁體中文

# VVibe Skills — 定位與競爭地景

VVibe 在 2026 年 Claude-skills／AI-backend 市場裡的位置，以及該守住的利基。本文是
[ROADMAP.md](./ROADMAP.md) 的配套——roadmap 決定**要做什麼**，本文解釋**為何是這些而非別的**。

**狀態：策略筆記，待團隊討論。** 2026-06-08 研究。
下方的兩戰線框架與 kill-shots 經過一次 deep-research 查證（22 來源、萃取 105 個論點、
25 個經對抗式查證 → 18 確認／7 推翻）。凡是查證**推翻**了先前假設之處都就地標註——
**這些修正是本文最重要的部分。**

## 核心論點

VVibe 沒有一個正面、做一模一樣事情的對手。它被兩側夾擊——**純 prompt skill 包**
（有行銷智能、零後端）與 **vibe-coder 的 AI-native 後端**（有後端、零變現智能）。VVibe
的利基就是這兩者的**交集**，而那個象限目前幾乎沒人佔。**查無任何對手位於 VVibe 的確切交叉點**
（agent-native × 真實第一方資料 × 變現/行銷智能 × 持久記憶）——但這是「無證據之證明」、
市場變動快且未窮舉，無法完全排除潛行者。

## 兩條競爭戰線

### 戰線 A — 純 prompt skill 包

撞 VVibe 的 blog／conversion／行銷面。

- Corey Haines [`marketingskills`](https://github.com/coreyhaines31/marketingskills)
  （34 個；skills.sh 上單一 skill 6–10 萬安裝）、
  [OpenClaudia](https://github.com/OpenClaudia/openclaudia-skills)（34 個）、
  [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)（337 個）、
  [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills)（160+ SEO）、
  [emotixco/claude-skills-founder](https://dev.to/emotixco/12-claude-code-skills-for-startup-founders-open-source-4lib)
  （12 個），以及 Wondelai、nginity、Landing Page Mastery。
- 生態**自 2026 年 1 月翻三倍、合計 80K+ stars**。
- **共同弱點——已確認無狀態。** [Composio 2026 編目](https://composio.dev/content/best-marketing-skills)
  說 skill 是「markdown 的可重用指令包」、「無法連到 app 就不完整」（要靠外部 MCP 才有即時資料），
  並把 29 個分散於 13 類的 skill 描述為「各自獨立、**不是一個整合產品**」。Anthropic 官方文件也證實
  skill 是無原生持久性的檔案包。它們每次重新推導產品、無法追蹤成效、不能動真實數據——**而且地景碎片化，不存在單一整合對手。**

### 戰線 B — vibe-coder 的 AI-native 後端

架構上最像的對手。

- **[Butterbase](https://butterbase.ai/)** — 「Backend for Vibe Coders」：
  Postgres／auth／REST+GraphQL／realtime／AI-gateway，透過 MCP 接 Claude Code／Cursor／
  Codex／Windsurf／Copilot。**確認：沒有行銷／SEO／內容／變現智能層**——唯一的行銷/變現觸點是
  app *範本*（email 序列 recipe、Stripe marketplace recipe）；「analytics」是自建 KPI dashboard。
- **[InsForge](https://insforge.dev)**（[YC launch](https://www.ycombinator.com/launches/QP6-insforge-the-backend-platform-for-ai-native-developers)）
  — 「AI-native 開發者的後端平台」、agent 為「主要操作者」。Stripe checkout/訂閱被定位為金流管線，不是變現策略。
- Supabase／Convex／Firebase — 經典 BaaS，正在補 MCP。
- **共同弱點：橫向 infra plumbing。** 不懂 creator 怎麼**變現**，也沒有行銷智能層。（這裡的「變現」＝Stripe 管線＋角色/權限存取，**不是策略**。）

## 定位圖

```
                  變現／行銷智能 高
                         ▲
   prompt skill 包         │        ★ VVibe（唯一）
 (Corey Haines, OpenClaudia,│   Product Brain + 真實會員／流量資料
  Wondelai, nginity, …)     │   + agent-native 交付 + 創作者 dashboard
 有智能、零後端             │
                         │
 ────────────────────────┼──────────────────────────▶ 真實後端／資料 高
                         │
                         │     Butterbase／InsForge
                         │     Supabase／Convex
                         │     有後端、零變現智能
                  變現／行銷智能 低
```

VVibe 是唯一同時具備「**真實資料後端 × 變現／行銷智能 × agent-native 交付**」的。

## 護城河——修正版

> ⚠️ **研究修正。**「持久記憶＝護城河」我講得太滿。Bessemer 原文是 context/memory
> 「**may be** the new moats」（hedge）；而「持久記憶造成轉換成本鎖定」這條在查證中**被推翻**，
> a16z／NFX／v7labs 也主張：LLM 會自動做 schema mapping，**單靠記憶/資料的護城河正在變弱**。

所以護城河**不是格式**（已商品化——見 kill-shots）、**不是連接器**（已商品化）、
**也不是「記憶」本身**（有爭議）。難以複製的是**跨領域融合**：

> 創作者的**內容語氣 × 營收 × 會員行為，累積在同一個、以其真實第一方資料 grounding 的 Product Brain 裡。**
> 單一 skill 包做不到（無狀態）；單一 BaaS 也做不到（只有 infra 資料、沒有行銷語境）。
> 這份累積的跨領域語境——而非「記憶」這個功能——才是可守的資產。

## 已驗證的 kill-shots

1. **交付格式已成免費開放商品。** 2025/12/18 Agent Skills 成開放標準（spec + SDK 於 agentskills.io）；
   OpenAI 在 Codex/ChatGPT 採用結構相同格式；2026/3 已 32+ 工具支援；一手廠商含 **Stripe（變現）**、
   Cloudflare 都發 partner skill；Anthropic 各方案**不額外收費**。「agent-native skill 包裝」當不了護城河。
   [[1]](https://siliconangle.com/2025/12/18/anthropic-makes-agent-skills-open-standard/)
   [[2]](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard)
2. **連接層已商品化。** MCP 捐給 Linux Foundation 的 Agentic AI Foundation（97M+ 月下載、10,000+ server）。
   Apache 授權、中立治理的協定本身當不了護城河。
   [[3]](https://www.pulsemcp.com/posts/openai-agent-skills-anthropic-donates-mcp-gpt-5-2-image-1-5)
3. **BaaS 已在往上長智能層。** InsForge 上線了 **「AI Backend Advisor」**（`npx @insforge/cli diagnose advisor`）
   ——*目前*只掃 security/performance/health（infra）、**沒碰**行銷/變現，所以 VVibe 那塊還沒被攻破。
   但它證明資金充足的 BaaS 能在自家資料上長出顧問智能。**VVibe 有搶先窗口去先佔「變現/行銷」這塊——而窗口在縮。**
   （稍可放心：傳言的 InsForge「Project Memory」**被推翻**，Product Brain 尚未被正面攻擊。）
   [[4]](https://insforge.dev/blog/insforge-launch)

## 最大未解風險——需求面

**創作者/vibe-coder 到底會不會付錢買「變現腦」、價格帶在哪、留存如何？** 這是最關鍵的開放問題，
研究**無法回答**——本來要佐證的 ChartMogul 留存/定價數據在查證中**被推翻**（0-3），
「<5% MCP server 有變現」前提也未獲獨立確認。兩個方向都沒有經查證的基準。
**建議下一步：用真實使用者（訪談／小規模付費 pilot）回答，而非再做案頭研究。**

## 建議

**定位句：** *VVibe ＝ 疊在你 app 之上的成長與變現腦——把你的產品、語氣、會員與營收記在一處，
轉成 on-brand 內容與有根據的成長決策。不是後端、不是 prompt 包。*

- **採互補定位、坐在創作者 app/資料之上**——不論對方用不用第三方後端。**別做 standalone 後端**
  正面對撞 Butterbase/InsForge/Supabase（會輸資源）。這也讓你在 Anthropic/OpenAI 把 skill 全包後仍存活，
  因為護城河是累積的資料＋記憶，不是 skill 本身。
- **灘頭堡：** **已經在發內容、且需要用自己會員＋analytics 資料做變現決策的 solo creator／indie SaaS 創辦人。**
- **必須證明的 3 個 proof points：**
  1. 閉環**端到端真的跑起來**（Product Brain → on-brand SEO/轉換內容 → 發到自家 app →
     真實 GA4＋會員/訂閱資料 → grounded 營收/成長洞察 → 回頭精修 Brain）。
  2. **跨領域記憶**——內容語氣 × 營收 × 會員行為在**同一個會累積的知識庫**，skill 包與 BaaS 都沒有。
  3. **可量測的變現提升**——grounding 版 vs 無狀態 skill 包，拿出數字。

## 開放問題（給團隊）

1. **需求/定價/留存**——agent-native 創作者變現工具的核心未解題（見上方風險）。
2. **空白交叉點能撐多久？** InsForge（或其他 BaaS）多快能把 advisor 從 infra 延伸到行銷/變現——VVibe 的實際搶先窗口多長？
3. **開放 Skills 標準保留的是 skill「品質」還是只有檔案格式可攜性？**（影響交付商品化後，VVibe 的 Claude 調校 Brain 整合還有沒有優勢。）
4. **是否有未被掃到的進入者**（AI-native CMS、創作者變現新創、Supabase/Convex/Firebase 的內容外掛）已逼近交叉點？

## 來源

一手／高信心：[Butterbase](https://butterbase.ai/) ·
[InsForge](https://insforge.dev) ·
[InsForge YC launch](https://www.ycombinator.com/launches/QP6-insforge-the-backend-platform-for-ai-native-developers) ·
[InsForge launch blog（AI Backend Advisor）](https://insforge.dev/blog/insforge-launch) ·
[Agent Skills 開放標準 — SiliconANGLE](https://siliconangle.com/2025/12/18/anthropic-makes-agent-skills-open-standard/) ·
[VentureBeat](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard) ·
[MCP 捐贈 — PulseMCP](https://www.pulsemcp.com/posts/openai-agent-skills-anthropic-donates-mcp-gpt-5-2-image-1-5) ·
[Bessemer State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025) ·
[Composio marketing-skills 編目](https://composio.dev/content/best-marketing-skills)

已推翻／未驗證（**勿**當事實引用）：ChartMogul AI-churn 留存與價格帶數據（推翻 0-3）、
「記憶＝轉換成本鎖定」（推翻 1-2）、「<5% MCP server 有變現」（未驗證）。
