import type { Dispatch, SetStateAction } from 'react';
import type { Language, SettingsTab, Theme, UiText } from '../../types';

interface SettingsDialogProps {
  t: UiText;
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  globalShortcutsEnabled: boolean;
  setGlobalShortcutsEnabled: Dispatch<SetStateAction<boolean>>;
  reduceMotion: boolean;
  setReduceMotion: Dispatch<SetStateAction<boolean>>;
  playbackSeekStep: number;
  setPlaybackSeekStep: Dispatch<SetStateAction<number>>;
  loopPlayback: boolean;
  setLoopPlayback: Dispatch<SetStateAction<boolean>>;
  startMuted: boolean;
  setStartMuted: Dispatch<SetStateAction<boolean>>;
  subtitlePanelStartup: boolean;
  setSubtitlePanelStartup: Dispatch<SetStateAction<boolean>>;
  autoSubtitleFrame: boolean;
  setAutoSubtitleFrame: Dispatch<SetStateAction<boolean>>;
  defaultTimelineZoom: number;
  setDefaultTimelineZoom: Dispatch<SetStateAction<number>>;
  resetAppSettings: () => void;
  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const {
    t, settingsTab, setSettingsTab, language, setLanguage, theme, setTheme,
    globalShortcutsEnabled, setGlobalShortcutsEnabled, reduceMotion, setReduceMotion,
    playbackSeekStep, setPlaybackSeekStep, loopPlayback, setLoopPlayback,
    startMuted, setStartMuted, subtitlePanelStartup, setSubtitlePanelStartup,
    autoSubtitleFrame, setAutoSubtitleFrame, defaultTimelineZoom, setDefaultTimelineZoom,
    resetAppSettings, onClose,
  } = props;

  return <div className="rdvd-settings-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="rdvd-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="rdvd-settings-title">
      <header className="rdvd-settings-head"><div><span className="settings-eyebrow">AI RDvD</span><h2 id="rdvd-settings-title">⚙ {t.settingsTitle}</h2></div><button type="button" className="rdvd-settings-close" aria-label={t.closePanel} onClick={onClose}>×</button></header>
      <div className="rdvd-settings-body"><nav className="rdvd-settings-nav" aria-label={t.settingsTitle}>
        <button type="button" className={settingsTab === 'general' ? 'active' : ''} onClick={() => setSettingsTab('general')}>⚙ <span>{t.settingsGeneral}</span></button>
        <button type="button" className={settingsTab === 'playback' ? 'active' : ''} onClick={() => setSettingsTab('playback')}>▶ <span>{t.settingsPlayback}</span></button>
        <button type="button" className={settingsTab === 'appearance' ? 'active' : ''} onClick={() => setSettingsTab('appearance')}>◐ <span>{t.settingsAppearance}</span></button>
        <button type="button" className={settingsTab === 'timeline' ? 'active' : ''} onClick={() => setSettingsTab('timeline')}>▥ <span>{t.settingsTimeline}</span></button>
        <button type="button" className={settingsTab === 'shortcuts' ? 'active' : ''} onClick={() => setSettingsTab('shortcuts')}>⌨ <span>{t.settingsShortcuts}</span></button>
      </nav><div className="rdvd-settings-content">
        {settingsTab === 'general' && <div className="rdvd-settings-section"><h3>{t.settingsGeneral}</h3><div className="rdvd-setting-card-grid"><label className="rdvd-setting-card"><span>{t.settingsLanguage}</span><select value={language} onChange={(e) => setLanguage(e.target.value as Language)}><option value="vi">🇻🇳 Tiếng Việt</option><option value="en">🇬🇧 English</option></select></label><label className="rdvd-setting-card"><span>{t.settingsTheme}</span><select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="dark">◐ {t.themeDark}</option><option value="light">◑ {t.themeLight}</option></select></label></div><label className="rdvd-setting-switch"><input type="checkbox" checked={globalShortcutsEnabled} onChange={(e) => setGlobalShortcutsEnabled(e.target.checked)} /><span><strong>{t.settingsGlobalShortcuts}</strong><small>{t.settingsGlobalShortcutsHint}</small></span></label><label className="rdvd-setting-switch"><input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} /><span><strong>{t.settingsPerformance}</strong><small>{t.settingsReduceMotionHint}</small></span></label></div>}
        {settingsTab === 'playback' && <div className="rdvd-settings-section"><h3>{t.settingsPlayback}</h3><label className="rdvd-setting-range"><span><strong>{t.settingsSeekStep}</strong><output>{playbackSeekStep}s</output></span><input type="range" min="1" max="15" step="1" value={playbackSeekStep} onChange={(e) => setPlaybackSeekStep(Number(e.target.value))} /><small>{t.settingsSeekStepHint}</small></label><label className="rdvd-setting-switch"><input type="checkbox" checked={loopPlayback} onChange={(e) => setLoopPlayback(e.target.checked)} /><span><strong>{t.settingsLoopPlayback}</strong><small>{t.settingsLoopHint}</small></span></label><label className="rdvd-setting-switch"><input type="checkbox" checked={startMuted} onChange={(e) => setStartMuted(e.target.checked)} /><span><strong>{t.settingsStartMuted}</strong><small>{t.settingsStartMutedHint}</small></span></label></div>}
        {settingsTab === 'appearance' && <div className="rdvd-settings-section"><h3>{t.settingsAppearance}</h3><div className="rdvd-setting-card-grid"><label className="rdvd-setting-card"><span>{t.settingsTheme}</span><select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="dark">◐ {t.themeDark}</option><option value="light">◑ {t.themeLight}</option></select></label><label className="rdvd-setting-card"><span>{t.subtitleCustomize}</span><select value={subtitlePanelStartup ? 'open' : 'closed'} onChange={(e) => setSubtitlePanelStartup(e.target.value === 'open')}><option value="closed">{t.hide}</option><option value="open">{t.show}</option></select></label></div><label className="rdvd-setting-switch"><input type="checkbox" checked={autoSubtitleFrame} onChange={(e) => setAutoSubtitleFrame(e.target.checked)} /><span><strong>{t.settingsAutoSubtitleFrame}</strong><small>{t.settingsAutoSubtitleFrameHint}</small></span></label><label className="rdvd-setting-switch"><input type="checkbox" checked={subtitlePanelStartup} onChange={(e) => setSubtitlePanelStartup(e.target.checked)} /><span><strong>{t.settingsSubtitlePanelStartup}</strong><small>{t.settingsSubtitlePanelStartupHint}</small></span></label></div>}
        {settingsTab === 'timeline' && <div className="rdvd-settings-section"><h3>{t.settingsTimeline}</h3><label className="rdvd-setting-range"><span><strong>{t.settingsDefaultZoom}</strong><output>{Math.round(defaultTimelineZoom * 100)}%</output></span><input type="range" min="0.5" max="4" step="0.25" value={defaultTimelineZoom} onChange={(e) => setDefaultTimelineZoom(Number(e.target.value))} /><small>{t.settingsDefaultZoomHint}</small></label></div>}
        {settingsTab === 'shortcuts' && <div className="rdvd-settings-section"><h3>{t.settingsShortcuts}</h3><p className="rdvd-settings-note">{t.settingsShortcutsHint}</p><div className="rdvd-shortcut-list"><div><span>{t.language}</span><kbd>Ctrl + Shift + L</kbd></div><div><span>{t.theme}</span><kbd>Ctrl + Shift + T</kbd></div><div><span>{t.subtitleCustomize}</span><kbd>Ctrl + Shift + S</kbd></div><div><span>{t.playVideo}</span><kbd>Space</kbd></div><div><span>{t.seekHere}</span><kbd>← / →</kbd></div></div></div>}
      </div></div>
      <footer className="rdvd-settings-foot"><span className="settings-saved">✓ {t.settingsSaved}</span><button type="button" className="rdvd-secondary" onClick={resetAppSettings}>{t.settingsReset}</button><button type="button" className="rdvd-primary settings-done" onClick={onClose}>{t.settingsDone}</button></footer>
    </section>
  </div>;
}
