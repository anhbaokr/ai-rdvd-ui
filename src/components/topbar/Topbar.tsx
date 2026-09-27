import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Language, Theme, UiText } from '../../types';
import { closeAppWindow, minimizeAppWindow, toggleMaximizeAppWindow } from '../../tauriWindow';

interface TopbarProps {
  t: UiText;
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  showLanguageMenu: boolean;
  setShowLanguageMenu: Dispatch<SetStateAction<boolean>>;
  showThemeMenu: boolean;
  setShowThemeMenu: Dispatch<SetStateAction<boolean>>;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  menuPosition: { top: number; left: number; width: number };
  languageButtonRef: RefObject<HTMLButtonElement | null>;
  themeButtonRef: RefObject<HTMLButtonElement | null>;
  positionTopbarMenu: (button: HTMLButtonElement | null) => void;
}

export function Topbar(props: TopbarProps) {
  const {
    t, language, setLanguage, theme, setTheme, showLanguageMenu, setShowLanguageMenu,
    showThemeMenu, setShowThemeMenu, showSettings, setShowSettings, menuPosition,
    languageButtonRef, themeButtonRef, positionTopbarMenu,
  } = props;

  return <header className="rdvd-topbar">
    <div className="rdvd-brand" data-tauri-drag-region onDoubleClick={() => { void toggleMaximizeAppWindow(); }}>
      <div className="rdvd-logo" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <span>AI RDvD</span><i /><span className="rdvd-brand-sub">{t.brandSub}</span>
    </div>
    <div className="rdvd-topbar-drag-spacer" data-tauri-drag-region onDoubleClick={() => { void toggleMaximizeAppWindow(); }} aria-hidden="true" />
    <div className="rdvd-window-tools" data-tauri-drag-region="false">
      <div className="rdvd-command-group" aria-label={t.shortcuts}>
        <div className="rdvd-topbar-menu">
          <button ref={languageButtonRef} className="rdvd-command-btn" aria-haspopup="menu" aria-expanded={showLanguageMenu} onClick={() => { const next = !showLanguageMenu; setShowLanguageMenu(next); setShowThemeMenu(false); if (next) positionTopbarMenu(languageButtonRef.current); }}>
            <span className="command-icon">A文</span><span className="command-copy"><strong>{t.language}</strong><em>{language.toUpperCase()}</em></span><span className="chevron">⌄</span>
          </button>
          {showLanguageMenu && <div className="rdvd-dropdown command-dropdown rdvd-floating-dropdown" role="menu" style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}>
            <div className="dropdown-heading">{t.language}<kbd>Ctrl&nbsp;Shift&nbsp;L</kbd></div>
            <button className={language === 'vi' ? 'active' : ''} onClick={() => { setLanguage('vi'); setShowLanguageMenu(false); }}><span className="menu-icon">🇻🇳</span><span className="menu-copy"><strong>Tiếng Việt</strong><small>Vietnamese</small></span><span className="check">{language === 'vi' ? '✓' : ''}</span></button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => { setLanguage('en'); setShowLanguageMenu(false); }}><span className="menu-icon">🇬🇧</span><span className="menu-copy"><strong>English</strong><small>English</small></span><span className="check">{language === 'en' ? '✓' : ''}</span></button>
          </div>}
        </div>
        <div className="rdvd-topbar-menu">
          <button ref={themeButtonRef} className="rdvd-command-btn" aria-haspopup="menu" aria-expanded={showThemeMenu} onClick={() => { const next = !showThemeMenu; setShowThemeMenu(next); setShowLanguageMenu(false); if (next) positionTopbarMenu(themeButtonRef.current); }}>
            <span className="command-icon">{theme === 'dark' ? '◐' : '◑'}</span><span className="command-copy"><strong>{t.theme}</strong><em>{theme === 'dark' ? t.themeDark : t.themeLight}</em></span><span className="chevron">⌄</span>
          </button>
          {showThemeMenu && <div className="rdvd-dropdown command-dropdown theme-dropdown rdvd-floating-dropdown" role="menu" style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}>
            <div className="dropdown-heading">{t.theme}<kbd>Ctrl&nbsp;Shift&nbsp;T</kbd></div>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setShowThemeMenu(false); }}><span className="menu-icon">☾</span><span className="menu-copy"><strong>{t.themeDark}</strong><small>{t.darkWorkspace}</small></span><span className="check">{theme === 'dark' ? '✓' : ''}</span></button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setShowThemeMenu(false); }}><span className="menu-icon">☀</span><span className="menu-copy"><strong>{t.themeLight}</strong><small>{t.lightWorkspace}</small></span><span className="check">{theme === 'light' ? '✓' : ''}</span></button>
          </div>}
        </div>
      </div>
      <div className="rdvd-window-divider" />
      <button className="rdvd-icon-btn settings-btn" aria-label={t.settings} aria-haspopup="dialog" aria-expanded={showSettings} onClick={() => { setShowSettings(true); setShowLanguageMenu(false); setShowThemeMenu(false); }}>⚙</button>
      <button type="button" className="rdvd-window" aria-label={language === 'vi' ? 'Thu nhỏ' : 'Minimize'} onClick={() => { void minimizeAppWindow(); }}>—</button>
      <button type="button" className="rdvd-window" aria-label={language === 'vi' ? 'Phóng to' : 'Maximize'} onClick={() => { void toggleMaximizeAppWindow(); }}>□</button>
      <button type="button" className="rdvd-window close" aria-label={language === 'vi' ? 'Đóng' : 'Close'} onClick={() => { void closeAppWindow(); }}>×</button>
    </div>
  </header>;
}
