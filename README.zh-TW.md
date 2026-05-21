繁體中文 | [English](./README.md)

# VVibe Skills

[VVibe](https://vvibe.ai) 創作者專用的 AI Agent Skill 集合。透過 AI Agent 把 VVibe 服務 — 分析、會員同步、邀請信、部署前安全稽核 — 整合到任何專案中。

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

## Skills 一覽

| Skill | 說明 | 觸發關鍵字 |
|-------|------|-----------|
| **vvibe-analytics** | GA4 分析安裝、VVibe 事件追蹤、儀表板連結 | `GA4`、`Google Analytics`、`事件追蹤` |
| **vvibe-member** | 用戶同步至 VVibe — 全量遷移、增量同步、Dashboard 查看 | `用戶同步`、`member sync`、`用戶管理` |
| **vvibe-sentry** | 部署前的程式碼安全稽核 — 串接 gitleaks、osv-scanner、semgrep 加上 VVibe 整合檢查，結果回報至 Vibe 儀表板 | `sentry 掃描`、`安全稽核`、`部署前檢查`、`機密外洩`、`依賴 CVE` |
| **vvibe-email** | 將 Invitation Email 註冊連結導向 VVibe 託管 CTA（零設定）或 vibe coder 自架的 waitlist 落地頁 | `Invitation Email`、`Waitlist 落地頁`、`app base URL` |

## VVibe Analytics Integration

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-analytics
```

協助創作者在網站安裝 Google Analytics 4，並連結到 VVibe 後台查看分析數據。

- 支援 Next.js（App Router / Pages Router）、React SPA、純 HTML 的 GA4 安裝
- 5 個 VVibe 標準事件 + GA4 電商事件對應
- VVibe 後台 GA 授權連結流程

**前置條件：** Google Analytics 4 帳號與 Measurement ID（`G-XXXXXXX`），以及 VVibe 帳號。

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

**前置條件：** VVibe API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。至 [VVibe Dashboard](https://vvibe.ai/dashboard) 申請。

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

**前置條件：** 安裝 [gitleaks](https://github.com/gitleaks/gitleaks)、[osv-scanner](https://github.com/google/osv-scanner) 與 [semgrep](https://semgrep.dev/)（任一缺席，sentry 會優雅跳過該層）。選用：VVibe API 金鑰（`pcs_live_*` 或 `pcs_test_*`），把結果回報到儀表板。

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

**前置條件：** VVibe API 金鑰（`pcs_live_*` 或 `pcs_test_*`）。Mode B 需要一個可公開存取的 HTTPS 網域。

**Skill 觸發條件：**
- 「註冊信件的連結會導去哪裡？」
- 「我想把 waitlist 落地頁放在自己網站上」
- 「在 Hero 區塊放一個 VVibe waitlist CTA」
- 「設定 invitation email 的 app base URL」

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
