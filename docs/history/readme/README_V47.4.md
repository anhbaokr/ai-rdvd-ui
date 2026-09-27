# AI RDvD V47.4 — Terminology-aware N-best Translation

V47.4 sửa tầng ra quyết định của pipeline dịch, không thay đổi giao diện, luồng media, TTS, phụ đề hoặc dữ liệu từ điển của V47.3.

## Thay đổi chính

- Hachimi tạo tối đa bốn phương án dịch bằng beam search thay vì chỉ trả một câu duy nhất.
- Mỗi phương án được chấm qua `MeaningGuard`, `SemanticEvidence` và độ phủ của `TerminologyPlan`.
- Pipeline ưu tiên phương án ít lỗi/nguy cơ nhất, sau đó mới xét độ phủ thuật ngữ và điểm của model.
- Thuật ngữ `mandatory`/`series` vẫn là ràng buộc cứng; thiếu thuật ngữ này là `FAIL`.
- Thiếu thuật ngữ ngữ cảnh hoặc `domain_glossary` là `REVIEW`, không biến toàn bộ pipeline thành lỗi kỹ thuật.
- CVDICT và Hán-Việt vẫn là bằng chứng hỗ trợ lựa chọn, không bị ép máy móc vào mọi câu.
- `MeaningGuard` phát hiện một đơn vị nguồn chỉ xuất hiện một lần nhưng cụm dịch tương ứng bị sinh lặp nhiều lần.
- Quyết định `REVIEW` từ `TerminologyPlanner` không còn có thể âm thầm trở thành `PASS`.
- Worker version được tăng để không tái sử dụng checkpoint cũ đã được đánh giá theo luật trước đây.
- Full technical log ghi chiến lược chọn, số ứng viên, rank được chọn, điểm model và độ phủ thuật ngữ cho từng segment.

## Không thay đổi

- Không thêm, sửa hoặc mở rộng bất kỳ từ điển/lexicon nào.
- Không đổi UI và không thêm nút mới.
- Không đổi định dạng file lời thoại có timecode.
- Không đổi luồng TTS, WAV A2, phụ đề, Timeline hay Preview của V47.3.

## Thứ tự trạng thái

- `PASS`: không có finding.
- `REVIEW`: có cảnh báo cần người dùng xem lại nhưng vẫn được phép sửa/duyệt.
- `FAIL`: có lỗi nghĩa hoặc vi phạm thuật ngữ bắt buộc; TTS tiếp tục bị chặn.

## Xác minh

- `python -m unittest discover -s tests -v`: 15/15 đạt.
- `python -m compileall -q backend`: đạt.
- `npm run build`: đạt.
- Có kiểm thử hồi quy cho trường hợp `武德真气` bị model sinh lặp hai lần; N-best reranker loại câu lỗi và chọn câu sạch.
- `cargo check` chưa chạy tại môi trường đóng gói vì không có Rust toolchain; thay đổi Rust chỉ đọc trường JSON tùy chọn để ghi log.

