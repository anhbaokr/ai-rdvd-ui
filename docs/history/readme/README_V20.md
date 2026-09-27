# AI RDvD UI — V20

## Thay đổi
- Import video thật và phát trực tiếp trong Preview.
- Thêm nút Play/Pause lớn ở chính giữa video, xuất hiện khi rê chuột vào Preview.
- CC chỉ bật/tắt hiển thị phụ đề; không còn dùng CC để đóng/mở panel tùy chỉnh.
- Timeline lấy thumbnail thật từ các frame của video đã import.
- Timeline lấy waveform thật từ track audio của video bằng Web Audio API khi trình duyệt hỗ trợ giải mã.
- Playhead timeline bám theo currentTime của video.
- Live Log không ghi sự kiện import video.
- Thêm Xuất log và Mở thư mục log. Trong bản web, Mở thư mục dùng File System Access API nếu trình duyệt hỗ trợ; khi đóng gói Tauri có thể nối vào native shell.
- Thêm hover/focus/active/disabled states cho button, input, select, range và control chính.
- Không thêm TTS nghe thử ở bản này.

## Chạy
```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```
