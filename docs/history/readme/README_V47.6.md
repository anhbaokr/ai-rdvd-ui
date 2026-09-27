# AI RDvD V47.6 — A1/A2 Independent Gain + Pipeline Progress

V47.6 kế thừa trực tiếp V47.5. Bản này không thay đổi từ điển, quy tắc dịch, timecode hay bố cục hiện có ngoài khối tiến trình được yêu cầu dưới Live Log.

## 1. Tách âm lượng nền A1 khỏi lồng tiếng A2

Đối chiếu mã nguồn cho thấy chế độ giảm âm nền trước đây chỉ đặt âm lượng cho thẻ video A1. Tuy nhiên A2 chưa được khóa gain độc lập, còn WAV sinh ra có thể có peak thấp nên khi nghe cùng video dễ tạo cảm giác cả hai track cùng bị giảm.

Đã sửa:

- A1 tiếp tục dùng chế độ hiện tại: giữ nguyên, giảm còn 10% hoặc tắt.
- A2 được đặt âm lượng độc lập ở `1.0` (0 dB), không lấy theo thanh âm lượng nền A1.
- WAV đầu ra được chuẩn hóa peak hướng tới `0.92`, giới hạn mức khuếch đại tối đa 4 lần (+12 dB) để tránh khuếch đại nhiễu quá mức.
- Worker ghi gain thực tế vào technical log để có thể kiểm tra từng lần tạo.
- Chặn yêu cầu phát A2 trùng lặp và bỏ qua `AbortError` phát sinh khi trình phát bị đồng bộ lại hợp lệ.
- WAV A2 vẫn chỉ phát khi video được người dùng cho phát; nạp WAV xuống Timeline không tự phát.

## 2. Thanh tiến trình thực bên dưới Live Log

Khối tiến trình nằm ngay dưới hàng tiêu đề/nút của Live Log và hiển thị phần trăm cạnh thanh.

- Dịch: cập nhật theo số segment đã xử lý.
- Tạo giọng: worker phát tiến trình theo từng cue/chunk, gồm nạp engine, tổng hợp, ghi WAV và hoàn tất.
- Luồng tự động: ánh xạ từng giai đoạn nhận dạng, dịch, lồng tiếng và cập nhật Timeline/phụ đề vào tiến độ tổng.
- Màu thanh chuyển dần từ xanh qua vàng đến đỏ khi đạt 100%.
- Trạng thái lỗi được hiển thị rõ; các mốc chính vẫn lấy từ tiến độ thật của worker.
- Trong lúc model đang nạp hoặc một cue dài đang tổng hợp mà worker chưa có mốc mới, thanh dùng tiến độ chờ có giới hạn để tiếp tục chuyển động. Tiến độ này không bao giờ tự đạt 100%; kết quả thật của worker mới được quyền hoàn tất thanh.

## 3. Popup Tùy chỉnh phụ đề

- Nhấp bên trong popup hoặc nút mở không làm popup đóng.
- Nhấp chuột ra ngoài popup sẽ tự động ẩn popup.
- Nút đóng và phím tắt hiện có vẫn giữ nguyên.

## 4. Phụ đề review một dòng và nền tự ôm nội dung

- Câu ngắn dùng khung nền ngắn, không kéo nền tràn hết vùng chọn.
- Mặc định mới: preset CSS cố định `AI RDvD Review` dựa trên Arial/Segoe UI đầy đủ dấu tiếng Việt, chữ trắng, in hoa, đậm, nghiêng nhẹ bằng CSS và viền đen sắc 4 px.
- Phụ đề luôn giữ một dòng; câu dài tự co tỷ lệ ngang trong vùng tối đa thay vì xuống dòng hoặc tràn khỏi video.
- Khung mặc định rộng toàn bộ video 1920 px, sát hai mép trái/phải và vẫn có thể kéo/thu lại thủ công.
- Nền phủ toàn bộ khung ngang để che phụ đề gốc; mặc định đen nâu `#1B1014` ở giữa và mờ dần tại 16% hai đầu khung.

## 5. Chia lượt phụ đề dài trong đúng timecode

- Khung mặc định theo ảnh tham chiếu mới: `1580 × 140`, tâm `X=960`, `Y=930`, chừa đều hai mép video.
- Câu ngắn hiển thị nguyên câu trong một lượt.
- Câu dài được chia tại ranh giới từ thành nhiều lượt một dòng, không cắt giữa từ.
- Thời lượng cue gốc được chia theo độ dài tương đối của từng phần; phần dài nhận nhiều thời gian hơn.
- Các lượt con nối tiếp liên tục trong timecode gốc, không sửa cue dùng cho SRT, Timeline hay TTS.
- Nếu cue kế tiếp bắt đầu trước khi cue hiện tại kết thúc, lượt hiện tại bị cắt đúng tại thời điểm cue kế tiếp bắt đầu. Vì vậy hai phụ đề không bao giờ đè lên nhau.

## 6. Tỷ lệ phụ đề responsive theo video

- Cỡ chữ và viền được quy đổi từ hệ thiết kế `1920 × 1080` bằng container query, không còn dùng pixel Preview cố định.
- Preview nhỏ và chế độ toàn màn hình dùng cùng một thông số dự án nhưng hiển thị theo đúng tỷ lệ video, tránh chữ bị khung cắt ở cửa sổ nhỏ.
- Padding dọc cố định đã được loại bỏ; khoảng đệm co giãn theo chiều rộng khung hình.
- Bộ mặc định theo ảnh kiểm tra: `X=964.21`, `Y=877.69`, khung `1580 × 140`, cỡ chữ `40`, chữ `#FFFFFF`, nền `#363032`, trong suốt `1%`, viền bật và dày `4`.

## Xác minh

- `python -m py_compile backend/tts_worker.py backend/translation_worker.py`: đạt.
- `python -m unittest discover -s tests -v`: 18/18 đạt.
- `npm run build`: đạt.
- Môi trường đóng gói hiện tại không có Cargo nên chưa chạy được `cargo check`; phần Rust đã được giữ theo contract Tauri hiện có và cần được biên dịch xác nhận trên máy Windows có Rust/Tauri toolchain.
