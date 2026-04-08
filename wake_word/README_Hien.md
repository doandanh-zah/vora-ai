# Hướng dẫn Setup OpenWakeWord (Thay thế Picovoice Porcupine)
**Dành riêng cho Nhiệm vụ của Hiển - Phase 0 & Phase 1**

Theo Spec, thay vì sử dụng Porcupine (Picovoice) vốn không cần Python, chúng ta sẽ chuyển sang **OpenWakeWord**. OpenWakeWord có ưu thế là mã nguồn mở, không giới hạn tier, nhưng yêu cầu chạy qua Python Node.js sidecar IPC.

## 1. Cài đặt Môi trường
Vì dự án dùng Tauri + Node.js nhưng OpenWakeWord lại gọi Python, máy test của Hiển cần có Python cài sẵn.

**Bước 1:** Cài thư viện Python.
```bash
cd wake_word
pip install -r requirements.txt
```

**Bước 2:** Đảm bảo Node.js đã sẵn sàng để test Wrapper.

## 2. Training Wake Word "Hey VORA"
Với Porcupine, bạn dùng Picovoice Console để lấy file `.ppn`. 
Với OpenWakeWord, bạn có 2 lựa chọn:
1. Dùng default: Truyền `--model alexa` vào lệnh để test pipeline trước.
2. Dùng file ONNX tuỳ chỉnh: OpenWakeWord cho phép tạo model `.onnx` từ các công cụ text-to-speech. Khi có file `hey_vora.onnx`, copy vào thư mục này, và khởi tạo Node engine với `new WakeWordEngine('./hey_vora.onnx', 0.5)`.

## 3. Test theo Spec
Nhiệm vụ của Hiển trong file DOC yêu cầu:
> "End-to-end testing on Windows — 20+ runs per phase, latency measurement"

**Kịch bản chạy test tự động:**
```bash
node wrapper.js
```
Điều này sẽ bật IPC channel giữa `wrapper.js` (Node) và `main.py` (Python runtime).
Khi bạn nói "Alexa" (nếu dùng model mặc định), log sẽ in ra `Score` và `Latency` (thời gian trễ khi signal bắn từ Python qua Node.js stdout).

**Lưu ý cho Hiển:**
- Ghi lại Log MS Latency xem có vượt **<200ms** (từ lúc nói tới lúc Trigger) hay không. Do IPC có trễ chút nhưng OpenWakeWord rất tối ưu nên thường dưới 150ms.
- Test trên đúng **2 máy Windows khác nhau** (theo spec) để xem Python + PyAudio có bị xung đột driver mic hay không và report (bugs) lại nhé!
