繁體中文 | [English](./README.md)

# VVibe Skills

[VVibe](https://vvibe.ai) 創作者專用的 AI Agent Skill 集合。透過 AI Agent 把 VVibe 服務 — 分析、會員同步、邀請信、部署前安全稽核、產品知識庫建構 — 整合到任何專案中。

## 安裝

```bash
# 安裝全部
npx skills add vvibe/vvibe-skills

# 安裝單一 skill
npx skills add vvibe/vvibe-skills --skill vvibe-analytics
```

## 更新

```bash
# 更新所有已安裝的 skill 到最新版
npx skills update

# 更新單一 skill
npx skills update vvibe-analytics
```

## 建立你的 VVibe 帳號

這些 skill 操作的是**你自己的** VVibe 帳號。如果你是 VVibe 全新用戶（還沒有帳號），在使用任何需要帳號的 skill 前先建立一個——當 agent 偵測到你沒有金鑰時，會自動引導你完成這一步。

1. 打開 [`https://vvibe.ai/dashboard`](https://vvibe.ai/dashboard)——若尚未登入會被導到登入頁，用 **註冊** 切換建立帳號。
2. 註冊後，到儀表板的 API 金鑰設定複製你的 API 金鑰（`pcs_live_*` / `pcs_test_*`）。
3. 把它加進專案環境變數 `VVIBE_API_KEY`（別提交進版控）。

完整教學：**[ONBOARDING.zh-TW.md](./ONBOARDING.zh-TW.md)**。（唯讀的 `vvibe-blog-render` skill 不需要帳號。）

## Skills 一覽

| Skill | 說明 | 觸發關鍵字 |
|-------|------|-----------|
| **vvibe-analytics** | GA4 分析安裝、VVibe 事件追蹤、儀表板連結 | `GA4`、`Google Analytics`、`事件追蹤` |
| **vvibe-member** | 用戶同步至 VVibe — 全量遷移、增量同步、Dashboard 查看 | `用戶同步`、`member sync`、`用戶管理` |
| **vvibe-sentry** | 部署前的程式碼安全稽核 — 串接 gitleaks、osv-scanner、semgrep 加上 VVibe 整合檢查，結果回報至 Vibe 儀表板 | `sentry 掃描`、`安全稽核`、`部署前檢查`、`機密外洩`、`依賴 CVE` |
| **vvibe-email** | 將 Invitation Email 註冊連結導向 VVibe 託管 CTA（零設定）或 vibe coder 自架的 waitlist 落地頁 | `Invitation Email`、`Waitlist 落地頁`、`app base URL` |
| **vvibe-product-brain** | 建立或更新創作者在 VVibe 上的「產品腦」—— 從 repo、公開網站或文件抽取結構化產品事實，再透過 `vibe_set_product_kb` 寫回。其他會產出文案的 skill（email、SEO、轉換優化）下筆前都會先讀這份。 | `產品腦`、`Product Brain`、`知識庫建構器`、`告訴 VVibe 你的產品` |
| **vvibe-blog-writer** | 從創作者的「產品腦」起草 SEO 部落格文章，接著發佈到創作者自己的 VVibe headless 部落格（免設定）或推送為 WordPress 草稿。下筆前讀取品牌語氣、FAQ、受眾與禁用語句，確保文章貼合品牌且避開法務地雷。 | `寫一篇部落格`、`起草文章`、`SEO 文章`、`發佈我的部落格`、`發佈到 WordPress` |
| **vvibe-blog-render** | 在創作者自己的 app 裡，讀取 VVibe 內容 API 打造部落格前台——文章列表頁與內文頁、VVibe 已產生的 SEO（meta 與 JSON-LD）、重新驗證快取，外加在創作者網域上輸出 RSS 與 sitemap。headless VVibe 部落格的「head」。 | `顯示我的 vvibe 部落格`、`渲染我的文章`、`部落格前台`、`把我的網站接上 vvibe` |

## VVibe Analytics Integration

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-analytics
```

協助創作者在網站安裝 Google Analytics 4，並連結到 VVibe 後台查看分析數據。

- 支援 Next.js（App Router / Pages Router）、React SPA、純 HTML 的 GA4 安裝
- 5 個 VVibe 標準事件 + GA4 電商事件對應
- VVibe 後台 GA 授權連結流程

**前置條件：** Google Analytics 4 帳號與 Measurement ID（`G-XXXXXXX`），以及 VVibe 帳號（[VVibe 新手？](./ONBOARDING.zh-TW.md)）。

**Skill 觸發條件：**
- 「幫我在網站安裝 Google Analytics」
- 「我想追蹤 VVibe 結帳事件」
- 「幫我串接 GA4 到我的 Next.js 專案」
- 「我想在 VVibe 後台看到網站分析數據」
- 「幫我把 Google Analytics 連結到 VVibe」

## VVibe User Management

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-member
```

協助 vibe coder 將應用程式的用戶資料同步到 VVibe，讓創作者在 Dashboard 查看完整的使用者與訂閱狀態。

- 全量同步：批次匯入既有用戶，支援分批與指數退避
- 增量同步：在註冊/更新/停用事件中以 fire-and-forget 模式自動同步
- Dashboard 可視化：`https://vvibe.ai/dashboard/users`
- 同步紀錄：追蹤每次同步的成功/失敗狀態

**前置條件：** VVibe 帳號與 API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。VVibe 新手？[先註冊帳號再取得金鑰](./ONBOARDING.zh-TW.md)。

**Skill 觸發條件：**
- 「幫我同步用戶到 VVibe」
- 「幫我把既有的會員資料遷移到 VVibe」
- 「幫我設定用戶增量同步」

## VVibe Sentry 程式碼安全稽核

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-sentry
```

在部署前對創作者的整個 codebase 跑一次安全與可靠性稽核。Sentry **串接已有的開源掃描工具**，不重複造輪子。Agent 的價值是統一驅動這些工具、把輸出正規化成單一嚴重度評等的報告，再用白話帶創作者一步步修。

四層覆蓋：

- 🔐 **Secrets**（機密外洩）— [gitleaks](https://github.com/gitleaks/gitleaks) 掃 git 歷史與工作樹是否藏了 AWS / GCP / GitHub / OpenAI / `VVIBE_API_KEY` 等 token
- 📦 **Dependencies**（依賴）— [osv-scanner](https://github.com/google/osv-scanner) + `npm audit` 找已知 CVE
- 🛡️ **Static analysis**（程式碼模式）— [semgrep](https://semgrep.dev/) 配 OWASP Top 10 + JS/TS 規則包（SQL injection、XSS、SSRF、hardcoded secret、missing auth、unsafe `eval`、weak crypto）
- 🪢 **VVibe 整合**— sentry 內建的 VVibe 特定 check（API key 是否走 env、會員同步是否帶 idempotency、Email 是否尊重退訂、Analytics 是否漏 PII）

每個 finding 分級為 CRITICAL / WARNING / INFO。**Read-only**——絕不修改使用者程式碼。可選擇把摘要回報到 `https://vvibe.ai/dashboard/sentry-scans`，或當 agent 已透過 MCP 連線時改走 `vibe_report_health_check`。

**前置條件：** 安裝 [gitleaks](https://github.com/gitleaks/gitleaks)、[osv-scanner](https://github.com/google/osv-scanner) 與 [semgrep](https://semgrep.dev/)（任一缺席，sentry 會優雅跳過該層）。選用：VVibe 帳號（[新手？](./ONBOARDING.zh-TW.md)）與 API 金鑰（`pcs_live_*` 或 `pcs_test_*`），把結果回報到儀表板。

**Skill 觸發條件：**
- 「部署前幫我跑一次 sentry 掃描」
- 「稽核我的程式碼安全問題」
- 「掃描有沒有把 API key 提交到 git」
- 「檢查依賴有沒有 CVE」
- 「我的專案可以安心上線嗎？」

## VVibe Invitation Email Integration

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-email
```

協助 vibe coder 把 VVibe 註冊邀請信件中的連結導向正確的落地頁 — 可選擇 VVibe 託管頁面（零開發）或在自己的網域上實作 `/waitlist/[creatorSlug]`（完全控制 UX）。

- Mode A — 直接嵌入 `https://vvibe.ai/waitlist/{creatorSlug}` CTA，不用寫任何後端
- Mode B — 設定 `appBaseUrl` 並在自己的網域實作頁面；點擊追蹤仍走 VVibe
- Mode B 提供 Next.js、React SPA、純 HTML 三種範本
- 與 `vvibe-member` 串接，把新訂閱者同步進創作者儀表板

**前置條件：** VVibe 帳號與 API 金鑰（`pcs_live_*` 或 `pcs_test_*`）——[VVibe 新手？](./ONBOARDING.zh-TW.md)。Mode B 需要一個可公開存取的 HTTPS 網域。

**Skill 觸發條件：**
- 「註冊信件的連結會導去哪裡？」
- 「我想把 waitlist 落地頁放在自己網站上」
- 「在 Hero 區塊放一個 VVibe waitlist CTA」
- 「設定 invitation email 的 app base URL」

## VVibe 產品腦

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-product-brain
```

幫創作者建立或更新 VVibe 上的「產品腦」—— 結構化的 agent-owned 文件，其他會產出文案的 skill（email、SEO、轉換優化）下筆前都會先讀這份。下游 skill 因此不必每次都重新推導產品是什麼。

- 三種來源類型（可疊加）：GitHub repo、公開網站、文件集（PDF / markdown / 截圖）
- 兩種模式：`build`（沒有現有產品腦，首次建立）與 `refresh`（與現有產品腦做欄位級 diff，產出 `change_log`）
- 嚴格紀律：**EXTRACT verbatim → INFER 並標註 confidence → 不准 fabricate**（沒有 source signal 的欄位留 `null` 並寫進 `missing_fields[]`）
- 永不捏造客戶名或數據；偵測法務地雷（CAN-SPAM / FTC / 醫療 / 金融）並 verbatim 記錄到 `legal_compliance.forbidden_claims`，讓下游 skill 自動避開

**前置條件：** VVibe 帳號（[新手？](./ONBOARDING.zh-TW.md)），透過連上 VVibe MCP 或設定 `VVIBE_API_KEY`（`pcs_live_*` / `pcs_test_*`）存取；至少一種來源（repo / URL / 文件集）。

**Skill 觸發條件：**
- 「在 VVibe 上建立我的產品腦」
- 「跑一次 product knowledge base builder」
- 「告訴 VVibe 我的產品在做什麼」
- 「重新整理產品腦」
- 「產品有變動，更新 KB」

## VVibe 部落格寫手

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-blog-writer
```

從創作者的「產品腦」起草 SEO 部落格文章，接著發佈到兩種目的地之一：創作者自己的 **VVibe headless 部落格**（免外部 CMS、免設定），或 **WordPress 草稿**（由創作者在自己的 CMS 檢視後發佈）。VVibe 是 headless 的大腦與內容 API；伺服器端強制執行生成規格與寫作規則，agent 負責編排。

- 下筆前讀取「產品腦」的品牌語氣、受眾、FAQ 與 `forbidden_claims`，確保文章貼合品牌、避開法務地雷（絕不重新推導產品）
- 四種固定文章方向：產品理念、產品功能、相關用戶引流、教學與問題解決
- 流程：brief → 3 個 SEO 標題候選 + 大綱 → 完整草稿（answer-first 結構、FAQ、JSON-LD），全部可編輯；每次編輯都記錄為 revision
- **VVibe 部落格**發佈（`target: native`）：免憑證、立即上架到內容 API，再搭配 **vvibe-blog-render** 顯示。**WordPress** 發佈：**只建立草稿**、絕不自動發佈；僅限公開 HTTPS 並有 SSRF 防護

**前置條件：** VVibe 帳號（[新手？](./ONBOARDING.zh-TW.md)），透過連上 VVibe MCP 或設定 `VVIBE_API_KEY`（`pcs_live_*` / `pcs_test_*`）存取；先有「產品腦」（請先跑 **vvibe-product-brain**）；部署需由 operator 設定 LLM provider 才能起草。WordPress 發佈另需 application password（VVibe 部落格路徑則完全不需要）。

**Skill 觸發條件：**
- 「幫我寫一篇關於 X 的部落格」
- 「起草一篇 SEO 文章」
- 「產品有變動，重做這篇」
- 「發佈到我的 VVibe 部落格 / 連接我的 WordPress / 發佈這篇」

## VVibe 部落格前台（Render）

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-blog-render
```

在創作者**自己的 app** 裡打造部落格前台，讓發佈到 VVibe 部落格的文章真正顯示給讀者看。VVibe 是 headless 的——它用公開 API 提供內容，但自己不渲染任何頁面；這個 skill 就是那個「head」。

- 產生內容 API 的 typed client，並 scaffold 部落格**列表頁**與**內文頁**（主推 Next.js App Router；附 Astro / Nuxt / SvelteKit / 靜態網站做法）
- 帶上 VVibe 已產生的 SEO——`metaTitle` / `metaDescription` 與 `schemaJsonld`（安全注入；為 null 時略過）
- 串接**重新驗證**（ISR / 定時重建，靠 API 的 `ETag` / `Last-Modified`），並在創作者自己的網域輸出 **RSS feed 與 `sitemap.xml`**——連結才指得到實際渲染的頁面
- **唯讀**：無憑證、無寫入工具，只對公開、CORS 開放的內容 API 做 `GET`

**前置條件：** 創作者自己的 app/網站 repo（任何框架）；VVibe 部署主機 + 他們的 merchant slug；至少一篇已發佈到 VVibe 部落格的文章（請先用 **vvibe-blog-writer** 以 `target: native` 發佈，這也會啟用公開部落格）。

**Skill 觸發條件：**
- 「把我的 VVibe 部落格顯示在我的網站上」
- 「渲染我的文章 / 設定部落格前台」
- 「新增一個讀取我 VVibe 文章的部落格頁」
- 「我網站上的新文章沒出現」

## 串接到自己的 Server

這些 skill 預設指向 `https://vvibe.ai`，直接安裝者不用設定。若 fork 後要串自架或相容後端，設定 `VVIBE_API_HOST` 即可——內建 script 與 Agent 產出的程式碼都會讀：

```bash
VVIBE_API_HOST=https://your-backend.example.com
```

後端相容契約見 [PROVIDER.md](./PROVIDER.md)。

## Windows 注意事項

在 Windows 環境使用 VVibe API 時，PowerShell 可能會有中文編碼問題。請先執行：

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
```

## 授權條款

Apache 2.0
