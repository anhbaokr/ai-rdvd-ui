# AI-RDvD UI V31 — TIMELINE VIEWPORT FIX

V31 giữ nguyên khung UI Timeline cố định theo viewport. Zoom chỉ thay đổi mật độ/phạm vi thời gian của nội dung Timeline.

## Thay đổi
- Khung Timeline không co theo mức zoom.
- Thanh điều khiển Zoom cố định góc phải vùng Timeline.
- 50%: ruler vẫn phủ toàn bộ vùng Timeline; clip video chiếm phần tương ứng với scale, phần còn lại là vùng thời gian trống.
- >100%: canvas thời gian mở rộng và có thể cuộn ngang.
- Click/kéo trên ruler dùng đúng phạm vi thời gian đang hiển thị.
- Playhead tiếp tục bám `video.currentTime`.
- Giữ nguyên CC theo contract V30: chỉ bật/tắt khung/subtitle AI.
