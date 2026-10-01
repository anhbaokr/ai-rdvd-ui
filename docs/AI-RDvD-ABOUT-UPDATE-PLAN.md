# AI RDvD — BẢNG KẾ HOẠCH & ĐỊNH HƯỚNG PHIÊN SAU

## 0. Mục đích
File này là mốc tham chiếu để dùng lại trong các phiên sau. Khi gửi lại file, phải đọc và bám đúng kế hoạch trước khi đề xuất hoặc thực hiện thay đổi.

Mục tiêu:
1. Hoàn thiện About + Ủng hộ tác giả.
2. Giữ nguyên các phần Recognition / Timeline đang ổn.
3. Sau khi About hoàn thiện và kiểm tra ổn định, chuyển sang thiết kế và triển khai hệ thống Update.

## 1. Project root — bắt buộc
Project chính: `E:\\ai-rdvd-ui`

Không sử dụng: `E:\\ai-rdvd-ui-current-v0098`

Không tự ý đổi project root.

## 2. Nguyên tắc làm việc
- Không sửa lan sang các phần không liên quan.
- Không "fix mù"; phải audit code hiện tại trước patch.
- Giữ nguyên cấu trúc/chức năng đang hoạt động.
- Không phá hoặc hoàn tác các timing fix hiện có.
- Không đụng Recognition / Timeline / A1 / V1 / S1 / A2 trừ khi người dùng yêu cầu trực tiếp.
- Không dùng `git restore`, `reset`, `clean`, `stash`.
- Không commit / tag / push nếu chưa được người dùng cho phép.
- Không tự ý thay đổi policy/workflow.
- Không hardcode workaround cho một video/test case cụ thể.
- Khi thiếu thông tin: hỏi hoặc yêu cầu file/code thực tế, không đoán.

# PHASE A — ABOUT + ỦNG HỘ TÁC GIẢ

## A1. Giao diện
Không đưa thông tin tác giả vào Settings nữa.

Thêm nút **ⓘ About** trực tiếp ngoài UI chính, đặt cạnh **⚙ Settings** trong Topbar.

## A2. Popup About
Hành vi bắt buộc:
1. Hover vào ⓘ → popup tự hiện.
2. Di chuột từ nút vào popup → popup vẫn giữ nguyên.
3. Rời khỏi cả nút và popup → popup tự ẩn sau delay khoảng 150–250 ms để tránh nhấp nháy.
4. Click vào nút → popup mở.
5. Click bên ngoài toàn bộ vùng nút + popup → popup đóng ngay.
6. Người dùng phải có thể rê vào QR, copy STK và bấm link nếu có.
7. Không bắt buộc nút Đóng.

## A3. Nội dung popup
Tối thiểu:
- AI RDvD
- Phiên bản
- Tác giả
- Mô tả ngắn ứng dụng
- Thông tin ủng hộ
- QR chuyển khoản
- Ngân hàng
- Số tài khoản
- Chủ tài khoản
- Nút sao chép số tài khoản

Có thể mở rộng sau: GitHub, website, Facebook, email/liên hệ.

# PHASE B — BẢO VỆ QR / THÔNG TIN ỦNG HỘ

## B1. Không dùng QR image làm nguồn dữ liệu chính
Không thiết kế theo kiểu chỉ có `assets/donation-qr.png`.

Mục tiêu:
**Thông tin tài khoản → xác thực → tạo QR động lúc runtime.**

## B2. Level 1 — SHA-256
Dùng canonical payload cố định, ví dụ:

```text
AI-RDVD-DONATION-V1
author=...
bank=...
account=...
owner=...
```

Sau đó tính SHA-256 để phát hiện payload bị thay đổi.

SHA-256 chỉ là integrity check, không phải bằng chứng nguồn phát hành.

## B3. Level 2 — Ed25519 digital signature
Tạo:
- PRIVATE KEY — chỉ tác giả giữ, không đưa vào source/app/GitHub.
- PUBLIC KEY — được nhúng vào app.

Quy trình phát hành:
`payload → canonical form → ký bằng PRIVATE KEY → signature`

Quy trình app:
`payload + signature + PUBLIC KEY → verify`

Payload bị sửa → chữ ký không hợp lệ → không hiển thị QR chính thức.

## B4. Level 3 — Runtime verification
Luồng:
`About → Tauri/Rust verify → SHA-256 check → Ed25519 verify → PASS → tạo QR VietQR`

Nếu FAIL, không tạo/không hiển thị QR chính thức. Có thể báo:
> ⚠ Thông tin ủng hộ không hợp lệ. Dữ liệu xác thực đã bị thay đổi.

## B5. Resource integrity
Có thể mở rộng bằng manifest/signature riêng, ví dụ:
- `donation_manifest`
- `donation_signature`
- `public_key`

Chỉ triển khai nếu audit code cho thấy cần.

## B6. Giới hạn thực tế
Không tuyên bố bảo vệ 100% trên desktop. Người có toàn quyền trên máy vẫn có thể patch binary. Mục tiêu là chặn thay file/dữ liệu đơn giản và phát hiện thay đổi bằng chữ ký.

# PHASE C — TẠO QR

Kiến trúc:
`Thông tin tài khoản đã xác thực → dữ liệu VietQR → QR renderer → About popup`

Tauri/Rust chịu trách nhiệm về dữ liệu xác thực; frontend có thể render QR từ dữ liệu hợp lệ.

Không để một ảnh QR tùy ý trở thành nguồn sự thật.

# PHASE D — PHẠM VI CODE DỰ KIẾN

Frontend có khả năng liên quan:
- `src/components/topbar/Topbar.tsx`
- `src/components/settings/SettingsDialog.tsx` (chỉ kiểm tra/loại trừ, không đưa About vào Settings)
- `src/types.ts`
- có thể thêm About component riêng
- có thể thêm utility QR riêng

Backend:
- `src-tauri/src/lib.rs`
- có thể thêm `src-tauri/src/donation.rs`

Dependencies có thể cần:
- SHA-256 crate
- Ed25519 crate
- thư viện QR phù hợp

Không tự ý thêm dependency trước khi kiểm tra tương thích Rust hiện tại.

# PHASE E — TIÊU CHÍ HOÀN THÀNH ABOUT

- [ ] Nút ⓘ xuất hiện ngoài UI chính.
- [ ] Nút nằm cạnh Settings.
- [ ] Hover mở popup.
- [ ] Popup giữ khi di chuột từ nút vào popup.
- [ ] Rời vùng thì popup tự ẩn.
- [ ] Click nút mở popup.
- [ ] Click ngoài đóng popup.
- [ ] Có thông tin tác giả.
- [ ] Có phiên bản.
- [ ] Có thông tin ủng hộ.
- [ ] Có QR từ dữ liệu đã xác thực.
- [ ] Có SHA-256 verification.
- [ ] Có Ed25519 verification.
- [ ] Dữ liệu sai không tạo QR chính thức.
- [ ] Không ảnh hưởng Recognition.
- [ ] Không ảnh hưởng Timeline.
- [ ] Không ảnh hưởng A1.
- [ ] Không ảnh hưởng V1.
- [ ] Không ảnh hưởng S1.
- [ ] Không ảnh hưởng A2.
- [ ] Không ảnh hưởng Settings hiện tại.

# PHASE F — SAU KHI ABOUT HOÀN THIỆN

Không chuyển sang Update khi About chưa được kiểm tra ổn định.

Thứ tự:
1. Implement About.
2. Kiểm tra UI.
3. Kiểm tra integrity/security.
4. Build/test.
5. Xác nhận ổn định.
6. Chuyển sang thiết kế Update.

# PHASE G — UPDATE SYSTEM (GIAI ĐOẠN KẾ TIẾP)

Luồng mục tiêu:
`AI RDvD → kiểm tra phiên bản → có bản mới? → thông báo → download → SHA-256 verification → digital signature verification → cài update → restart app`

Phải nghiên cứu/audit trước khi triển khai:
- nguồn update;
- version manifest;
- checksum;
- chữ ký;
- rollback/failure;
- update an toàn trên Windows;
- xử lý mất mạng/download lỗi;
- kiểm tra package trước khi cài.

Update phải dùng cùng tư duy bảo mật với About: hash + digital signature, không tin package chỉ vì tên file đúng.

# PHASE H — ĐIỂM KIỂM SOÁT CHỐNG ĐI LỆCH HƯỚNG

Nếu đề xuất hoặc patch đi lệch, kiểm tra:
1. Có đưa About trở lại Settings không?
2. Có dùng QR image làm nguồn dữ liệu chính không?
3. Có bỏ SHA-256 không?
4. Có bỏ Ed25519 không?
5. Có đưa PRIVATE KEY vào app/source không?
6. Có đụng Recognition / Timeline / A1 / V1 / S1 / A2 ngoài phạm vi không?
7. Có sửa code mà chưa audit file hiện tại không?
8. Có dùng restore/reset/clean/stash không?
9. Có commit/tag/push trái phép không?
10. Có chuyển sang Update khi About chưa hoàn thành không?

Nếu bất kỳ mục nào là **có**: dừng patch và quay lại kế hoạch này.

# TÓM TẮT 1 DÒNG

**ABOUT + ỦNG HỘ NGOÀI UI → POPUP HOVER/CLICK → QR ĐỘNG → SHA-256 → ED25519 → VERIFY RUNTIME → HOÀN THIỆN/TEST → SAU ĐÓ MỚI THIẾT KẾ UPDATE.**

END OF PLAN
