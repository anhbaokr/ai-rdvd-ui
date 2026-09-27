# AI RDvD UI V24 — Subtitle Frame Independence + Full UI Language Binding

## Fixes
- Tách hoàn toàn `subtitleFrameVisible` khỏi `showSubtitlePanel`.
- Đóng/ẩn bảng **Tùy chỉnh phụ đề** không còn ẩn khung chọn phụ đề trên Preview.
- Import video thật sẽ tự bật khung chọn phụ đề ngay lập tức.
- Nút **CC** chỉ điều khiển `subtitleVisible` (ẩn/hiện subtitle), không điều khiển bảng cấu hình.
- Xóa video sẽ xóa khung subtitle cùng trạng thái media.
- Giữ nguyên shortcut theo thiết kế V15/V16:
  - Ctrl + Shift + L: đổi Việt / English
  - Ctrl + Shift + T: đổi Sáng / Tối
  - Ctrl + Shift + S: ẩn / hiện bảng Tùy chỉnh phụ đề
- Mở rộng dictionary `UI_TEXT` cho Timeline, track controls, context menu, player labels, log messages và theme descriptions để giao diện bám theo cơ chế đổi ngôn ngữ.
- Timeline labels và menu chuột phải không còn hardcode tiếng Việt.
- Không ghi log khi import video thành công.

## Run
```cmd
cd /d E:\AI-RDvD-UI
npm install
npm run dev
```

Full project archive, not a patch.
