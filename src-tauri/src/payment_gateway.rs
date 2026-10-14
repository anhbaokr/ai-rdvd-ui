use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentGatewayPostRequest {
    pub url: String,
    pub body: String,
}

fn request_action(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("action").and_then(|item| item.as_str()).map(str::to_owned))
        .unwrap_or_else(|| "unknown".to_owned())
}

static DESKTOP_NONCE_COUNTER: AtomicU64 = AtomicU64::new(1);

const DESKTOP_ACCESS_PROTECTED_ACTIONS: &[&str] = &[
    "getAccessState",
    "createOrder",
    "checkOrder",
    "cancelOrder",
    "checkLicense",
    "activateDevice",
];

fn is_desktop_access_protected_action(action: &str) -> bool {
    DESKTOP_ACCESS_PROTECTED_ACTIONS.contains(&action)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn sha256_hex(value: &str) -> String {
    bytes_to_hex(&Sha256::digest(value.as_bytes()))
}

fn hmac_sha256_hex(secret: &str, message: &str) -> String {
    const BLOCK_SIZE: usize = 64;

    let mut key_block = [0u8; BLOCK_SIZE];
    let secret_bytes = secret.as_bytes();

    if secret_bytes.len() > BLOCK_SIZE {
        let hashed = Sha256::digest(secret_bytes);
        key_block[..hashed.len()].copy_from_slice(&hashed);
    } else {
        key_block[..secret_bytes.len()].copy_from_slice(secret_bytes);
    }

    let mut inner_pad = [0u8; BLOCK_SIZE];
    let mut outer_pad = [0u8; BLOCK_SIZE];

    for index in 0..BLOCK_SIZE {
        inner_pad[index] = key_block[index] ^ 0x36;
        outer_pad[index] = key_block[index] ^ 0x5c;
    }

    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message.as_bytes());
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_hash);

    bytes_to_hex(&outer.finalize())
}

fn desktop_access_secret() -> Result<String, String> {
    if let Ok(value) = std::env::var("AI_RDVD_DESKTOP_ACCESS_SECRET") {
        let value = value.trim().to_owned();
        if (32..=256).contains(&value.len()) && value.is_ascii() {
            return Ok(value);
        }
    }

    if let Some(value) = option_env!("AI_RDVD_DESKTOP_ACCESS_SECRET") {
        let value = value.trim().to_owned();
        if (32..=256).contains(&value.len()) && value.is_ascii() {
            return Ok(value);
        }
    }

    Err(
        "Desktop access security secret chưa được cấu hình khi build."
            .to_owned(),
    )
}

fn current_timestamp_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Không đọc được system time: {error}"))?;

    u64::try_from(duration.as_millis())
        .map_err(|_| "System time vượt quá giới hạn.".to_owned())
}

fn next_desktop_nonce(
    machine_id: &str,
    device_fingerprint: &str,
    action: &str,
    timestamp_ms: u64,
    body: &str,
) -> String {
    let counter = DESKTOP_NONCE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();

    let seed = format!(
        "{timestamp_ms}|{nanos}|{}|{counter}|{machine_id}|{device_fingerprint}|{action}|{body}",
        std::process::id()
    );

    sha256_hex(&seed)[..32].to_owned()
}

fn augment_desktop_access_request(
    action: &str,
    body: &str,
) -> Result<String, String> {
    let mut value = serde_json::from_str::<Value>(body)
        .map_err(|error| format!("Desktop request JSON không hợp lệ: {error}"))?;

    let object = value
        .as_object_mut()
        .ok_or_else(|| "Desktop request body phải là JSON object.".to_owned())?;

    let machine_id = crate::license::machine_id_value()?;
    let device_fingerprint = crate::license::device_fingerprint_value()?;
    let app_version = env!("CARGO_PKG_VERSION");
    let timestamp_ms = current_timestamp_ms()?;
    let nonce = next_desktop_nonce(
        &machine_id,
        &device_fingerprint,
        action,
        timestamp_ms,
        body,
    );

    let canonical = format!(
        "1|DESKTOP-01|{action}|{machine_id}|{device_fingerprint}|{app_version}|{timestamp_ms}|{nonce}"
    );

    let signature = hmac_sha256_hex(
        &desktop_access_secret()?,
        &canonical,
    );

    object.insert(
        "machine_id".to_owned(),
        Value::String(machine_id),
    );
    object.insert(
        "device_fingerprint".to_owned(),
        Value::String(device_fingerprint),
    );
    object.insert(
        "app_version".to_owned(),
        Value::String(app_version.to_owned()),
    );
    object.insert(
        "desktop_security_version".to_owned(),
        Value::from(1u64),
    );
    object.insert(
        "desktop_client_id".to_owned(),
        Value::String("DESKTOP-01".to_owned()),
    );
    object.insert(
        "desktop_timestamp_ms".to_owned(),
        Value::from(timestamp_ms),
    );
    object.insert(
        "desktop_nonce".to_owned(),
        Value::String(nonce),
    );
    object.insert(
        "desktop_signature".to_owned(),
        Value::String(signature),
    );

    serde_json::to_string(&value)
        .map_err(|error| format!("Không serialize được Desktop request: {error}"))
}

fn redirect_url_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    matches!(
        url.host_str(),
        Some("script.google.com") | Some("script.googleusercontent.com")
    )
}

fn append_payment_log(app: &tauri::AppHandle, lines: Vec<String>) {
    let _ = crate::append_log_lines(app, &lines);
}

fn validate_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|error| format!("URL Payment Gateway không hợp lệ: {error}"))?;

    if parsed.scheme() != "https" {
        return Err("Payment Gateway phải sử dụng HTTPS.".to_owned());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Payment Gateway không có hostname.".to_owned())?;

    if host != "script.google.com" {
        return Err("URL Payment Gateway không đúng hostname được phép.".to_owned());
    }

    Ok(())
}

#[tauri::command]
pub async fn payment_gateway_post(
    app: tauri::AppHandle,
    request: PaymentGatewayPostRequest,
) -> Result<String, String> {
    let action = request_action(&request.body);
    let started = Instant::now();

    let request_body = if is_desktop_access_protected_action(&action) {
        match augment_desktop_access_request(&action, &request.body) {
            Ok(value) => value,
            Err(error) => {
                append_payment_log(
                    &app,
                    vec![
                        "PAYMENT GATEWAY — ERROR".to_owned(),
                        format!("Action: {action}"),
                        "Stage: desktop_access_proof".to_owned(),
                        format!("Error: {error}"),
                        format!("ElapsedMs: {}", started.elapsed().as_millis()),
                    ],
                );
                return Err(error);
            }
        }
    } else {
        request.body
    };

    append_payment_log(
        &app,
        vec![
            "PAYMENT GATEWAY — REQUEST".to_owned(),
            format!("Action: {action}"),
            format!("BodyBytes: {}", request_body.len()),
        ],
    );

    if let Err(error) = validate_url(&request.url) {
        append_payment_log(
            &app,
            vec![
                "PAYMENT GATEWAY — ERROR".to_owned(),
                format!("Action: {action}"),
                "Stage: validate_url".to_owned(),
                format!("Error: {error}"),
                format!("ElapsedMs: {}", started.elapsed().as_millis()),
            ],
        );
        return Err(error);
    }

    if request_body.len() > 64 * 1024 {
        let error = "Request Payment Gateway vượt quá 64 KB.".to_owned();
        append_payment_log(
            &app,
            vec![
                "PAYMENT GATEWAY — ERROR".to_owned(),
                format!("Action: {action}"),
                "Stage: validate_body".to_owned(),
                format!("Error: {error}"),
                format!("ElapsedMs: {}", started.elapsed().as_millis()),
            ],
        );
        return Err(error);
    }

    let client = match Client::builder()
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 10 {
                return attempt.stop();
            }

            if redirect_url_allowed(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            let message = format!("Không khởi tạo được HTTP client: {error}");
            append_payment_log(
                &app,
                vec![
                    "PAYMENT GATEWAY — ERROR".to_owned(),
                    format!("Action: {action}"),
                    "Stage: build_client".to_owned(),
                    format!("Error: {message}"),
                    format!("ElapsedMs: {}", started.elapsed().as_millis()),
                ],
            );
            return Err(message);
        }
    };

    let response = match client
        .post(&request.url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(request_body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = format!("Payment Gateway HTTPS request thất bại: {error}");
            append_payment_log(
                &app,
                vec![
                    "PAYMENT GATEWAY — ERROR".to_owned(),
                    format!("Action: {action}"),
                    "Stage: send".to_owned(),
                    format!("Error: {message}"),
                    format!("ElapsedMs: {}", started.elapsed().as_millis()),
                ],
            );
            return Err(message);
        }
    };

    let status = response.status();
    let final_host = response
        .url()
        .host_str()
        .unwrap_or("unknown")
        .to_owned();
    let elapsed_ms = started.elapsed().as_millis();

    if final_host != "script.google.com"
        && final_host != "script.googleusercontent.com"
    {
        let message = format!(
            "Payment Gateway redirect final host không được phép: {final_host}"
        );
        append_payment_log(
            &app,
            vec![
                "PAYMENT GATEWAY — ERROR".to_owned(),
                format!("Action: {action}"),
                "Stage: validate_final_host".to_owned(),
                format!("FinalHost: {final_host}"),
                format!("Error: {message}"),
                format!("ElapsedMs: {elapsed_ms}"),
            ],
        );
        return Err(message);
    }

    let text = match response.text().await {
        Ok(text) => text,
        Err(error) => {
            let message = format!("Không đọc được phản hồi Payment Gateway: {error}");
            append_payment_log(
                &app,
                vec![
                    "PAYMENT GATEWAY — ERROR".to_owned(),
                    format!("Action: {action}"),
                    "Stage: read_response".to_owned(),
                    format!("HttpStatus: {}", status.as_u16()),
                    format!("FinalHost: {final_host}"),
                    format!("Error: {message}"),
                    format!("ElapsedMs: {elapsed_ms}"),
                ],
            );
            return Err(message);
        }
    };

    if !status.is_success() {
        let message = format!("Payment Gateway HTTP {status}: {text}");
        append_payment_log(
            &app,
            vec![
                "PAYMENT GATEWAY — ERROR".to_owned(),
                format!("Action: {action}"),
                "Stage: http_status".to_owned(),
                format!("HttpStatus: {}", status.as_u16()),
                format!("FinalHost: {final_host}"),
                format!("Error: Payment Gateway returned non-success HTTP status."),
                format!("ElapsedMs: {elapsed_ms}"),
            ],
        );
        return Err(message);
    }

    append_payment_log(
        &app,
        vec![
            "PAYMENT GATEWAY — RESPONSE".to_owned(),
            format!("Action: {action}"),
            format!("HttpStatus: {}", status.as_u16()),
            format!("FinalHost: {final_host}"),
            format!("ResponseBytes: {}", text.len()),
            format!("ElapsedMs: {elapsed_ms}"),
        ],
    );

    Ok(text)
}
