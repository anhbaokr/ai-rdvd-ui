import { formatAppUpdateBytes, appUpdateProgressLabel, type AppUpdateState } from "./appUpdateModel";
import "./appUpdate.css";

interface AppUpdateDialogProps {
  open: boolean;
  state: AppUpdateState;
  onClose: () => void;
  onCheck: () => void;
  onInstall: () => void;
  onRelaunch: () => void;
}

function releaseDateLabel(value: string | null): string {
  if (!value) return "Chưa có ngày phát hành";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(state: AppUpdateState): string {
  switch (state.status) {
    case "checking": return "Đang kiểm tra";
    case "up-to-date": return "Đã cập nhật";
    case "available": return "Có phiên bản mới";
    case "downloading": return "Đang tải và cài đặt";
    case "installed": return "Đã cài đặt";
    case "unsupported": return "Không hỗ trợ";
    case "error": return "Có lỗi";
    default: return "Sẵn sàng";
  }
}

export function AppUpdateDialog({ open, state, onClose, onCheck, onInstall, onRelaunch }: AppUpdateDialogProps) {
  if (!open) return null;

  const checking = state.status === "checking";
  const downloading = state.status === "downloading";

  return (
    <div className="rdvd-update-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !downloading) onClose(); }}>
      <section className="rdvd-update-dialog" role="dialog" aria-modal="true" aria-labelledby="rdvd-update-title">
        <header className="rdvd-update-dialog__header">
          <div className="rdvd-update-dialog__heading">
            <span className="rdvd-update-dialog__icon" aria-hidden="true">⟳</span>
            <div>
              <small>CẬP NHẬT ỨNG DỤNG</small>
              <h2 id="rdvd-update-title">AI RDvD</h2>
            </div>
          </div>
          <button className="rdvd-update-dialog__close" type="button" disabled={downloading} onClick={onClose} aria-label="Đóng cửa sổ cập nhật">×</button>
        </header>

        <div className="rdvd-update-dialog__body">
          <div className={`rdvd-update-status rdvd-update-status--${state.status}`}>
            <span className="rdvd-update-status__dot" aria-hidden="true" />
            <div><strong>{statusLabel(state)}</strong><p>{state.message}</p></div>
          </div>

          <div className="rdvd-update-version-grid">
            <article><small>PHIÊN BẢN HIỆN TẠI</small><strong>v{state.currentVersion}</strong></article>
            <article className={state.release ? "has-release" : ""}>
              <small>PHIÊN BẢN MỚI</small><strong>{state.release ? `v${state.release.version}` : "Chưa phát hiện"}</strong>
            </article>
          </div>

          {state.release ? (
            <section className="rdvd-update-release">
              <div><h3>Nội dung thay đổi</h3><span>{releaseDateLabel(state.release.date)}</span></div>
              <p>{state.release.notes}</p>
            </section>
          ) : null}

          {downloading || state.status === "installed" ? (
            <section className="rdvd-update-progress" aria-live="polite">
              <div><strong>{appUpdateProgressLabel(state)}</strong><span>{state.totalBytes ? `${formatAppUpdateBytes(state.downloadedBytes)} / ${formatAppUpdateBytes(state.totalBytes)}` : "Đang nhận dữ liệu..."}</span></div>
              <div className={`rdvd-update-progress__track ${state.progress === null ? "is-indeterminate" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress === null ? undefined : Math.round(state.progress * 100)}>
                <span style={{ width: state.progress === null ? "34%" : `${Math.round(state.progress * 100)}%` }} />
              </div>
            </section>
          ) : null}

          {state.error ? <aside className="rdvd-update-error" role="alert">{state.error}</aside> : null}
        </div>

        <footer className="rdvd-update-dialog__footer">
          <button className="rdvd-update-secondary" disabled={downloading} onClick={onClose} type="button">Để sau</button>
          {state.status === "installed" ? (
            <button className="rdvd-update-primary" onClick={onRelaunch} type="button"><span>⟳</span> Khởi động lại</button>
          ) : state.status === "available" ? (
            <button className="rdvd-update-primary" onClick={onInstall} type="button"><span>↓</span> Tải và cài đặt</button>
          ) : (
            <button className="rdvd-update-primary" disabled={checking || downloading || state.status === "unsupported"} onClick={onCheck} type="button"><span>⟳</span> {checking ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}</button>
          )}
        </footer>
      </section>
    </div>
  );
}
