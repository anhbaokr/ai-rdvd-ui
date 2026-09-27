# AI RDvD V47.2 — Persisted Subtitle + TTS A2

## Thay đổi chính

- Bản dịch hoàn tất được lưu thành file UTF-8 SRT tại `%LOCALAPPDATA%\com.airdvd.app\output\translation\files`.
- Nút **Mở thư mục bản dịch** được bật sau khi file SRT đã lưu thành công.
- Bước 4 có nút **Tạo giọng đọc thật** độc lập; không cần tạo nội dung thử riêng.
- WAV do VieNeu tạo được phát trực tiếp trong ứng dụng và gắn vào track A2 theo đúng thời lượng.
- Khi video, S1 và A2 đều đã sẵn sàng, dự án chuyển sang trạng thái sẵn sàng render.
- A2 phát/tạm dừng/tua/tốc độ đồng bộ với video preview; nút M của A2 điều khiển mute thật.
- Chế độ âm nền `Giảm / Giữ nguyên / Tắt` điều khiển trực tiếp âm thanh video gốc A1 trong preview.
- Phụ đề S1 hiển thị theo timecode trên video. Màu nền phủ toàn bộ khung phụ đề để che phụ đề gốc.
- Bổ sung 15 lựa chọn font phụ đề và fallback font hỗ trợ tiếng Việt.
- MeaningGuard: từ đơn xuất hiện hai lần và tên kép như `Thác Thác` không còn bị coi là cụm lặp; từ đơn phải xuất hiện ít nhất ba lần, hoặc cụm từ tối thiểu hai từ phải lặp liền nhau.
- Live Log chỉ hiển thị 7 dòng gần nhất; file log kỹ thuật vẫn lưu toàn bộ lịch sử và giữ cơ chế xoay vòng dung lượng.

## Luồng kiểm thử trên Windows

1. Giải nén đè vào `E:\ai-rdvd-ui` (giữ lại `.venv`, `.translation-venv` và `translation-assets` hiện có).
2. Đóng cửa sổ ứng dụng/Tauri cũ rồi chạy lại `npm run tauri:dev` để Rust đăng ký hai lệnh mới về lưu/mở thư mục bản dịch.
3. Nạp video nguồn nếu muốn preview và chuyển sang trạng thái render.
4. Nạp file lời thoại tiếng Trung có timecode ở bước 3, rồi bấm **Bắt đầu dịch**.
5. Sau khi dịch xong, bấm **Mở thư mục bản dịch** để kiểm tra SRT đã lưu.
6. Chọn diễn viên và bấm **Tạo giọng đọc thật** ở bước 4.
7. Phát video: A2 phải chạy đồng bộ, S1 hiện theo timecode và A1 phản ánh chế độ âm nền đã chọn.

## Kiểm tra đã chạy

- `npm run build`: đạt.
- `python -m unittest discover -s tests -v`: 10/10 đạt.
- Chưa chạy được `cargo check` trong môi trường đóng gói Linux vì không có Rust toolchain; cần xác nhận bằng `npm run tauri:dev` trên Windows.

## Phạm vi chưa triển khai

- ASR/nhận dạng từ video chưa được triển khai theo yêu cầu hiện tại.
- Nút xuất video cuối hiện vẫn dùng trạng thái chờ engine export có sẵn; V47.2 nối preview/timeline và trạng thái sẵn sàng render, chưa ghép file MP4 cuối bằng FFmpeg.
