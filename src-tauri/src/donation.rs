use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use qrcode::{render::svg, EcLevel, QrCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MANIFEST_JSON: &str = include_str!("../donation/donation.manifest.json");

// The public key is intentionally pinned in application source.
// The private key MUST never be shipped with the application.
const PINNED_PUBLIC_KEY_B64: &str = "Ii9ehX+iLiGBnmnfX8X7+DJNRXIIc9TbKmltCtsHdh8=";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DonationManifest {
    enabled: bool,
    schema: u32,
    author: String,
    bank_name: String,
    bank_bin: String,
    account_number: String,
    account_name: String,
    add_info: String,
    amount: Option<u64>,
    payload_hash: String,
    signature: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DonationInfo {
    status: String,
    verified: bool,
    author: String,
    bank_name: String,
    account_number: String,
    account_name: String,
    qr_svg: Option<String>,
    message: String,
}

fn empty_info(status: &str, message: &str) -> DonationInfo {
    DonationInfo {
        status: status.to_owned(),
        verified: false,
        author: String::new(),
        bank_name: String::new(),
        account_number: String::new(),
        account_name: String::new(),
        qr_svg: None,
        message: message.to_owned(),
    }
}

fn canonical_payload(manifest: &DonationManifest) -> String {
    format!(
        "AI-RDVD-DONATION-V1\n\
author={}\n\
bank_name={}\n\
bank_bin={}\n\
account_number={}\n\
account_name={}\n\
add_info={}\n\
amount={}",
        manifest.author.trim(),
        manifest.bank_name.trim(),
        manifest.bank_bin.trim(),
        manifest.account_number.trim(),
        manifest.account_name.trim(),
        manifest.add_info.trim(),
        manifest.amount.map(|v| v.to_string()).unwrap_or_default(),
    )
}

fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
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

fn qr_text(manifest: &DonationManifest) -> Result<String, String> {
    if manifest.bank_bin.len() != 6 || !manifest.bank_bin.chars().all(|c| c.is_ascii_digit()) {
        return Err("Mã BIN ngân hàng phải gồm đúng 6 chữ số.".to_owned());
    }
    if !(6..=19).contains(&manifest.account_number.len())
        || !manifest.account_number.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("Số tài khoản phải dài 6–19 ký tự.".to_owned());
    }
    if manifest.account_name.is_empty() || manifest.account_name.len() > 25 || !manifest.account_name.is_ascii() {
        return Err("Tên tài khoản dùng trong VietQR phải là ASCII, tối đa 25 ký tự.".to_owned());
    }
    if manifest.add_info.len() > 25 || !manifest.add_info.is_ascii() {
        return Err("Nội dung chuyển khoản phải là ASCII, tối đa 25 ký tự.".to_owned());
    }

    let beneficiary = tlv("00", &manifest.bank_bin)
        + &tlv("01", &manifest.account_number);
    let merchant_account = tlv("00", "A000000727")
        + &tlv("01", &beneficiary)
        + &tlv("02", "QRIBFTTA");

    let mut payload = String::new();
    payload.push_str(&tlv("00", "01"));
    payload.push_str(&tlv("01", "11"));
    payload.push_str(&tlv("38", &merchant_account));
    payload.push_str(&tlv("52", "0000"));
    payload.push_str(&tlv("53", "704"));

    if let Some(amount) = manifest.amount.filter(|value| *value > 0) {
        payload.push_str(&tlv("54", &amount.to_string()));
    }

    payload.push_str(&tlv("58", "VN"));
    payload.push_str(&tlv("59", &manifest.account_name));

    if !manifest.add_info.is_empty() {
        payload.push_str(&tlv("62", &tlv("08", &manifest.add_info)));
    }

    let crc_input = format!("{payload}6304");
    let crc = crc16_ccitt_false(crc_input.as_bytes());
    Ok(format!("{crc_input}{crc:04X}"))
}

fn verify(manifest: &DonationManifest) -> Result<(), String> {
    if !manifest.enabled {
        return Err("Donation chưa được kích hoạt.".to_owned());
    }
    if manifest.schema != 1 {
        return Err("Schema donation không được hỗ trợ.".to_owned());
    }
    if PINNED_PUBLIC_KEY_B64.is_empty() {
        return Err("Chữ ký số chưa được cấu hình.".to_owned());
    }

    let canonical = canonical_payload(manifest);
    let expected_hash = sha256_hex(canonical.as_bytes());
    if expected_hash != manifest.payload_hash.trim().to_ascii_lowercase() {
        return Err("SHA-256 của dữ liệu ủng hộ không khớp.".to_owned());
    }

    let public_bytes = STANDARD.decode(PINNED_PUBLIC_KEY_B64)
        .map_err(|_| "Public key không hợp lệ.".to_owned())?;
    let public_array: [u8; 32] = public_bytes
        .try_into()
        .map_err(|_| "Public key phải dài đúng 32 byte.".to_owned())?;
    let public_key = VerifyingKey::from_bytes(&public_array)
        .map_err(|_| "Không tạo được public key Ed25519.".to_owned())?;

    let signature_bytes = STANDARD.decode(manifest.signature.trim())
        .map_err(|_| "Signature không hợp lệ.".to_owned())?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Signature Ed25519 không hợp lệ.".to_owned())?;

    public_key.verify_strict(canonical.as_bytes(), &signature)
        .map_err(|_| "Chữ ký số không hợp lệ.".to_owned())
}

#[tauri::command]
pub fn get_donation_info() -> Result<DonationInfo, String> {
    let manifest: DonationManifest = serde_json::from_str(MANIFEST_JSON)
        .map_err(|error| format!("Không đọc được donation manifest: {error}"))?;

    match verify(&manifest) {
        Ok(()) => {
            let payload = qr_text(&manifest)?;
            let qr = QrCode::with_error_correction_level(payload.as_bytes(), EcLevel::M)
                .map_err(|_| "Không tạo được mã QR.".to_owned())?;
            let qr_svg = qr
                .render::<svg::Color>()
                .min_dimensions(260, 260)
                .build();

            Ok(DonationInfo {
                status: "verified".to_owned(),
                verified: true,
                author: manifest.author,
                bank_name: manifest.bank_name,
                account_number: manifest.account_number,
                account_name: manifest.account_name,
                qr_svg: Some(qr_svg),
                message: "Donation payload verified.".to_owned(),
            })
        }
        Err(error) if !manifest.enabled => Ok(empty_info("unconfigured", "Donation is not configured yet.")),
        Err(error) => Ok(empty_info("invalid", &error)),
    }
}
