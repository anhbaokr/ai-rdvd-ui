use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProtectedAccessSource {
    PaidEntitlement,
    PaidOnline,
    FreeHour,
}

#[derive(Debug, Deserialize)]
struct NativeAccessEnvelope {
    success: bool,
    #[serde(default)]
    access: Option<NativeAccessSnapshot>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NativeAccessSnapshot {
    state: String,
    machine_id: String,
    free_remaining_seconds: f64,
    can_use_workspace: bool,
}

#[derive(Debug, Deserialize)]
struct NativeLicenseEnvelope {
    success: bool,
    #[serde(default)]
    license: Option<NativeLicenseSnapshot>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NativeLicenseSnapshot {
    machine_id: String,
    status: String,
}

fn local_state(app: &AppHandle) -> Result<crate::license::LocalLicenseState, String> {
    crate::license::get_local_license_state(app.clone())?
        .ok_or_else(|| "Không có local license state.".to_owned())
}

fn validate_local_machine(
    state: &crate::license::LocalLicenseState,
    expected_machine_id: &str,
) -> Result<(), String> {
    if let Some(machine_id) = state.machine_id.as_deref() {
        if machine_id != expected_machine_id {
            return Err("Local license state không thuộc machine_id của máy hiện tại.".to_owned());
        }
    }
    Ok(())
}

fn authorize_paid_entitlement(app: &AppHandle) -> Result<(), String> {
    let state = local_state(app)?;
    let machine_id = crate::license::machine_id_value()?;
    validate_local_machine(&state, &machine_id)?;

    let license = state
        .license
        .ok_or_else(|| "Local license state chưa có license snapshot.".to_owned())?;
    let entitlement = license
        .get("offline_entitlement")
        .filter(|value| !value.is_null())
        .cloned()
        .ok_or_else(|| "Local license snapshot chưa có signed offline entitlement.".to_owned())?;

    let verification = crate::license::verify_offline_entitlement(app.clone(), entitlement)?;
    if !verification.valid {
        return Err("Signed offline entitlement không hợp lệ.".to_owned());
    }
    Ok(())
}

fn parse_license_response(text: &str) -> Result<NativeLicenseEnvelope, String> {
    serde_json::from_str::<NativeLicenseEnvelope>(text)
        .map_err(|error| format!("License response JSON không hợp lệ: {error}"))
}

fn validate_active_license(
    license: Option<NativeLicenseSnapshot>,
    expected_machine_id: &str,
) -> Result<(), String> {
    let license = license.ok_or_else(|| "License response thiếu license snapshot.".to_owned())?;
    if license.machine_id != expected_machine_id {
        return Err("Online license machine_id không khớp máy hiện tại.".to_owned());
    }
    if license.status != "ACTIVE" {
        return Err(format!("Online license không ACTIVE: {}.", license.status));
    }
    Ok(())
}

fn validate_check_license_response(text: &str, machine_id: &str) -> Result<(), String> {
    let response = parse_license_response(text)?;
    if !response.success {
        return Err(format!(
            "Server từ chối checkLicense: {}",
            response.error.as_deref().unwrap_or("UNKNOWN")
        ));
    }
    validate_active_license(response.license, machine_id)
}

fn validate_activate_device_response(text: &str, machine_id: &str) -> Result<(), String> {
    let response = parse_license_response(text)?;
    let already_active = response
        .error
        .as_deref()
        .map(|value| value.to_ascii_uppercase().contains("DEVICE_ALREADY_ACTIVE"))
        .unwrap_or(false);

    if !response.success && !already_active {
        return Err(format!(
            "Server từ chối activateDevice: {}",
            response.error.as_deref().unwrap_or("UNKNOWN")
        ));
    }

    // authorize_paid_online gọi hàm này chỉ sau khi checkLicense đã xác nhận
    // ACTIVE + đúng machine. Frontend hiện tại cũng fallback về checkResponse
    // khi activateDevice không trả license snapshot.
    if let Some(license) = response.license {
        validate_active_license(Some(license), machine_id)?;
    }

    Ok(())
}

async fn post_official(app: &AppHandle, body: String) -> Result<String, String> {
    crate::payment_gateway::payment_gateway_post(
        app.clone(),
        crate::payment_gateway::PaymentGatewayPostRequest {
            url: crate::payment_gateway::OFFICIAL_PAYMENT_GATEWAY_URL.to_owned(),
            body,
        },
    )
    .await
}

async fn authorize_paid_online(app: &AppHandle) -> Result<(), String> {
    let state = local_state(app)?;
    let machine_id = crate::license::machine_id_value()?;
    validate_local_machine(&state, &machine_id)?;

    let check_body = json!({
        "action": "checkLicense",
        "license_token": state.license_token,
        "machine_id": machine_id,
    }).to_string();

    let check_response = post_official(app, check_body).await?;
    validate_check_license_response(&check_response, &machine_id)?;

    let activate_body = json!({
        "action": "activateDevice",
        "license_token": state.license_token,
        "machine_id": machine_id,
        "device_id": machine_id,
    }).to_string();

    let activate_response = post_official(app, activate_body).await?;
    validate_activate_device_response(&activate_response, &machine_id)
}

fn validate_free_access_response(text: &str, machine_id: &str) -> Result<(), String> {
    let response = serde_json::from_str::<NativeAccessEnvelope>(text)
        .map_err(|error| format!("Access response JSON không hợp lệ: {error}"))?;

    if !response.success {
        return Err(format!(
            "Server không cấp Free Hour: {}",
            response.error.as_deref().unwrap_or("UNKNOWN")
        ));
    }

    let access = response.access.ok_or_else(|| "Access response thiếu access snapshot.".to_owned())?;
    if access.machine_id != machine_id {
        return Err("Free Hour access machine_id không khớp máy hiện tại.".to_owned());
    }
    if access.state != "FREE_HOUR_ACTIVE" {
        return Err(format!("Free Hour không ACTIVE: {}.", access.state));
    }
    if !access.can_use_workspace {
        return Err("Server không cho phép sử dụng workspace.".to_owned());
    }
    if !access.free_remaining_seconds.is_finite() || access.free_remaining_seconds <= 0.0 {
        return Err("Free Hour đã hết thời gian sử dụng.".to_owned());
    }
    Ok(())
}

async fn authorize_free_hour(app: &AppHandle) -> Result<(), String> {
    let machine_id = crate::license::machine_id_value()?;
    let body = json!({
        "action": "getAccessState",
        "machine_id": machine_id,
    }).to_string();
    let text = post_official(app, body).await?;
    validate_free_access_response(&text, &machine_id)
}

fn log_access(app: &AppHandle, line: String) {
    let _ = crate::append_log_lines(app, &[line]);
}

pub(crate) async fn authorize_protected_command(
    app: &AppHandle,
    operation: &str,
) -> Result<ProtectedAccessSource, String> {
    match authorize_paid_entitlement(app) {
        Ok(()) => {
            log_access(app, format!("NATIVE ACCESS — ALLOW — operation={operation} source=PAID_ENTITLEMENT"));
            return Ok(ProtectedAccessSource::PaidEntitlement);
        }
        Err(offline_paid_error) => match authorize_paid_online(app).await {
            Ok(()) => {
                log_access(app, format!("NATIVE ACCESS — ALLOW — operation={operation} source=PAID_ONLINE"));
                return Ok(ProtectedAccessSource::PaidOnline);
            }
            Err(online_paid_error) => match authorize_free_hour(app).await {
                Ok(()) => {
                    log_access(app, format!("NATIVE ACCESS — ALLOW — operation={operation} source=FREE_HOUR"));
                    Ok(ProtectedAccessSource::FreeHour)
                }
                Err(free_error) => {
                    log_access(app, format!(
                        "NATIVE ACCESS — DENY — operation={operation} offlinePaid={offline_paid_error} onlinePaid={online_paid_error} free={free_error}"
                    ));
                    Err("PROTECTED_ACCESS_DENIED: Không có paid license hoặc Free Hour hợp lệ.".to_owned())
                }
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        validate_activate_device_response,
        validate_check_license_response,
        validate_free_access_response,
    };

    const MACHINE: &str = "machine_id_v1_test";

    fn free_response(state: &str, machine: &str, can_use: bool, remaining: f64) -> String {
        serde_json::json!({
            "success": true,
            "access": {
                "state": state,
                "machine_id": machine,
                "free_remaining_seconds": remaining,
                "can_use_workspace": can_use
            }
        }).to_string()
    }

    fn license_response(success: bool, machine: &str, status: &str, error: Option<&str>) -> String {
        serde_json::json!({
            "success": success,
            "license": { "machine_id": machine, "status": status },
            "error": error
        }).to_string()
    }

    #[test]
    fn accepts_live_free_hour() {
        assert!(validate_free_access_response(
            &free_response("FREE_HOUR_ACTIVE", MACHINE, true, 120.0), MACHINE
        ).is_ok());
    }

    #[test]
    fn rejects_invalid_free_hour() {
        assert!(validate_free_access_response(
            &free_response("LICENSE_REQUIRED", MACHINE, true, 120.0), MACHINE
        ).is_err());
        assert!(validate_free_access_response(
            &free_response("FREE_HOUR_ACTIVE", MACHINE, true, 0.0), MACHINE
        ).is_err());
        assert!(validate_free_access_response(
            &free_response("FREE_HOUR_ACTIVE", "other", true, 120.0), MACHINE
        ).is_err());
    }

    #[test]
    fn accepts_active_online_license() {
        assert!(validate_check_license_response(
            &license_response(true, MACHINE, "ACTIVE", None), MACHINE
        ).is_ok());
    }

    #[test]
    fn rejects_invalid_online_license() {
        assert!(validate_check_license_response(
            &license_response(true, "other", "ACTIVE", None), MACHINE
        ).is_err());
        assert!(validate_check_license_response(
            &license_response(true, MACHINE, "EXPIRED", None), MACHINE
        ).is_err());
    }

    #[test]
    fn accepts_device_already_active_with_active_license() {
        assert!(validate_activate_device_response(
            &license_response(false, MACHINE, "ACTIVE", Some("DEVICE_ALREADY_ACTIVE")), MACHINE
        ).is_ok());
    }

    #[test]
    fn accepts_activate_without_license_after_active_check() {
        let success_without_license = serde_json::json!({
            "success": true
        }).to_string();
        assert!(validate_activate_device_response(&success_without_license, MACHINE).is_ok());

        let already_active_without_license = serde_json::json!({
            "success": false,
            "error": "DEVICE_ALREADY_ACTIVE"
        }).to_string();
        assert!(validate_activate_device_response(
            &already_active_without_license,
            MACHINE
        ).is_ok());
    }

    #[test]
    fn rejects_invalid_activate_snapshot_when_present() {
        assert!(validate_activate_device_response(
            &license_response(true, "other", "ACTIVE", None), MACHINE
        ).is_err());
        assert!(validate_activate_device_response(
            &license_response(true, MACHINE, "EXPIRED", None), MACHINE
        ).is_err());
    }

    #[test]
    fn rejects_other_activate_failure() {
        assert!(validate_activate_device_response(
            &license_response(false, MACHINE, "ACTIVE", Some("DEVICE_LIMIT")), MACHINE
        ).is_err());
    }
}
