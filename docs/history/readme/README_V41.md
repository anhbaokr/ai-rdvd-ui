# AI RDvD V41 — Timeline viewport + subtitle track

- Fixed workspace row overflow: Timeline no longer extends underneath the Windows taskbar when the Tauri window is reduced.
- Preview/Edit remain above; Timeline remains a dedicated full-width row below both.
- Added S1 subtitle track with eye/lock controls.
- Imported SRT/VTT/TXT translated subtitles are parsed into real timeline subtitle blocks and can be clicked to seek the video.
- No hardcoded subtitle content is injected when there is no real subtitle data.
- Preserved V40 Tauri shell and auto-pipeline workflow.

## V41 corrective layout pass

- Giữ topbar/Tauri controls ở stacking layer cao hơn workspace để menu Ngôn ngữ và Giao diện không bị Preview che.
- Chuyển app shell sang grid 2 hàng: header + client area, tránh tính chiều cao chồng với viewport Tauri.
- Giữ Timeline luôn có vùng nhìn thấy tối thiểu ở cửa sổ thấp; Preview/Edit Video co trước khi Timeline bị đẩy khỏi client area.
- Track S1 Phụ đề đã có sẵn trong Timeline V41 và tiếp tục được giữ nguyên.


## V41 corrective layout pass (revised)
- Main workspace remains 25% workflow / 75% editor.
- Preview and Edit Video share one top row; Timeline spans full width below both.
- Timeline keeps a minimum visible height on short windows and the upper workspace yields height first.
- Language/Theme dropdowns are rendered as viewport-fixed floating menus so they stay above Preview/Edit Video.
- Time/track logic and subtitle track structure are unchanged.
