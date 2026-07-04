繁體中文 | [English](./ONBOARDING.md)

# 開始使用：把你的 agent 連上 VVibe

除了唯讀的 **vvibe-blog-render**，每個 VVibe skill 都會操作**你自己的** VVibe 帳號——同步會員、寄信、回報掃描結果、寫產品腦或部落格。所以在它們能做任何事之前，你需要一個 VVibe 帳號，以及以下兩種認證方式其中一種：

- **Vibe MCP 連線（推薦——最快）：** 一行指令 + 一次瀏覽器登入。agent 用自己的 token 認證，帳號與預設 merchant 會自動開好，**沒有金鑰要複製**。
- **API 金鑰**放進 env：備援路徑——會員**同步**會用到，也是自架 / 只走 token 環境的唯一選擇。

兩者用的是同一個帳號，所以你可以先用 MCP，等某個 skill 真的需要金鑰時再補上。已經連上、或 env 裡已有 `VVIBE_API_KEY`？那就準備好了——可以跳過這頁。

## 最快：走 MCP 連線（一行指令、一次登入）

跑一行指令。它會把 VVibe 的 MCP server 寫進你 agent 自己的設定檔——然後由 **agent** 在第一次使用該 server 時，開瀏覽器帶你登入。沒有金鑰要複製，不用在 dashboard 點來點去。

```sh
npx @vvibe/cli connect --server=https://mcp.vvibe.ai
```

它會偵測 **Claude Code**、**Cursor**、**Codex** 並各自接好。接著在 agent 裡開始一個 VVibe 任務：第一次呼叫就會開瀏覽器登入——而且**註冊也在同一頁**，所以全新用戶就在這裡建立帳號。登入會自動建立你的帳號與一個預設 merchant，其他什麼都不用設。

想手動接 Claude Code：

```sh
claude mcp add --transport http vvibe https://mcp.vvibe.ai
```

> 自架或使用 fork？把 `--server` 指向你自己的 MCP host——詳見 [PROVIDER.md](./PROVIDER.md)。（MCP OAuth 是 cloud 功能；只走 token 的自架環境請用下方的 API 金鑰。）

**MCP 涵蓋範圍：** 產品腦、部落格、Email 邀請信 campaign、sentry 回報，以及所有讀取類工具，都能完整走這條連線。**會員同步**仍需下方的 API 金鑰——但那是同一個帳號，所以真的用到時只是複製一步。Analytics 則透過 dashboard 內自己的 **Connect** 按鈕接 GA4——不需要金鑰也不需要 MCP。

## 備援：API 金鑰

用於會員同步、只走 token 的自架環境，或你就是不想用 MCP：

1. 打開 **`https://vvibe.ai/dashboard`**。若尚未登入會被導到登入頁（`/login`）；用**「註冊」切換**建立帳號（email + 密碼，或 Google/GitHub）。
2. 在儀表板開啟 **API 金鑰**區，複製金鑰。前綴代表模式：`pcs_live_*` → 正式環境、`pcs_test_*` → 沙盒。
3. 把它加進專案的環境變數（並確認 `.env` 已被 `.gitignore` 忽略）：

```bash
# .env  — 絕對不要提交
VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxx
```

把它當密碼看待——絕不提交進版控，也不要貼到前端程式碼裡。所有走金鑰的 skill（member、email、sentry）都會從這裡讀取 `VVIBE_API_KEY`。（analytics 不走金鑰——它透過 dashboard 內建的 OAuth 連 GA4。）

> 若你看到的是「申請使用權限」的畫面，表示 VVibe 仍在限量 beta——填完簡短表單，通過後會以 email 通知你。

## 給 agent：優先推薦最快的路徑

當 skill 需要 VVibe 存取，卻**既找不到** MCP 連線（`vibe_*` 工具已註冊）**也沒有** env 裡的 `VVIBE_API_KEY` 時，**不要**直接跳到「請貼上你的金鑰」——那是慢路徑，而且首次使用者很可能根本還沒有帳號。應優先推薦最快的路徑：

1. **先提 MCP + OAuth。** 請用戶執行 `npx @vvibe/cli connect --server=https://mcp.vvibe.ai`（Claude Code / Cursor / Codex）。只要一行；第一次呼叫 VVibe 就會開瀏覽器登入，而註冊就在同一頁——所以這一步同時**建立帳號並連線**，沒有金鑰要複製，也不用回 dashboard。這就是 one-click 路徑，優先採用。
2. **只有在必要時才退回 API 金鑰**——用戶需要只有金鑰才能做的功能（會員同步）、正在自架且只走 token，或明確不想用 MCP。這時才帶他走上面的 API 金鑰步驟。

## 連線之後：設定產品基本資料

連上線不是終點。全新帳號的品牌欄位是空白或預設值（產品名可能預設成你的帳號名），所以 dashboard 沒有任何產品資訊，而且 **analytics 無法運作——它需要 `appBaseUrl`**。在第一次 `vibe_heartbeat` 成功後，立刻把基本資料設好：

1. 呼叫 `vibe_get_brand` 看哪些欄位是空的。
2. 呼叫 `vibe_update_brand` 填入：
   - **產品名稱**——取自專案（`package.json` name / README 標題），**不是**帳號擁有者的本名；
   - **`appBaseUrl`**——產品的公開 HTTPS 網址。到部署設定找（`package.json` homepage、`.env` / hosting 設定、`next.config.*`）。找不到就問使用者，或請他到 dashboard **Settings** 設定。必須是 HTTPS——`localhost` 會被拒絕。
   - **品牌描述**——用白話、非技術性的語言：產品做什麼、給誰用。不要提技術棧 / 框架 / 基礎設施名稱。

dashboard 的 **Settings** 頁面改的是同一組欄位，所以非 agent 使用者也能手動設定。（`vibe_recommend_skills` 也會推一把——它會找部署 URL，並在推薦 analytics 前先設好 `appBaseUrl`。）

只有在 MCP 已連線（或金鑰已進 `.env`）後，skill 才能繼續。
