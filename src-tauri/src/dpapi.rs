use base64::engine::general_purpose::STANDARD;

const DPAPI_PREFIX: &str = "dpapi:v1:";
const DPAPI_ENTROPY: &[u8] = b"AI-RDvD|license_state_dpapi_v1";
const MAX_DPAPI_BLOB_BYTES: usize = 16 * 1024;

pub(crate) fn is_protected_value(value: &str) -> bool {
    value.starts_with(DPAPI_PREFIX)
}

#[cfg(windows)]
mod platform {
    use super::{DPAPI_ENTROPY, DPAPI_PREFIX, MAX_DPAPI_BLOB_BYTES, STANDARD};
    use base64::Engine as _;
    use std::{ffi::c_void, ptr};

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "Crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *const c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *const c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "Kernel32")]
    extern "system" {
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    }

    fn data_blob(bytes: &[u8]) -> Result<DataBlob, String> {
        if bytes.len() > u32::MAX as usize {
            return Err("Dữ liệu DPAPI vượt quá giới hạn Windows.".to_owned());
        }

        Ok(DataBlob {
            cb_data: bytes.len() as u32,
            pb_data: bytes.as_ptr() as *mut u8,
        })
    }

    fn take_output_blob(blob: DataBlob) -> Result<Vec<u8>, String> {
        if blob.pb_data.is_null() || blob.cb_data == 0 {
            if !blob.pb_data.is_null() {
                unsafe {
                    LocalFree(blob.pb_data.cast());
                }
            }
            return Err("Windows DPAPI trả về dữ liệu rỗng.".to_owned());
        }

        let output = unsafe {
            std::slice::from_raw_parts(blob.pb_data, blob.cb_data as usize).to_vec()
        };

        unsafe {
            LocalFree(blob.pb_data.cast());
        }

        Ok(output)
    }

    pub(super) fn protect_string(value: &str) -> Result<String, String> {
        let bytes = value.as_bytes();
        if bytes.is_empty() {
            return Err("Không thể bảo vệ chuỗi rỗng bằng DPAPI.".to_owned());
        }
        if bytes.len() > MAX_DPAPI_BLOB_BYTES {
            return Err("Dữ liệu cần bảo vệ bằng DPAPI quá lớn.".to_owned());
        }

        let input = data_blob(bytes)?;
        let entropy = data_blob(DPAPI_ENTROPY)?;
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };

        let ok = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                &entropy,
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };

        if ok == 0 {
            return Err(format!(
                "Windows DPAPI không thể bảo vệ license token: {}",
                std::io::Error::last_os_error()
            ));
        }

        let encrypted = take_output_blob(output)?;
        if encrypted.len() > MAX_DPAPI_BLOB_BYTES {
            return Err("Ciphertext DPAPI vượt quá giới hạn cho phép.".to_owned());
        }

        Ok(format!("{DPAPI_PREFIX}{}", STANDARD.encode(encrypted)))
    }

    pub(super) fn unprotect_string(value: &str) -> Result<String, String> {
        let encoded = value
            .strip_prefix(DPAPI_PREFIX)
            .ok_or_else(|| "Dữ liệu local không có tiền tố DPAPI hợp lệ.".to_owned())?;

        if encoded.is_empty() || encoded.len() > MAX_DPAPI_BLOB_BYTES * 2 {
            return Err("Ciphertext DPAPI có kích thước không hợp lệ.".to_owned());
        }

        let encrypted = STANDARD
            .decode(encoded.as_bytes())
            .map_err(|_| "Ciphertext DPAPI không phải base64 hợp lệ.".to_owned())?;

        if encrypted.is_empty() || encrypted.len() > MAX_DPAPI_BLOB_BYTES {
            return Err("Ciphertext DPAPI sau giải mã có kích thước không hợp lệ.".to_owned());
        }

        let input = data_blob(&encrypted)?;
        let entropy = data_blob(DPAPI_ENTROPY)?;
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };

        let ok = unsafe {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                &entropy,
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };

        if ok == 0 {
            return Err(format!(
                "Windows DPAPI không thể giải mã license token: {}",
                std::io::Error::last_os_error()
            ));
        }

        let decrypted = take_output_blob(output)?;
        String::from_utf8(decrypted)
            .map_err(|_| "License token sau DPAPI không phải UTF-8 hợp lệ.".to_owned())
    }
}

#[cfg(not(windows))]
mod platform {
    pub(super) fn protect_string(_value: &str) -> Result<String, String> {
        Err("DPAPI chỉ được hỗ trợ trên Windows.".to_owned())
    }

    pub(super) fn unprotect_string(_value: &str) -> Result<String, String> {
        Err("DPAPI chỉ được hỗ trợ trên Windows.".to_owned())
    }
}

pub(crate) fn protect_string(value: &str) -> Result<String, String> {
    platform::protect_string(value)
}

pub(crate) fn unprotect_string(value: &str) -> Result<String, String> {
    platform::unprotect_string(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_detection_is_strict() {
        assert!(is_protected_value("dpapi:v1:AAAA"));
        assert!(!is_protected_value("DPAPI:v1:AAAA"));
        assert!(!is_protected_value("plain-token"));
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip_works_for_current_user() {
        let value = "RDVD-SECURITY-10C-ROUNDTRIP";
        let protected = protect_string(value).expect("DPAPI protect must succeed");
        assert!(protected.starts_with(DPAPI_PREFIX));
        assert_ne!(protected, value);

        let restored = unprotect_string(&protected).expect("DPAPI unprotect must succeed");
        assert_eq!(restored, value);
    }

    #[cfg(windows)]
    #[test]
    fn malformed_dpapi_payload_is_rejected() {
        let error = unprotect_string("dpapi:v1:not-base64!!")
            .expect_err("malformed DPAPI payload must fail");
        assert!(error.contains("base64"));
    }
}
