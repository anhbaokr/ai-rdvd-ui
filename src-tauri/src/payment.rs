use qrcode::{render::svg, EcLevel, QrCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentQrRequest {
    pub bank_bin: String,
    pub account_number: String,
    pub account_name: String,
    pub amount: u64,
    pub payment_code: String,
    pub transfer_note: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentQrResult {
    pub qr_text: String,
    pub qr_svg: String,
}

fn tlv(id: &str, value: &str) -> String {
    format!("{id}{:02}{}", value.len(), value)
}

fn crc16_ccitt_false(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xffff;
    for byte in data {
        crc ^= (*byte as u16) << 8;
        for _ in 0..8 {
            crc = if (crc & 0x8000) != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn build_qr_text(request: &PaymentQrRequest) -> Result<String, String> {
    let bank_bin = request.bank_bin.trim();
    let account_number = request.account_number.trim();
    let account_name = request.account_name.trim();
    let payment_code = request.payment_code.trim();
    let transfer_note = request.transfer_note.trim();

    if bank_bin.len() != 6 || !bank_bin.chars().all(|c| c.is_ascii_digit()) {
        return Err("Mã BIN ngân hàng phải gồm đúng 6 chữ số.".to_owned());
    }

    if !(6..=19).contains(&account_number.len())
        || !account_number.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("Số tài khoản phải dài 6–19 ký tự.".to_owned());
    }

    if account_name.is_empty() || account_name.len() > 25 || !account_name.is_ascii() {
        return Err("Tên tài khoản VietQR phải là ASCII, tối đa 25 ký tự.".to_owned());
    }

    if payment_code.is_empty() || payment_code.len() > 25 || !payment_code.is_ascii() {
        return Err("Mã thanh toán phải là ASCII, tối đa 25 ký tự.".to_owned());
    }
    if transfer_note.is_empty() || transfer_note.len() > 99 || !transfer_note.is_ascii() {
        return Err("Nội dung chuyển khoản VietQR phải là ASCII, tối đa 99 ký tự.".to_owned());
    }

    let beneficiary = tlv("00", bank_bin) + &tlv("01", account_number);
    let merchant_account = tlv("00", "A000000727")
        + &tlv("01", &beneficiary)
        + &tlv("02", "QRIBFTTA");

    let mut payload = String::new();
    payload.push_str(&tlv("00", "01"));
    payload.push_str(&tlv("01", "11"));
    payload.push_str(&tlv("38", &merchant_account));
    payload.push_str(&tlv("52", "0000"));
    payload.push_str(&tlv("53", "704"));

    if request.amount > 0 {
        payload.push_str(&tlv("54", &request.amount.to_string()));
    }

    payload.push_str(&tlv("58", "VN"));
    payload.push_str(&tlv("59", account_name));
    payload.push_str(&tlv("62", &tlv("08", transfer_note)));

    let crc_input = format!("{payload}6304");
    let crc = crc16_ccitt_false(crc_input.as_bytes());
    Ok(format!("{crc_input}{crc:04X}"))
}

#[tauri::command]
pub fn generate_payment_qr(request: PaymentQrRequest) -> Result<PaymentQrResult, String> {
    let qr_text = build_qr_text(&request)?;
    let qr = QrCode::with_error_correction_level(qr_text.as_bytes(), EcLevel::M)
        .map_err(|_| "Không tạo được mã QR thanh toán.".to_owned())?;
    let qr_svg = qr
        .render::<svg::Color>()
        .min_dimensions(320, 320)
        .build();

    Ok(PaymentQrResult { qr_text, qr_svg })
}

#[cfg(test)]
mod tests {
    use super::{build_qr_text, PaymentQrRequest};

    fn request() -> PaymentQrRequest {
        PaymentQrRequest {
            bank_bin: "970422".to_owned(),
            account_number: "1234567890".to_owned(),
            account_name: "AI RDVD".to_owned(),
            amount: 100_000,
            payment_code: "RDVD-X7K92M".to_owned(),
            transfer_note: "TEST PAYMENT - RDVD-X7K92M".to_owned(),
        }
    }

    #[test]
    fn payment_code_is_embedded() {
        let text = build_qr_text(&request()).expect("valid QR input should succeed");
        assert!(text.contains("TEST PAYMENT - RDVD-X7K92M"));
        assert!(text.ends_with("6304") == false);
        assert!(text.len() > 20);
    }

    #[test]
    fn rejects_invalid_bank_bin() {
        let mut value = request();
        value.bank_bin = "123".to_owned();
        let error = build_qr_text(&value).expect_err("invalid BIN must fail");
        assert!(error.contains("BIN"));
    }

    #[test]
    fn rejects_non_ascii_account_name() {
        let mut value = request();
        value.account_name = "AI RĐvD".to_owned();
        let error = build_qr_text(&value).expect_err("non-ASCII name must fail");
        assert!(error.contains("ASCII"));
    }
}
