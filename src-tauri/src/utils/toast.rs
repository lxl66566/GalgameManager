// region: Backend toast helper

use tauri::{AppHandle, Emitter as _};

/// Tauri event key for showing a toast from the backend.
const EVENT_SHOW: &str = "toast://show";
/// Tauri event key for dismissing a previously shown toast.
const EVENT_DISMISS: &str = "toast://dismiss";

/// Toast variant for backend-to-frontend notifications.
#[derive(Debug, Clone, Copy)]
pub enum ToastVariant {
    Default,
    Success,
    Error,
    Warning,
    Loading,
}

impl ToastVariant {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Success => "success",
            Self::Error => "error",
            Self::Warning => "warning",
            Self::Loading => "loading",
        }
    }
}

/// Payload sent with the `toast://show` event.
#[derive(Debug, Clone, serde::Serialize)]
struct ToastPayload {
    variant: &'static str,
    message: String,
    /// Optional stable ID used to dismiss a loading toast later.
    toast_id: Option<String>,
}

/// Emit a toast notification to the frontend via Tauri event.
///
/// The frontend must listen for the `EVENT_SHOW` event and display
/// the toast using its own UI library (solid-toast).
pub fn emit_toast(app: &AppHandle, variant: ToastVariant, message: impl Into<String>) {
    let payload = ToastPayload {
        variant: variant.as_str(),
        message: message.into(),
        toast_id: None,
    };
    if let Err(e) = app.emit(EVENT_SHOW, payload) {
        log::error!("Failed to emit toast event: {e}");
    }
}

/// Emit a loading toast with a stable ID that can later be dismissed.
///
/// Returns the `toast_id` so the caller can pass it to [`dismiss_toast`].
pub fn emit_loading_toast(
    app: &AppHandle,
    message: impl Into<String>,
    toast_id: impl Into<String>,
) {
    let payload = ToastPayload {
        variant: ToastVariant::Loading.as_str(),
        message: message.into(),
        toast_id: Some(toast_id.into()),
    };
    if let Err(e) = app.emit(EVENT_SHOW, payload) {
        log::error!("Failed to emit loading toast event: {e}");
    }
}

/// Dismiss a previously shown loading toast by its ID.
pub fn dismiss_toast(app: &AppHandle, toast_id: impl AsRef<str>) {
    if let Err(e) = app.emit(EVENT_DISMISS, toast_id.as_ref()) {
        log::error!("Failed to emit toast dismiss event: {e}");
    }
}

// endregion
