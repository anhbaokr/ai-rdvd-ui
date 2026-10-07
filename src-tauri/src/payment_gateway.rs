use std::time::Instant;

use reqwest::Client;
use serde::Deserialize;

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

    append_payment_log(
        &app,
        vec![
            "PAYMENT GATEWAY — REQUEST".to_owned(),
            format!("Action: {action}"),
            format!("BodyBytes: {}", request.body.len()),
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

    if request.body.len() > 64 * 1024 {
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
        .redirect(reqwest::redirect::Policy::limited(10))
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
        .body(request.body)
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
