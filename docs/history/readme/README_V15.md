# AI RDvD UI V15 — Language / Theme / Subtitle Shortcuts

Bản UI Shell này giữ nguyên luồng prototype hiện tại và cải thiện khu vực điều khiển giao diện trên topbar.

## Điều khiển

- **Ngôn ngữ:** menu chuyên nghiệp với cờ, trạng thái đang chọn và shortcut `Ctrl + Shift + L`.
- **Sáng / Tối:** menu chuyên nghiệp với trạng thái hiện tại và shortcut `Ctrl + Shift + T`.
- **Tùy chỉnh phụ đề:** nút `CC` trên topbar để ẩn/hiện panel và shortcut `Ctrl + Shift + S`.
- Click ra ngoài menu sẽ tự đóng menu.
- Shortcut không kích hoạt khi con trỏ đang nằm trong `input`, `textarea`, `select` hoặc vùng editable.
- Lựa chọn ngôn ngữ và theme tiếp tục được lưu bằng `localStorage`.

## Chạy

```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```

UI hiện vẫn là **prototype giao diện**; chưa kết nối ASR / translation / TTS / render backend thật.
