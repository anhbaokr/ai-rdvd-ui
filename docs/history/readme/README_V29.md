# AI-RDvD UI V29 — CC / Hard-Subtitle Preview Fix

## Thay đổi
- Tách CC khỏi bảng Tùy chỉnh phụ đề.
- CC vẫn điều khiển `subtitleVisible` độc lập.
- Khi CC tắt, Preview hiển thị một lớp mask tại đúng vùng khung subtitle để che phụ đề hard-sub đã dính trong pixel video.
- Khi CC bật, lớp mask biến mất; khung subtitle vẫn giữ nguyên và bảng tùy chỉnh không bị ảnh hưởng.
- Mask dùng cùng vị trí/kích thước với khung subtitle nên di chuyển/resize khung sẽ kéo theo vùng che.
- Không hardcode nội dung phụ đề.

Lưu ý: đây là cơ chế **Preview mask** để CC có tác dụng ngay trên video hard-sub; việc xóa hard-sub bằng inpaint thật vẫn là module xử lý video riêng ở pipeline sau.
