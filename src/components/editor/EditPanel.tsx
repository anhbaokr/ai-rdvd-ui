import type { Dispatch, SetStateAction } from 'react';
import type { EditTab, UiText } from '../../types';
import type { ExportUiStatus } from '../../features/export/useExport';

interface EditPanelProps {
  t: UiText;
  pipelineDone: boolean;
  editTab: EditTab;
  setEditTab: Dispatch<SetStateAction<EditTab>>;
  addLog: (message: string) => void;
  exportStatus: ExportUiStatus;
  exportRunning: boolean;
  exportProgress: number;
  exportCanStart: boolean;
  exportSourceReady: boolean;
  exportCancellable: boolean;
  exportSummary: { video: boolean; audio: 'original' | 'dubbed'; subtitles: boolean; logo: boolean; };
  exportCancelling: boolean;
  exportMessage: string;
  exportErrorCode: string | null;
  exportOutputPath: string | null;
  chooseExportOutput: () => Promise<string | null>;
  handleFinalExport: () => Promise<void>;
  cancelExport: () => Promise<void>;
  openExportOutput: () => Promise<void>;
  revealExportOutput: () => Promise<void>;
  copyExportOutputPath: () => Promise<void>;
}

export function EditPanel(props: EditPanelProps) {
  const {
    t,
    pipelineDone,
    editTab,
    setEditTab,
    addLog,
    exportStatus,
    exportRunning,
    exportProgress,
    exportCanStart,
    exportSourceReady,
    exportCancellable,
    exportSummary,
    exportCancelling,
    exportMessage,
    exportErrorCode,
    exportOutputPath,
    chooseExportOutput,
    handleFinalExport,
    cancelExport,
    openExportOutput,
    revealExportOutput,
    copyExportOutputPath,
  } = props;

  const exportComplete = exportStatus === 'COMPLETED';
  const exportCancelled = exportStatus === 'CANCELLED';
  const isEnglish = t.cancelExport === 'Cancel export';
  const copy = isEnglish ? {
    source: 'Source video',
    audioOriginal: 'Original audio',
    audioDubbed: 'Dubbed audio A2',
    subtitles: 'Subtitles S1',
    logo: 'Logo',
    included: 'Included',
    notIncluded: 'Not included',
    preparing: 'Preparing render...',
    rendering: 'Rendering',
    finalizing: 'Finalizing output...',
    checking: 'Checking render environment...',
    sourceRequired: 'Import a source video to export.',
    openFile: 'Open file',
    openFolder: 'Open folder',
    copyPath: 'Copy path',
    errorTitle: 'Export problem',
  } : {
    source: 'Video gốc',
    audioOriginal: 'Âm thanh gốc A1',
    audioDubbed: 'Lồng tiếng A2',
    subtitles: 'Phụ đề S1',
    logo: 'Logo',
    included: 'Có',
    notIncluded: 'Không',
    preparing: 'Đang chuẩn bị render...',
    rendering: 'Đang xuất video',
    finalizing: 'Đang hoàn tất file xuất...',
    checking: 'Đang kiểm tra môi trường render...',
    sourceRequired: 'Import video gốc để có thể xuất.',
    openFile: 'Mở file',
    openFolder: 'Mở thư mục',
    copyPath: 'Sao chép đường dẫn',
    errorTitle: 'Sự cố khi xuất',
  };
  const friendlyErrorByCode: Record<string, string> = isEnglish ? {
    OUTPUT_EXISTS: 'The output file already exists. Choose another filename.',
    OUTPUT_PATH_INVALID: 'The output path is not valid or conflicts with an input file.',
    SOURCE_VIDEO_MISSING: 'The source video can no longer be found. Import it again.',
    SOURCE_VIDEO_NOT_NATIVE: 'The source video does not have a valid desktop file path.',
    DUBBED_AUDIO_MISSING: 'The dubbed A2 audio file can no longer be found.',
    LOGO_DATA_INVALID: 'The logo is invalid or its file can no longer be found.',
    SUBTITLE_DATA_INVALID: 'The subtitle data is invalid. Check S1 before exporting.',
    FFMPEG_NOT_FOUND: 'FFmpeg is not available on this computer.',
    FFMPEG_START_FAILED: 'FFmpeg could not be started.',
    FFMPEG_EXIT_FAILED: 'FFmpeg failed while encoding. See Live Log for technical details.',
    FINALIZE_FAILED: 'Encoding finished, but the output file could not be finalized.',
    RENDER_TASK_INTERRUPTED: 'The render task was interrupted.',
    OUTPUT_FILE_MISSING: 'The rendered output file can no longer be found.',
    OUTPUT_OPEN_FAILED: 'The output file could not be opened.',
    OUTPUT_REVEAL_FAILED: 'The output folder could not be opened.',
    OUTPUT_COPY_FAILED: 'The output path could not be copied.',
  } : {
    OUTPUT_EXISTS: 'File xuất đã tồn tại. Hãy chọn một tên file khác.',
    OUTPUT_PATH_INVALID: 'Đường dẫn xuất không hợp lệ hoặc đang trùng với file đầu vào.',
    SOURCE_VIDEO_MISSING: 'Không còn tìm thấy video gốc. Hãy import lại video.',
    SOURCE_VIDEO_NOT_NATIVE: 'Video gốc chưa có đường dẫn file desktop hợp lệ.',
    DUBBED_AUDIO_MISSING: 'Không còn tìm thấy file lồng tiếng A2.',
    LOGO_DATA_INVALID: 'Logo không hợp lệ hoặc file logo không còn tồn tại.',
    SUBTITLE_DATA_INVALID: 'Dữ liệu phụ đề S1 không hợp lệ. Hãy kiểm tra trước khi xuất.',
    FFMPEG_NOT_FOUND: 'Không tìm thấy FFmpeg trên máy.',
    FFMPEG_START_FAILED: 'Không thể khởi động FFmpeg.',
    FFMPEG_EXIT_FAILED: 'FFmpeg gặp lỗi khi mã hóa. Xem Live Log để biết chi tiết kỹ thuật.',
    FINALIZE_FAILED: 'Đã mã hóa xong nhưng không thể hoàn tất file xuất.',
    RENDER_TASK_INTERRUPTED: 'Tác vụ render bị gián đoạn.',
    OUTPUT_FILE_MISSING: 'File output sau khi render không còn tồn tại.',
    OUTPUT_OPEN_FAILED: 'Không thể mở file output.',
    OUTPUT_REVEAL_FAILED: 'Không thể mở thư mục chứa output.',
    OUTPUT_COPY_FAILED: 'Không thể sao chép đường dẫn output.',
  };
  const friendlyExportError = exportErrorCode
    ? (friendlyErrorByCode[exportErrorCode] || exportMessage)
    : null;

  const exportStatusText = exportComplete ? `✓ ${t.exportVideo}` : exportStatus === 'PREPARING' ? copy.preparing : exportStatus === 'RENDERING' ? `${copy.rendering} ${Math.round(exportProgress)}%` : exportStatus === 'FINALIZING' ? copy.finalizing : exportStatus === 'CANCEL_REQUESTED' ? t.cancellingExport : exportCancelled ? t.exportCancelled : exportStatus === 'CHECKING_ENVIRONMENT' ? copy.checking : exportStatus === 'ERROR' ? t.exportFailed : exportCanStart ? `✓ ${t.exportReady}` : copy.sourceRequired;
  const progressVisual = exportStatus === 'PREPARING' ? Math.max(4,exportProgress) : exportStatus === 'FINALIZING' ? Math.max(99.5,exportProgress) : exportComplete ? 100 : exportProgress;
  const progressGradient = exportStatus === 'COMPLETED' ? 'linear-gradient(90deg,#16a34a,#22c55e)' : exportStatus === 'FINALIZING' ? 'linear-gradient(90deg,#f59e0b,#f97316)' : exportStatus === 'CANCEL_REQUESTED' || exportStatus === 'CANCELLED' || exportStatus === 'ERROR' ? 'linear-gradient(90deg,#dc2626,#ef4444)' : exportStatus === 'PREPARING' ? 'linear-gradient(90deg,#2563eb,#06b6d4)' : 'linear-gradient(90deg,#2563eb,#7c3aed,#a855f7)';

  return (
      <aside className="rdvd-edit-panel" aria-label={t.editVideo}>
        <div className="rdvd-edit-head">
          <div><strong>✦ {t.editVideo}</strong><small>{exportSourceReady ? exportStatusText : copy.sourceRequired}</small></div>
          <div className="rdvd-edit-tabs" role="tablist">
            <button type="button" className={editTab === 'edit' ? 'active' : ''} onClick={() => setEditTab('edit')} role="tab" aria-selected={editTab === 'edit'}>{t.editTab}</button>
            <button type="button" className={editTab === 'export' ? 'active' : ''} onClick={() => setEditTab('export')} role="tab" aria-selected={editTab === 'export'}>{t.exportTab}</button>
          </div>
        </div>
        {editTab === 'edit' ? (
          <div className="rdvd-edit-content">
            <div className="rdvd-edit-section-title">{t.editClip}</div>
            <div className="rdvd-edit-placeholder">{pipelineDone ? '✓ AI pipeline đã sẵn sàng trong Timeline.' : t.noClipSelected}</div>
            <div className="rdvd-edit-grid">
              <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.cutAtPlayhead)}>✂<span>{t.cutAtPlayhead}</span></button>
              <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.splitClip)}>◫<span>{t.splitClip}</span></button>
              <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.trimStart)}>◁<span>{t.trimStart}</span></button>
              <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.trimEnd)}>▷<span>{t.trimEnd}</span></button>
            </div>
            <div className="rdvd-edit-section-title">{t.transform}</div>
            <div className="rdvd-edit-fields">
              <label><span>{t.position}</span><div className="edit-dual"><input type="number" defaultValue="0" disabled={!pipelineDone} /><input type="number" defaultValue="0" disabled={!pipelineDone} /></div></label>
              <label><span>{t.scale}</span><input type="range" min="50" max="200" defaultValue="100" disabled={!pipelineDone} /></label>
              <label><span>{t.rotation}</span><input type="range" min="-180" max="180" defaultValue="0" disabled={!pipelineDone} /></label>
            </div>
            <div className="rdvd-edit-section-title">{t.speedControl}</div>
            <select className="rdvd-edit-select" defaultValue="1" disabled={!pipelineDone}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select>
            <div className="rdvd-edit-section-title">{t.effects}</div>
            <div className="rdvd-edit-chip-row"><button type="button" disabled={!pipelineDone}>Fade</button><button type="button" disabled={!pipelineDone}>Dissolve</button><button type="button" disabled={!pipelineDone}>Sharpen</button></div>
          </div>
        ) : (
          <div className="rdvd-edit-content">
            <div className="rdvd-edit-section-title">{t.finalExport}</div>
            <div className="rdvd-export-status">
              {exportStatusText}
            </div>
            {friendlyExportError && (
              <div
                role="alert"
                style={{
                  marginTop: 8,
                  marginBottom: 10,
                  padding: '9px 11px',
                  borderRadius: 9,
                  border: '1px solid rgba(239, 68, 68, 0.30)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  display: 'grid',
                  gap: 3,
                }}
              >
                <strong style={{ fontSize: 12 }}>{copy.errorTitle}</strong>
                <small>{friendlyExportError}</small>
              </div>
            )}
            {(exportRunning || exportComplete || exportCancelled || exportStatus === 'ERROR') && (
              <div className="rdvd-export-progress" aria-label={`${Math.round(progressVisual)}%`}>
                <div style={{width:'100%',height:9,borderRadius:999,overflow:'hidden',background:'rgba(120,120,140,.20)',border:'1px solid rgba(140,140,170,.25)'}}>
                  <div style={{width:`${Math.max(0,Math.min(100,progressVisual))}%`,height:'100%',borderRadius:999,background:progressGradient,transition:'width 220ms ease, background 220ms ease',boxShadow:exportRunning?'0 0 12px rgba(124,58,237,.45)':'none'}} />
                </div>
                <small>{Math.round(progressVisual)}%</small>
              </div>
            )}
            <div className="rdvd-export-snapshot" style={{display:'grid',gap:6,padding:'10px 12px',marginBottom:10,borderRadius:10,background:'rgba(110,90,160,.08)',border:'1px solid rgba(140,120,190,.18)',fontSize:12}}>
              <div><strong>{copy.source}:</strong> {exportSummary.video ? `✓ ${copy.included}` : `— ${copy.notIncluded}`}</div>
              <div><strong>{exportSummary.audio === 'dubbed' ? copy.audioDubbed : copy.audioOriginal}:</strong> {exportSummary.video ? `✓ ${copy.included}` : `— ${copy.notIncluded}`}</div>
              <div><strong>{copy.subtitles}:</strong> {exportSummary.subtitles ? `✓ ${copy.included}` : `— ${copy.notIncluded}`}</div>
              <div><strong>{copy.logo}:</strong> {exportSummary.logo ? `✓ ${copy.included}` : `— ${copy.notIncluded}`}</div>
            </div>
            <label className="rdvd-export-row">
              <span>{t.exportFormat}</span>
              <select value="mp4" disabled><option value="mp4">MP4 (H.264 + AAC)</option></select>
            </label>
            <label className="rdvd-export-row">
              <span>{t.outputFolder}</span>
              <div className="rdvd-output-row">
                <input value={exportOutputPath || t.outputNotSelected} readOnly />
                <button
                  aria-label={t.chooseFolder}
                  type="button"
                  disabled={!exportSourceReady || exportRunning}
                  onClick={() => { void chooseExportOutput(); }}
                >□</button>
              </div>
            </label>
            <div className="rdvd-export-note">{t.exportEnginePending}</div>
            <button
              type="button"
              className="rdvd-action purple-action"
              disabled={!exportCanStart || exportRunning}
              style={{background:exportRunning?'linear-gradient(90deg,#4f46e5,#7c3aed)':exportCanStart?'linear-gradient(90deg,#2563eb,#7c3aed,#a855f7)':undefined,boxShadow:exportCanStart?'0 0 16px rgba(124,58,237,.30)':undefined,transition:'filter 180ms ease, box-shadow 180ms ease, transform 180ms ease'}}
              onClick={() => { void handleFinalExport(); }}
            >
              ⇧ <span>{exportRunning ? t.exportRenderingShort : t.exportVideo}</span>
            </button>
            {(exportCancellable || exportCancelling) && (
              <button
                type="button"
                className="rdvd-action"
                disabled={exportCancelling}
                style={{background:exportCancelling?'linear-gradient(90deg,#991b1b,#b91c1c)':'linear-gradient(90deg,#dc2626,#f97316)',boxShadow:'0 0 14px rgba(220,38,38,.25)',transition:'filter 180ms ease, box-shadow 180ms ease'}}
                onClick={() => { void cancelExport(); }}
              >
                <span>{exportCancelling ? t.cancellingExport : t.cancelExport}</span>
              </button>
            )}
            {exportComplete && exportOutputPath && (
              <div
                className="rdvd-output-actions"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 7,
                  marginTop: 8,
                }}
              >
                <button type="button" className="rdvd-action" onClick={() => { void openExportOutput(); }}>
                  <span>{copy.openFile}</span>
                </button>
                <button type="button" className="rdvd-action" onClick={() => { void revealExportOutput(); }}>
                  <span>{copy.openFolder}</span>
                </button>
                <button type="button" className="rdvd-action" onClick={() => { void copyExportOutputPath(); }}>
                  <span>{copy.copyPath}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
  );
}
