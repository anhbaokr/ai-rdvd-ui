import type { Dispatch, SetStateAction } from 'react';
import type { EditTab, UiText } from '../../types';

interface EditPanelProps {
  t: UiText;
  pipelineDone: boolean;
  editTab: EditTab;
  setEditTab: Dispatch<SetStateAction<EditTab>>;
  addLog: (message: string) => void;
  exportQueued: boolean;
  handleFinalExport: () => void;
  originalVolume: number;
  setOriginalVolume: Dispatch<SetStateAction<number>>;
  originalMuted: boolean;
  setOriginalMuted: Dispatch<SetStateAction<boolean>>;
  dubbedVolume: number;
  setDubbedVolume: Dispatch<SetStateAction<number>>;
  dubbedMuted: boolean;
  setDubbedMuted: Dispatch<SetStateAction<boolean>>;
  ttsDirty: boolean;
}


export function EditPanel(props: EditPanelProps) {
  const {
    t, pipelineDone, editTab, setEditTab, addLog, exportQueued, handleFinalExport,
    originalVolume, setOriginalVolume, originalMuted, setOriginalMuted, dubbedVolume,
    setDubbedVolume, dubbedMuted, setDubbedMuted, ttsDirty,
  } = props;

  return (
    <aside className="rdvd-edit-panel" aria-label={t.editVideo}>
      <div className="rdvd-edit-head">
        <div><strong>✦ {t.editVideo}</strong><small>{pipelineDone ? t.exportReady : t.exportNotReady}</small></div>
        <div className="rdvd-edit-tabs" role="tablist">
          <button type="button" className={editTab === 'edit' ? 'active' : ''} onClick={() => setEditTab('edit')} role="tab" aria-selected={editTab === 'edit'}>{t.editTab}</button>
          <button type="button" className={editTab === 'export' ? 'active' : ''} onClick={() => setEditTab('export')} role="tab" aria-selected={editTab === 'export'}>{t.exportTab}</button>
        </div>
      </div>
      {editTab === 'edit' ? (
        <div className="rdvd-edit-content">
          <div className="rdvd-edit-section-title">Âm thanh Preview</div>
          <div className="rdvd-audio-inspector">
            <label><span>A1 · {t.originalAudio} <output>{Math.round(originalVolume * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={originalMuted ? 0 : originalVolume} onChange={(event) => { const next = Number(event.target.value); setOriginalVolume(next); setOriginalMuted(next === 0); }} /></label>
            <button type="button" className={originalMuted ? 'inspector-toggle active' : 'inspector-toggle'} onClick={() => setOriginalMuted((value) => !value)}>{originalMuted ? '🔇 A1 Mute' : '🔊 A1 Audio'}</button>
            <label><span>A2 · {t.dubbedAudio} <output>{Math.round(dubbedVolume * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={dubbedMuted ? 0 : dubbedVolume} onChange={(event) => { const next = Number(event.target.value); setDubbedVolume(next); setDubbedMuted(next === 0); }} /></label>
            <button type="button" className={dubbedMuted ? 'inspector-toggle active' : 'inspector-toggle'} onClick={() => setDubbedMuted((value) => !value)}>{dubbedMuted ? '🔇 A2 Mute' : '🎙 A2 Voice'}</button>
          </div>
          {ttsDirty && <div className="rdvd-edit-warning">⚠ Bản dịch/lời thoại đã thay đổi. WAV A2 hiện tại cần tạo lại để khớp với S1.</div>}

          <div className="rdvd-edit-section-title">Clip</div>
          <div className="rdvd-edit-placeholder">{pipelineDone ? '✓ AI pipeline đã sẵn sàng trong Timeline.' : t.noClipSelected}</div>
          <div className="rdvd-edit-grid">
            <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.cutAtPlayhead)}>✂<span>{t.cutAtPlayhead}</span></button>
            <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.splitClip)}>◫<span>{t.splitClip}</span></button>
            <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.trimStart)}>◁<span>{t.trimStart}</span></button>
            <button type="button" className="rdvd-edit-tool" disabled={!pipelineDone} onClick={() => addLog(t.trimEnd)}>▷<span>{t.trimEnd}</span></button>
          </div>
          <div className="rdvd-edit-section-title">{t.transform}</div>
          <div className="rdvd-edit-fields"><label><span>{t.position}</span><div className="edit-dual"><input type="number" defaultValue="0" disabled={!pipelineDone} /><input type="number" defaultValue="0" disabled={!pipelineDone} /></div></label><label><span>{t.scale}</span><input type="range" min="50" max="200" defaultValue="100" disabled={!pipelineDone} /></label><label><span>{t.rotation}</span><input type="range" min="-180" max="180" defaultValue="0" disabled={!pipelineDone} /></label></div>
          <div className="rdvd-edit-section-title">{t.speedControl}</div>
          <select className="rdvd-edit-select" defaultValue="1" disabled={!pipelineDone}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select>
          <div className="rdvd-edit-section-title">{t.effects}</div>
          <div className="rdvd-edit-chip-row"><button type="button" disabled={!pipelineDone}>Fade</button><button type="button" disabled={!pipelineDone}>Dissolve</button><button type="button" disabled={!pipelineDone}>Sharpen</button></div>
        </div>
      ) : (
        <div className="rdvd-edit-content">
          <div className="rdvd-edit-section-title">{t.finalExport}</div>
          <div className="rdvd-export-status">{exportQueued ? `✓ ${t.exportVideo}` : pipelineDone ? `✓ ${t.exportReady}` : t.exportNotReady}</div>
          <label className="rdvd-export-row"><span>{t.exportFormat}</span><select defaultValue="mp4" disabled={!pipelineDone}><option value="mp4">MP4 (H.264)</option><option value="mkv">MKV</option></select></label>
          <label className="rdvd-export-row"><span>{t.outputFolder}</span><div className="rdvd-output-row"><input value="E:\\Output" readOnly /><button aria-label={t.chooseFolder} type="button" disabled={!pipelineDone}>□</button></div></label>
          <div className="rdvd-export-note">{t.exportEnginePending}</div>
          <button type="button" className="rdvd-action purple-action" disabled={!pipelineDone || exportQueued} onClick={handleFinalExport}>⇧ <span>{t.exportVideo}</span></button>
        </div>
      )}
    </aside>
  );
}
