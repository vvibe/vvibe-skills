繁體中文 | [English](./ONBOARDING.md)

# 開始使用：註冊 VVibe 帳號並取得 API 金鑰

除了唯讀的 **vvibe-blog-render**，每個 VVibe skill 都會操作**你自己的** VVibe 帳號——同步會員、寄信、回報掃描結果、寫產品腦或部落格。所以在它們能做任何事之前，你需要一個 VVibe 帳號，以及 **API 金鑰**或 **Vibe MCP 連線**其中之一。

如果你是 VVibe 全新用戶（還沒有帳號），請先做一次以下設定。已經有帳號、env 裡也有 `VVIBE_API_KEY`（或已連上 Vibe MCP）？那就準備好了——可以跳過這頁。

## 1. 註冊 VVibe 帳號

儀表板就是入口。打開儀表板若尚未登入，會被導到**登入頁**；在登入頁用**「註冊」切換**建立帳號（email + 密碼，或 Google/GitHub）。

1. 打開 **`https://vvibe.ai/dashboard`**。若尚未登入，會被導到登入頁（`/login`）。
2. 在登入頁用**「註冊」切換**切到建立帳號，然後完成註冊（email + 密碼，或 Google/GitHub）。
3. 註冊完會回到儀表板。

> 自架或使用 fork？把 `vvibe.ai` 換成你後端的網域。詳見 [PROVIDER.md](./PROVIDER.md)。

> 若你看到的是「申請使用權限」的畫面，表示 VVibe 仍在限量 beta——填完簡短表單，通過後會以 email 通知你。

## 2. 取得 API 金鑰

1. 在儀表板開啟 **API 金鑰** / API 設定區。
2. 複製金鑰。前綴代表模式：
   - `pcs_live_*` → 正式環境
   - `pcs_test_*` → 沙盒
3. 把它當密碼看待。絕不提交進版控，也不要貼到前端程式碼裡。

## 3. 讓你的 agent 能讀到金鑰

把金鑰加進專案的環境變數（並確認 `.env` 已被 `.gitignore` 忽略）：

```bash
# .env  — 絕對不要提交
VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxx
```

這樣就好——所有走 API 金鑰的 skill（member、email、sentry、analytics）都會從這裡讀取 `VVIBE_API_KEY`。

### 走 MCP 的 skill

**vvibe-product-brain** 與 **vvibe-blog-writer** 可以改用 **Vibe MCP 連線**而非原始金鑰——連上 Vibe MCP server / daemon，agent 會用自己的 token 認證（部落格不需要 `pcs_…` 金鑰；產品腦則 MCP 或金鑰皆可）。但第 1 步的帳號仍是前置條件。

## 給 agent：在要金鑰之前，先辨識全新用戶

當 skill 需要 `VVIBE_API_KEY`（或 MCP 連線）卻**兩者都找不到**時，**不要**直接跳到「請貼上你的金鑰」——首次使用者很可能根本還沒有 VVibe 帳號。應該：

1. 先問他們是否已經有 VVibe 帳號。
2. **沒有 / 不確定 →** 這是全新用戶。帶他們走過上面的第 1～3 步：先建立帳號（打開 `https://vvibe.ai/dashboard` 若尚未登入會被導到登入頁，用「註冊」切換建立帳號），再複製金鑰。
3. **有 →** 引導他們到儀表板的 API 金鑰設定複製既有金鑰。

只有在金鑰已進入 `.env`（或 MCP 已連線）後，skill 才能繼續。
