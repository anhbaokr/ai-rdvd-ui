# AI-RDvD UI — V26

## Cập nhật

### 1. Import logo thật
- Nút `Fullscreen` ở header Preview được thay bằng `Thêm logo / Add logo`.
- Chọn file hình ảnh `image/*` từ máy.
- Logo hiển thị trực tiếp trên Preview sau khi import.
- Kéo logo để di chuyển.
- 8 tay nắm để thay đổi kích thước theo từng cạnh/góc.
- Có nút `×` để xoá logo và có thể import logo khác.

### 2. Âm lượng liên kết thật
- Biểu tượng loa và thanh volume dùng chung state.
- Click loa để mute/unmute.
- Kéo volume thay đổi âm lượng video thật.
- Mute từ Timeline A1 cũng đồng bộ với icon và thanh volume trên Player.

### 3. Timecode
Hiển thị video theo dạng:

`00:00:00:00 / 00:00:00:00`

Frame display mặc định 30 fps cho timecode UI.

### 4. Timeline zoom
- Có nút `−` / `+`.
- Có thanh trượt zoom trực tiếp.
- Phạm vi 50% → 400%.
- `Fit` đưa về 100%.
- Canvas timeline không còn bị khóa `min-width: 100%`, cho phép chiều dài thay đổi theo mức zoom.

## Phạm vi V26
Không thêm TTS preview. Các module AI thật vẫn để kết nối ở giai đoạn sau.
