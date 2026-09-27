# AI-RDvD UI V19 — IMPORT VIDEO THẬT

Bản FULL PROJECT này bổ sung import video thật và preview video thực tế.

## Đã thêm
- Chọn file `video/*` bằng hộp thoại Windows/browser.
- Tạo Object URL từ file video thật và nạp vào player.
- Preview hiển thị đúng video đã chọn, không dùng video mẫu thay thế khi đã import.
- Đọc duration thật của video.
- Thanh tiến trình theo thời gian thật.
- Play / Pause.
- Tua lùi 5 giây / tiến 5 giây.
- Volume thật.
- Fullscreen thật.
- Xóa video sẽ giải phóng Object URL và reset player.
- File không phải video sẽ bị từ chối và ghi vào Live Log.

## Chạy
```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```

Đây vẫn là UI shell: import và playback là thật, còn ASR / Translation / TTS / Render vẫn chưa kết nối module AI thật.
