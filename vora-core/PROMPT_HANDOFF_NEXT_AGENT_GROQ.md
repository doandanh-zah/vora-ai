# Handoff Prompt Cho Agent Mới (VORA Phase 0 - Groq + OAuth + Telegram/Discord)

Bạn là coding agent tiếp quản dự án `vora-ai` để hoàn thiện Phase 0 của ZAH.  
Mục tiêu không chỉ là Groq, mà còn phải rà lại OAuth và kết nối bot Telegram/Discord.

## 1) Bối cảnh & môi trường

- Repo: `/Users/doandothanhdanh/Desktop/ZAH_CODE/vora/vora-ai/vora-core`
- Branch: `main`, commit hiện tại: `214fc01`
- Worktree đang dirty với nhiều chỉnh sửa trước đó.  
  Nguyên tắc: **không reset/revert bừa**, chỉ sửa phần liên quan task.

## 2) Tình hình hiện tại (đã biết)

- Người dùng đã cài `vora-ai` global và phản hồi tốc độ cài đặt tốt.
- Port gateway bắt buộc người dùng mong muốn: `27106` (đã từng drift sang `27116`).
- Đã có option Ollama trong wizard, nhưng người dùng quyết định **bỏ Ollama** và chuyển sang **Groq**.
- OAuth OpenAI Codex:
  - Đã login OAuth thành công, token còn hạn theo `vora models`.
  - Nhưng khi chat trong `vora tui`, từng gặp lỗi rate-limit lặp lại:
    - `Rate limit reached for gpt-5.4 ... on tokens per min ...`
  - Tình trạng này **chưa được xác nhận fix dứt điểm**.
- Về channel bot (Telegram/Discord): chưa test thực tế, khả năng còn lỗi cao.

## 3) Mục tiêu tổng

1. Chuyển flow model chính sang Groq cho user dùng ổn định.
2. Giữ/ổn định lại OAuth path (OpenAI Codex) để không regression.
3. Chuẩn hóa và test đường kết nối Telegram + Discord (ít nhất smoke test + lỗi rõ ràng).

## 4) Track A - Groq integration (ưu tiên cao)

1. Thêm đầy đủ Groq vào luồng config/onboard:
- `configure` wizard
- non-interactive onboarding/auth-choice
- auth-choice options + apply logic

2. Chuẩn hóa provider Groq:
- Provider ID: `groq`
- Base URL: `https://api.groq.com/openai/v1`
- Auth: API key qua `GROQ_API_KEY` + auth profile `groq:default`
- Không hardcode key trong source/test/docs

3. Model mapping cho Groq:
- Dùng model IDs hợp lệ hiện tại của Groq (verify lại trước khi hardcode)
- Cấu hình default/fallback hợp lý
- Đảm bảo `models list/status/probe` hiển thị đúng

4. Runtime:
- `vora agent`, `vora tui` chạy được với Groq
- Lỗi thiếu key phải rõ ràng, actionable

## 5) Track B - OAuth triage (bắt buộc ghi nhận)

1. Xác minh path OAuth hiện tại:
- profile selection
- auth order
- runtime transport/wrapper cho `openai-codex/gpt-5.4`
- retry/backoff khi rate-limit

2. Yêu cầu:
- Nếu lỗi rate-limit là do quota thật: hiển thị message rõ, không loop vô hạn, không kẹt UX.
- Nếu do bug logic chọn profile/model: fix triệt để.
- Không phá flow Groq khi sửa OAuth.

3. Deliver:
- Kết luận rõ: lỗi OAuth đã fix hay chưa, còn phụ thuộc gì (quota/account/server side).

## 6) Track C - Telegram/Discord connect (bắt buộc)

1. Rà toàn bộ command/config liên quan channel:
- `channels`, `message`, `status`, `doctor`, gateway channel runtime

2. Telegram:
- Flow bot token/config
- map chat/group target
- send/receive smoke test
- lỗi auth/network phải có hướng dẫn sửa

3. Discord:
- Flow bot token/config/intents cần thiết
- map guild/channel
- send/receive smoke test
- lỗi permission/intents phải hiển thị rõ

4. Nếu chưa đủ secret/test account:
- vẫn phải làm “diagnostic-ready”:
  - validate config
  - preflight checks
  - message lỗi cụ thể để user chỉ cần điền token là chạy

## 7) Secret handling (bắt buộc)

- User đã đưa Groq key: [REDACTED]
- **Không commit secret thật** vào repo (source, tests, docs, fixtures, logs).
- User muốn user app vora khi dùng groq thì sẽ ko cần tự set up api mà có api sẵn 

## 8) E2E checklist phải chạy và báo cáo

1. Unit/integration tests cho phần đã sửa (`vitest` scoped).
2. Groq:
- `node vora.mjs configure` (model/auth)
- `node vora.mjs models status --json --probe --probe-provider groq`
- `node vora.mjs agent --session-id main --message "hello" --json`
- `node vora.mjs tui` nhắn 1 message
3. OAuth:
- test 1 turn với `openai-codex/gpt-5.4`
- kiểm tra behavior khi gặp rate-limit
4. Telegram/Discord:
- chạy flow connect + ít nhất 1 send test mỗi channel (hoặc preflight rõ nếu thiếu credential)

## 9) Tiêu chí hoàn thành

- User có thể dùng Groq ổn định qua wizard, không sửa tay config.
- OAuth không bị regression; có kết luận rõ trạng thái lỗi rate-limit.
- Telegram/Discord có flow connect khả dụng hoặc tối thiểu diagnostic đầy đủ.
- Gateway port không tự drift khỏi `27106` trong cấu hình chuẩn user.

## 10) Deliverable cuối cho user

- Danh sách file đã đổi + lý do.
- Kết quả test/e2e ngắn gọn, rõ pass/fail.
- Lỗi còn lại (nếu có) kèm bước tái hiện và mức độ ảnh hưởng.
- Nhớ check kĩ 2 file docx phần nhiệm vụ của Zah xem đã hoàn thành phase 0 chưa, nếu chưa thì tiếp tục hoàn chỉnh rồi mới upload lên npm với key : [REDACTED]