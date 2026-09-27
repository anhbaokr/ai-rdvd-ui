# AI RDvD UI V25 — AUTO FIT VIDEO PREVIEW

## Thay đổi V25

- Preview video thật sử dụng `object-fit: contain` thay cho `cover`.
- Video tự động thu/phóng để **hiển thị toàn bộ khung hình gốc** trong vùng Preview, không cắt phần trên/dưới hoặc trái/phải.
- Giữ đúng tỷ lệ khung hình của video.
- Căn giữa video trong vùng Preview; phần diện tích thừa được giữ làm nền letterbox.
- Fullscreen tiếp tục sử dụng chế độ `contain`.
- Không thay đổi logic Timeline, CC, bảng Tùy chỉnh phụ đề hoặc ngôn ngữ của V24.

## Hành vi mong muốn

Video 16:9 trong Preview 16:9 -> lấp đầy khung.
Video 16:9 trong Preview cao hơn -> hiển thị đủ video, có khoảng trống dọc nếu cần.
Video 9:16 trong Preview ngang -> hiển thị đủ video, có khoảng trống hai bên nếu cần.
