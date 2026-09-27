AI RDvD UI V12 — SUBTITLE BOX FREE RESIZE

Cập nhật từ V11:
- Bỏ giới hạn MAX_W/MAX_H và clamp theo 4 mép canvas khi resize.
- 8 cạnh/góc có thể kéo tự do; chỉ giữ kích thước tối thiểu để tránh box = 0.
- Drag/resize DOM vẫn dùng requestAnimationFrame + pointer capture.
- React render trong khi drag dùng activeBox = dragPreview ?? box để không ghi đè vị trí/kích thước DOM vừa kéo.
- Bỏ transition width/height để không tạo độ trễ khi resize.
- Handle có hitbox 14px nhưng dấu chấm hiển thị 6px, gần kiểu Paint.

Chạy:
cd /d E:\AI-RDvD-UI
npm run dev
