# AI RDvD V47.3 — Internal A2 Playback Fix

## Sửa lỗi WAV nằm trên Timeline nhưng không phát

- Bỏ trình phát WAV khỏi menu **Lồng tiếng + Phụ đề**.
- Audio A2 được chuyển thành bộ phát nội bộ ẩn ở cấp ứng dụng và luôn tồn tại.
- A2 bắt sự kiện `play`, `playing`, `pause`, `ended`, `seeking`, `timeupdate` và `ratechange` của video.
- Nếu video đang chạy trước khi WAV hoàn tất, A2 tự bắt đầu ngay khi WAV phát được.
- A2 tiếp tục hỗ trợ mute thật từ nút M trên Timeline.
- Live Log ghi rõ:
  - `WAV A2 đã nạp và sẵn sàng phát`;
  - `Track A2 bắt đầu phát đồng bộ với video`;
  - MediaError và đường dẫn WAV nếu không nạp/phát được.
- Trường kết quả TTS `aligned` được đặt mặc định để worker cũ hoặc lượt tạo WAV không căn timecode không làm Rust từ chối toàn bộ kết quả.

## Kết luận từ ai-rdvd-technical(4).log

- VieNeu và worker hoạt động; nhiều WAV đã được ghi thành công với dung lượng hợp lệ.
- Lỗi im tiếng nằm sau bước tạo WAV, tại tầng media playback của giao diện.
- Một lượt Đoan Trang tạo file nhưng Rust từ chối kết quả vì thiếu trường `aligned`; V47.3 đã tương thích ngược với trường hợp này.

## Cách kiểm tra

1. Đóng hoàn toàn ứng dụng/Tauri cũ.
2. Giải nén V47.3 đè vào dự án, giữ nguyên `.venv`, `.translation-venv` và `translation-assets`.
3. Chạy `npm run tauri:dev`.
4. Tạo WAV hoặc chạy pipeline rồi bấm Play video.
5. Live Log phải xuất hiện hai dòng `WAV A2 đã nạp...` và `Track A2 bắt đầu phát...`.
6. Nếu vẫn im, gửi log mới; log lúc đó sẽ có mã MediaError cụ thể để xác định asset protocol hay codec.

## Xác minh sau khi sửa flow

- `python -m py_compile backend/tts_worker.py`: đạt.
- `python -m unittest discover -s tests -v`: 10/10 đạt.
- Đã chạy thử worker bằng stub VieNeu với 2 cue có timecode; worker trả về `aligned=true`, đúng `startMs/endMs` và tạo master WAV có silence theo timeline.
- `npm run build` chưa xác nhận trong môi trường kiểm tra vì `node_modules` không được cài hoàn chỉnh.
- `cargo check` chưa xác nhận trong môi trường kiểm tra vì sandbox không có Rust toolchain.


## V47.3 corrected media flow

V47.3 now treats Preview as a live representation of the current project media state:

```text
Video source (V1)
  + Original audio (A1, volume / mute)
  + Dubbing audio (A2, time-aligned WAV)
  + AI subtitle frame/background
  + Subtitle text for the active cue
  + Logo overlay
        ↓
     Preview
```

### Subtitle frame
- The subtitle background belongs to the full editable frame, not to the text box.
- The frame remains visible for the duration of the AI subtitle layer while CC/frame is enabled.
- The text changes by `videoCurrentTime`; long text wraps inside the frame.
- `Preview → Tùy chỉnh phụ đề` is the only subtitle editor. Edit Video does not duplicate subtitle controls.
- The active subtitle can be edited directly in the customization panel.

### TTS / A2 timing
- Automatic dubbing now sends subtitle cues (`segmentId`, `startMs`, `endMs`, `text`) to the TTS worker.
- VieNeu is loaded once per generation; each cue is synthesized separately and placed at its original start time in one master WAV.
- If generated speech is longer than the cue window, the worker time-stretches it to fit that cue before placing it.
- The resulting `TtsGenerationResult` carries aligned cue metadata for the A2 Timeline.
- Video play/seek/pause keeps A2 synchronized to the video timebase, using the aligned master WAV.

### Original audio
The existing `Giảm âm nền (-20dB)` control now matches its label: Preview applies a 0.1 linear gain to A1 (approximately -20 dB), while `Giữ nguyên` keeps the selected volume and `Tắt âm nền` mutes A1.

### Export
The final MP4 render engine is still a separate step. V47.3 does not claim that Export is a real renderer yet; the current implementation only marks export as pending.
