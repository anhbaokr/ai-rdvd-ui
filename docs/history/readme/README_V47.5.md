# AI RDvD V47.5 — A2 Manual Play + Translation Guard Correction

V47.5 kế thừa V47.4 và sửa hai vấn đề xác nhận từ `ai-rdvd-technical(5).log`.

## 1. WAV A2 không tự phát khi vừa đưa xuống Timeline

Nguyên nhân là listener `canplay` của audio A2 gọi `play()` trực tiếp. Vì vậy chỉ cần WAV tải xong là audio phát, không phụ thuộc thao tác Play của người dùng.

Đã sửa:

- Khi WAV A2 được nạp hoặc đổi nguồn: chỉ `pause`, đồng bộ timecode và playback rate.
- `canplay` chỉ chuẩn bị track, tuyệt đối không phát.
- A2 chỉ phát khi video phát ra sự kiện Play/Playing sau thao tác điều khiển phát.
- Không đổi UI, Timeline hoặc vị trí track A2.

## 2. Guard dịch không còn bỏ sót câu lặp khi registry cắt sai span

Log thực tế cho thấy câu:

`Cần rất nhiều Vũ Đức chân khí cần lượng lớn Vũ Đức chân khí`

không bị guard bắt vì registry đã cắt nguồn thành `需要大量的武德真`, thay vì nhận đúng `武德真气`.

Đã sửa:

- Bổ sung phát hiện một cụm nội dung dài từ ba từ bị lặp lại ở hai vị trí, kể cả khi terminology registry không cung cấp span đúng.
- N-best reranker loại ứng viên lặp và ưu tiên câu sạch nếu model có phương án thay thế.
- REVIEW yếu từ CVDICT/Hán-Việt không có candidate đủ thẩm quyền chỉ còn là evidence nội bộ, không làm hàng loạt segment sạch thành REVIEW.
- Worker version tăng lên `1.1.1-vocalize-v010.5-airdvd-nbest-guard` để vô hiệu checkpoint đánh giá cũ.
- Không thêm hoặc sửa từ điển.

## Đối chiếu lời thoại trong log

- Câu 005 phải là: `Cần một lượng lớn Vũ Đức chân khí.`
- Câu 007 theo mạch câu 006 nên là: `vẫn muốn giúp chúng ta`, không phải `cũng phải giúp chúng ta`.
- Câu 011 trong ngữ cảnh cùng tham gia trợ giúp nên là: `Ta cũng giúp!` hoặc `Ta cũng tham gia!`, không nên dịch `Ta cũng đến.`
- Câu nguồn 015 `你下达` không hoàn chỉnh và không nối nghĩa với câu 016. Theo cấu trúc tự nhiên, khả năng cao câu nguồn đúng là `余下的`, ghép thành `余下的交给我们` — `Phần còn lại cứ giao cho chúng ta.` Cần nghe lại audio/video gốc để xác nhận tuyệt đối.

## Xác minh

- `python -m unittest discover -s tests -v`: 18/18 đạt.
- `python -m compileall -q backend`: đạt.
- `npm run build`: đạt.
- Không có thay đổi dữ liệu từ điển, UI/CSS, TTS synthesis hay timecode.

