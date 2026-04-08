# Phase 0.5 - UI Setup Integration Guide (Gợi ý triển khai)

Mục tiêu: gắn flow setup vào UI theo hướng ổn định, test được, không gọi shell trực tiếp từ renderer.

## 1) Bảng mapping nút UI -> action backend

| Nút UI (gợi ý) | Action backend nên gọi | Pass khi |
|---|---|---|
| `Bắt đầu Setup` | `setup.startSession()` | Trả về `sessionId` |
| `Local Gateway` | `setup.selectGatewayMode("local")` | State chuyển `gateway.mode=local` |
| `Port 27106` + `Lưu` | `setup.setGatewayPort(27106)` | Config hợp lệ, không đổi sang cổng khác |
| `Cài Gateway Service` | `setup.gateway.installService()` | Service installed |
| `Khởi động Gateway` | `setup.gateway.startService()` | Service running |
| `Kiểm tra Gateway` | `setup.gateway.healthCheck()` | WS/HTTP reachable |
| `Ollama` (provider card) | `setup.model.selectProvider("ollama")` | Provider selected |
| `Đã cài Ollama` | `setup.ollama.markInstalled(true)` | Qua bước base URL |
| `Chưa cài Ollama` | `setup.ollama.markInstalled(false)` | Hiện chọn OS |
| `Cài Ollama (mac/linux)` | `setup.ollama.installMacLinux()` | Binary tồn tại + version OK |
| `Mở hướng dẫn Windows` | `setup.ollama.openWindowsInstallGuide()` | Browser mở đúng URL |
| `Tôi đã cài xong` | `setup.ollama.verifyInstalled()` | `ollama --version` pass |
| `Khởi chạy Ollama` | `setup.ollama.startServeBackground()` | `/api/tags` reachable |
| `Pull model mặc định` | `setup.ollama.pullModel("llama3.2")` | Model xuất hiện trong list |
| `Groq` (provider card) | `setup.model.selectProvider("groq")` | Provider selected |
| `Lưu Groq API key` | `setup.groq.saveApiKey(key)` | Key lưu vào auth profile |
| `Áp dụng chế độ tiết kiệm` | `setup.groq.applyQuotaProfile()` | model/tool/thinking defaults đã set |
| `Hatch Test` | `setup.e2e.hatchPrompt("Wake up, my friend!")` | Có assistant reply |
| `Kết nối Telegram` | `setup.channels.telegram.configure(token)` | Bot handshake OK |
| `Kết nối Discord` | `setup.channels.discord.configure(token,guild)` | Bot online + test message OK |
| `Lưu toàn bộ` | `setup.commitConfig()` | File config ghi thành công |

## 2) Cách gắn kỹ thuật (khuyến nghị)

Không gọi `npm install`, `ollama serve`, `curl | bash` trực tiếp từ UI renderer.

Thiết kế 3 lớp:
1. `UI Renderer`: chỉ hiển thị form/nút/trạng thái.
2. `Setup API Layer` (IPC/RPC): nhận request từ UI, validate input.
3. `Setup Engine` (Node service): thực thi action thật, stream log/progress.

Nguyên tắc:
1. Mỗi nút UI gọi đúng 1 action typed, idempotent.
2. Mỗi action trả về `status: queued | running | success | error`.
3. Mọi command hệ thống chạy qua whitelist ở backend.
4. Không giữ secret trong renderer state lâu hơn cần thiết.

## 3) Event contract tối thiểu (để UI render realtime)

Đề xuất event thống nhất:

```json
{
  "sessionId": "setup-123",
  "stepId": "ollama.startServe",
  "status": "running",
  "progress": 45,
  "message": "Starting Ollama in background...",
  "timestamp": "2026-04-08T10:05:00.000Z"
}
```

Status chuẩn:
1. `queued`
2. `running`
3. `success`
4. `error`
5. `blocked` (thiếu prerequisite, ví dụ chưa cài Ollama)

## 4) State machine cho wizard

Mỗi step nên có:
1. `prerequisites`: điều kiện vào step.
2. `action`: hàm backend chạy step.
3. `successTransition`: step kế tiếp.
4. `failurePolicy`: retry hoặc chặn.

Ví dụ flow Ollama:
1. Chọn provider `ollama`.
2. Hỏi đã cài chưa.
3. Nếu `No`:
- `mac/linux`: chạy install action.
- `windows`: mở hướng dẫn + chờ confirm đã cài.
4. Verify binary.
5. Start serve background.
6. Check `/api/tags`.
7. Pull model default nếu chưa có.
8. Save config + auth profile.
9. Hatch test.

## 5) Quy tắc cho oneliner và onboarding UI

Để đồng bộ trải nghiệm:
1. Oneliner chỉ làm bootstrap cài CLI + gọi `vora onboard`.
2. UI setup phải dùng cùng logic backend như CLI onboarding.
3. Không duplicate logic trong frontend.
4. Mọi default quan trọng (port, model, timeout, tool profile) lấy từ 1 nguồn config.

## 6) Guardrail bắt buộc

1. Port Gateway cố định theo lựa chọn user, không tự nhảy khi không có xác nhận.
2. Nếu port bận: hiển thị PID/process đang chiếm và lựa chọn xử lý rõ ràng.
3. Với Ollama: nếu `api/tags` fail, UI phải chỉ ra bước cần làm tiếp theo.
4. Với Groq: bật profile tiết kiệm mặc định để tránh đốt quota từ tin nhắn đầu.
5. Mọi lỗi phải có `errorCode` ổn định để UI map sang message dễ hiểu.

## 7) Definition of Done cho Phase 0.5 UI

Pass khi đạt đủ:
1. Mac one-liner -> onboard flow chạy đúng, vào được hatch test.
2. Windows one-liner -> onboard flow chạy đúng, không vỡ do policy cơ bản.
3. Hatch với `groq` có reply.
4. Hatch với `ollama` có reply (sau khi service/model sẵn sàng).
5. Gateway health check pass tại port đã chọn.
6. Telegram/Discord connect flow không crash wizard (dù có thể skip token).

## 8) Thứ tự implement đề xuất

1. Tạo `setup-engine` action interface + event stream.
2. Gắn các nút Gateway cơ bản.
3. Gắn nhánh Ollama (install/verify/serve/pull).
4. Gắn nhánh Groq (save key + quota profile).
5. Gắn Hatch test.
6. Gắn channels (Telegram/Discord) theo mode optional.
7. E2E smoke cho mac/windows + groq/ollama.
