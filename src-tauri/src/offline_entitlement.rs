use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::DateTime;
use rsa::{
    pkcs1v15::{Signature as RsaPkcs1v15Signature, VerifyingKey},
    pkcs8::DecodePublicKey,
    signature::Verifier,
    RsaPublicKey,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

const OFFLINE_ENTITLEMENT_VERSION: u32 = 1;
const OFFLINE_ENTITLEMENT_ALGORITHM: &str = "RS256";
const OFFLINE_ENTITLEMENT_KEY_ID: &str = "OFFLINE-45FAA6FDFA6DE98B";
const OFFLINE_ENTITLEMENT_CONTEXT: &str = "AI-RDvD|offline_entitlement_v1|";
const OFFLINE_GRACE_MAX_MS: u64 = 72 * 60 * 60 * 1000;
const OFFLINE_ISSUED_AT_FUTURE_SKEW_MS: u64 = 5 * 60 * 1000;
const MAX_ENCODED_PAYLOAD_BYTES: usize = 32 * 1024;
const MAX_ENCODED_SIGNATURE_BYTES: usize = 8 * 1024;
const OFFLINE_ENTITLEMENT_PUBLIC_KEY_PEM: &str =
    include_str!("offline_entitlement_public_key.pem");

#[derive(Debug, Deserialize)]
struct OfflineEntitlementEnvelope {
    version: u32,
    alg: String,
    key_id: String,
    payload: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct OfflineEntitlementPayload {
    entitlement_version: u32,
    license_id: String,
    #[serde(default)]
    order_id: String,
    machine_id: String,
    device_fingerprint: String,
    package: String,
    license_status: String,
    #[serde(default)]
    license_expires_at: String,
    issued_at_ms: u64,
    offline_grace_expires_at_ms: u64,
    nonce: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineEntitlementVerification {
    pub valid: bool,
    pub key_id: String,
    pub license_id: String,
    pub order_id: String,
    pub package: String,
    pub issued_at_ms: u64,
    pub offline_grace_expires_at_ms: u64,
    pub license_expires_at: String,
    pub license_expires_at_ms: Option<u64>,
}

fn current_time_ms() -> Result<u64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Đồng hồ hệ thống nằm trước UNIX epoch.".to_owned())?;

    u64::try_from(elapsed.as_millis())
        .map_err(|_| "Mốc thời gian hệ thống vượt giới hạn hỗ trợ.".to_owned())
}

fn parse_license_expiry_ms(value: &str) -> Result<Option<u64>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }

    let parsed = DateTime::parse_from_rfc3339(value)
        .map_err(|_| "license_expires_at trong entitlement không phải RFC3339 hợp lệ.".to_owned())?;
    let millis = parsed.timestamp_millis();

    if millis <= 0 {
        return Err("license_expires_at trong entitlement không hợp lệ.".to_owned());
    }

    Ok(Some(millis as u64))
}

fn validate_nonce(value: &str) -> Result<(), String> {
    if value.len() != 32 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Nonce của offline entitlement không hợp lệ.".to_owned());
    }
    Ok(())
}

fn verify_with_context(
    entitlement: Value,
    expected_machine_id: &str,
    expected_device_fingerprint: &str,
    now_ms: u64,
    public_key_pem: &str,
    expected_key_id: &str,
) -> Result<OfflineEntitlementVerification, String> {
    let envelope = serde_json::from_value::<OfflineEntitlementEnvelope>(entitlement)
        .map_err(|error| format!("Offline entitlement envelope không hợp lệ: {error}"))?;

    if envelope.version != OFFLINE_ENTITLEMENT_VERSION {
        return Err(format!(
            "Offline entitlement version không được hỗ trợ: {}.",
            envelope.version
        ));
    }

    if envelope.alg != OFFLINE_ENTITLEMENT_ALGORITHM {
        return Err("Offline entitlement algorithm phải là RS256.".to_owned());
    }

    if envelope.key_id != expected_key_id {
        return Err("Offline entitlement key_id không khớp public key đã pin.".to_owned());
    }

    if envelope.payload.is_empty() || envelope.payload.len() > MAX_ENCODED_PAYLOAD_BYTES {
        return Err("Offline entitlement payload có kích thước không hợp lệ.".to_owned());
    }

    if envelope.signature.is_empty() || envelope.signature.len() > MAX_ENCODED_SIGNATURE_BYTES {
        return Err("Offline entitlement signature có kích thước không hợp lệ.".to_owned());
    }

    let signature_bytes = URL_SAFE_NO_PAD
        .decode(envelope.signature.as_bytes())
        .map_err(|_| "Không giải mã được offline entitlement signature dạng base64url.".to_owned())?;
    let signature = RsaPkcs1v15Signature::try_from(signature_bytes.as_slice())
        .map_err(|_| "Offline entitlement signature không đúng kích thước RSA.".to_owned())?;

    let public_key = RsaPublicKey::from_public_key_pem(public_key_pem)
        .map_err(|error| format!("Public key offline entitlement không hợp lệ: {error}"))?;
    let verifying_key = VerifyingKey::<Sha256>::new(public_key);
    let canonical = format!("{OFFLINE_ENTITLEMENT_CONTEXT}{}", envelope.payload);

    verifying_key
        .verify(canonical.as_bytes(), &signature)
        .map_err(|_| "Offline entitlement signature không hợp lệ.".to_owned())?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(envelope.payload.as_bytes())
        .map_err(|_| "Không giải mã được offline entitlement payload dạng base64url.".to_owned())?;

    if payload_bytes.is_empty() || payload_bytes.len() > MAX_ENCODED_PAYLOAD_BYTES {
        return Err("Offline entitlement payload sau giải mã có kích thước không hợp lệ.".to_owned());
    }

    let payload = serde_json::from_slice::<OfflineEntitlementPayload>(&payload_bytes)
        .map_err(|error| format!("Offline entitlement payload JSON không hợp lệ: {error}"))?;

    if payload.entitlement_version != OFFLINE_ENTITLEMENT_VERSION {
        return Err(format!(
            "Offline entitlement payload version không được hỗ trợ: {}.",
            payload.entitlement_version
        ));
    }

    if payload.license_id.trim().is_empty() {
        return Err("Offline entitlement thiếu license_id.".to_owned());
    }

    if payload.package.trim().is_empty() {
        return Err("Offline entitlement thiếu package.".to_owned());
    }

    if payload.machine_id != expected_machine_id {
        return Err("Offline entitlement không thuộc machine_id của máy hiện tại.".to_owned());
    }

    if payload.device_fingerprint != expected_device_fingerprint {
        return Err("Offline entitlement không thuộc device fingerprint của máy hiện tại.".to_owned());
    }

    if payload.license_status != "ACTIVE" {
        return Err("Offline entitlement không có license_status ACTIVE.".to_owned());
    }

    validate_nonce(&payload.nonce)?;

    if payload.issued_at_ms == 0 {
        return Err("Offline entitlement issued_at_ms không hợp lệ.".to_owned());
    }

    if payload.offline_grace_expires_at_ms <= payload.issued_at_ms {
        return Err("Offline entitlement grace expiry không lớn hơn issued_at.".to_owned());
    }

    let grace_ms = payload.offline_grace_expires_at_ms - payload.issued_at_ms;
    if grace_ms > OFFLINE_GRACE_MAX_MS {
        return Err("Offline entitlement vượt quá giới hạn grace 72 giờ.".to_owned());
    }

    if payload.issued_at_ms > now_ms.saturating_add(OFFLINE_ISSUED_AT_FUTURE_SKEW_MS) {
        return Err("Offline entitlement issued_at nằm quá xa trong tương lai.".to_owned());
    }

    if now_ms >= payload.offline_grace_expires_at_ms {
        return Err("Offline entitlement đã hết offline grace.".to_owned());
    }

    let license_expires_at_ms = parse_license_expiry_ms(&payload.license_expires_at)?;
    if let Some(expiry_ms) = license_expires_at_ms {
        if payload.offline_grace_expires_at_ms > expiry_ms {
            return Err("Offline entitlement grace vượt quá thời hạn license.".to_owned());
        }

        if now_ms >= expiry_ms {
            return Err("License trong offline entitlement đã hết hạn.".to_owned());
        }
    }

    Ok(OfflineEntitlementVerification {
        valid: true,
        key_id: envelope.key_id,
        license_id: payload.license_id,
        order_id: payload.order_id,
        package: payload.package,
        issued_at_ms: payload.issued_at_ms,
        offline_grace_expires_at_ms: payload.offline_grace_expires_at_ms,
        license_expires_at: payload.license_expires_at,
        license_expires_at_ms,
    })
}

pub(crate) fn verify_offline_entitlement(
    entitlement: Value,
    expected_machine_id: &str,
    expected_device_fingerprint: &str,
) -> Result<OfflineEntitlementVerification, String> {
    verify_with_context(
        entitlement,
        expected_machine_id,
        expected_device_fingerprint,
        current_time_ms()?,
        OFFLINE_ENTITLEMENT_PUBLIC_KEY_PEM,
        OFFLINE_ENTITLEMENT_KEY_ID,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TEST_PUBLIC_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsB640+eDyeebe+sF2P9c
1n7UQFbU8FI+MeS3fHyYgKdotgd+wrzcchyoRMQhLCqCsc0FjOYpIlgps/89WrHY
tqs3fqa1n2b6L2qX+SXn2sZxXvXR1KEDIXkbW2h9jyYjXhwFdtqauu3nwbGxJyCP
dexWG3aD+nhkAiorasXSB13d+TYGxjcvwlsFH35LQlb2bCtn14h9eFBxUzEZ9160
9ZHreIhYuNRsry5300L70q6V5SIVX/mFh/UfNTdPajmvINfLZeo1OpEcBNSi0oRy
GZujFp0vkMQ4F4Ta7dRDF28v4jo8pQ+aB+cbaV7kkqaLPM4ZspQQRkLwJ2/DvkID
jQIDAQAB
-----END PUBLIC KEY-----"#;

    const TEST_PAYLOAD: &str = "eyJlbnRpdGxlbWVudF92ZXJzaW9uIjoxLCJsaWNlbnNlX2lkIjoiTElDLVRFU1QtMTBCIiwib3JkZXJfaWQiOiJPUkQtVEVTVC0xMEIiLCJtYWNoaW5lX2lkIjoibWFjaGluZV9pZF92MV9hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwiZGV2aWNlX2ZpbmdlcnByaW50IjoiZGV2aWNlX2ZwX3YxX2JiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmIiLCJwYWNrYWdlIjoiTU9OVEhfMSIsImxpY2Vuc2Vfc3RhdHVzIjoiQUNUSVZFIiwibGljZW5zZV9leHBpcmVzX2F0IjoiMjAyNC0xMC0yOFQwNDoyMDowMC4wMDBaIiwiaXNzdWVkX2F0X21zIjoxNzMwMDAwMDAwMDAwLCJvZmZsaW5lX2dyYWNlX2V4cGlyZXNfYXRfbXMiOjE3MzAwMDM2MDAwMDAsIm5vbmNlIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYifQ";
    const TEST_SIGNATURE: &str = "EiPTT1lMdw5DRpcQBzKwWml3DT5mEjWukQCKQJMhjnSnSxv2mqrCsBZkpmq8jTBLadWosQPVBFk-4607bmH9u3A71qGCoK5L65N51uoWZ_jWXKu8fT2ogZJGGYFCxEqiJAL2dwkOYc56hdkVh3esGcDTdSo1wdMS-xKzBvBAiqeRxdW4tv1XlzSiEs5BmcFz4IbMRlZnsICBOc-UB_xXZTcRagw1FIwzATuFfllhGqfMvPRNHHwId32gHIN57tR7YHGb7c16CGPnmtKrx5hYFOF_A4iPmw9y4WhNGwtUq2SC2gmU9ZfjEKtrApzeytRmUZuustekV2UN1eAquu9A0g";
    const TEST_KEY_ID: &str = "TEST-KEY-10B";
    const TEST_MACHINE_ID: &str = "machine_id_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TEST_DEVICE_FP: &str = "device_fp_v1_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn valid_entitlement() -> Value {
        json!({
            "version": 1,
            "alg": "RS256",
            "key_id": TEST_KEY_ID,
            "payload": TEST_PAYLOAD,
            "signature": TEST_SIGNATURE
        })
    }

    #[test]
    fn production_public_key_parses() {
        RsaPublicKey::from_public_key_pem(OFFLINE_ENTITLEMENT_PUBLIC_KEY_PEM)
            .expect("pinned production public key must parse");
    }

    #[test]
    fn valid_rs256_fixture_passes() {
        let result = verify_with_context(
            valid_entitlement(),
            TEST_MACHINE_ID,
            TEST_DEVICE_FP,
            1_730_000_001_000,
            TEST_PUBLIC_KEY_PEM,
            TEST_KEY_ID,
        )
        .expect("valid signed fixture must verify");

        assert!(result.valid);
        assert_eq!(result.license_id, "LIC-TEST-10B");
        assert_eq!(result.package, "MONTH_1");
    }

    #[test]
    fn wrong_machine_is_rejected() {
        let error = verify_with_context(
            valid_entitlement(),
            "machine_id_v1_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            TEST_DEVICE_FP,
            1_730_000_001_000,
            TEST_PUBLIC_KEY_PEM,
            TEST_KEY_ID,
        )
        .expect_err("machine mismatch must fail");

        assert!(error.contains("machine_id"));
    }

    #[test]
    fn expired_grace_is_rejected() {
        let error = verify_with_context(
            valid_entitlement(),
            TEST_MACHINE_ID,
            TEST_DEVICE_FP,
            1_730_003_600_000,
            TEST_PUBLIC_KEY_PEM,
            TEST_KEY_ID,
        )
        .expect_err("expired grace must fail");

        assert!(error.contains("hết offline grace"));
    }

    #[test]
    fn tampered_payload_is_rejected_by_signature() {
        let mut entitlement = valid_entitlement();
        entitlement["payload"] = Value::String(format!("{}A", TEST_PAYLOAD));

        let error = verify_with_context(
            entitlement,
            TEST_MACHINE_ID,
            TEST_DEVICE_FP,
            1_730_000_001_000,
            TEST_PUBLIC_KEY_PEM,
            TEST_KEY_ID,
        )
        .expect_err("tampered payload must fail signature verification");

        assert!(error.contains("signature"));
    }
}
