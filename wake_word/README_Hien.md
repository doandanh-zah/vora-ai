# Hướng dẫn Setup & Test Wake Word "Hey VORA" (OpenWakeWord)
**Dành riêng cho Nhiệm vụ của Hiển - Phase 0 & Phase 1**

Theo Spec, dự án sử dụng **OpenWakeWord** (mã nguồn mở, không giới hạn tier). Module này được chạy qua Python và giao tiếp với Node.js / Tauri thông qua IPC.

## 1. Cài đặt Môi trường
Vì dự án dùng Node.js nhưng OpenWakeWord gọi Python, máy test của bạn cần có cài sẵn Python (khuyến nghị bản 3.9 trở lên).

**Bước 1: Cài thư viện Python**
Đảm bảo bạn đang ở thư mục `wake_word/`, sau đó chạy:
```bash
pip install -r requirements.txt
```

**Bước 2: Cài thư viện Node.js (nếu cần)**
Vào thư mục chính của dự án, chạy `npm install` để đảm bảo Node.js đã sẵn sàng cho Wrapper.

## 2. Hướng dẫn Test Wake Word
Model tùy chỉnh `.onnx` (`hey_vora.onnx`) đã được đính kèm trong thư mục này. Quá trình test cần xác nhận bộ định tuyến âm thanh và engine Python hoạt động tốt với Wrapper của Node.js.

### Cách 1: Test Python trực tiếp (Khuyên dùng khi debug mic)
Bạn có thể test trực tiếp bằng Python để chắc chắn Micro đang thu nhận tốt.
```bash
python main.py --model hey_vora.onnx
```
- Khi chạy, Terminal sẽ in ra **`READY`**.
- Bạn sẽ thấy dòng **`VOLUME:xx`** nhảy liên tục, biểu thị độ lớn âm thanh mà Micro thu được.

### Cách 2: Test qua Node.js Wrapper (Test theo luồng Spec thực tế)
Để script Node.js kích hoạt tiến trình con bằng Python và đọc IPC channel:
```bash
node wrapper.js
```

## 3. Quy trình thực hiện Test bằng Giọng Nói
1. Khởi động script Node.js hoặc Python kể trên.
2. Kiểm tra log có in ra chữ `READY` hay chưa.
3. Thử nói chuyện bình thường để xem chỉ báo `VOLUME:xx` có hoạt động hay không.
4. **Nói rõ cấu trúc: "Hey VORA"**.
5. Quan sát console. Nếu thuật toán nhận dạng chính xác, console sẽ in ra dòng:
   `TRIGGER:hey_vora.onnx:0.95:1648...` (với `0.95` là điểm khơp - Score).

**Lưu ý cho Hiển khi Report:**
- **Latency (Độ trễ thời gian):** Ghi chú lại thời gian từ lúc phát âm xong đến lúc Node.js nhận được tín hiệu qua màn hình console xem có nhỏ hơn **200ms** không.
- **Môi trường Test:** Hãy test trên **trên 2 máy Windows khác nhau** với các loại microphone thiết bị khác nhau để đảm bảo PyAudio không bị xung đột driver mic. Viết log vào file test report!
