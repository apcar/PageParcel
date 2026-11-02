import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { CaptureMode, ExportFormat, PopupMessage, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { getSettings, setSettings } from '../shared/storage';
import { onPopupMessage, sendToBackground } from '../shared/messaging';

// i18n helper
function t(id: string): string {
  return chrome.i18n.getMessage(id) ?? id;
}

// chrome:// URLs can't be opened via <a href>; tabs.create works from the popup.
function openShortcutSettings() {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

type ToastTone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type SecondaryMode = Exclude<CaptureMode, 'pack'>;

const SECONDARY: {
  id: SecondaryMode;
  titleKey: string;
  noteKey?: string;
  Icon: () => JSX.Element;
}[] = [
  { id: 'page-text', titleKey: 'modePageText', noteKey: 'modePageTextSub', Icon: TextIcon },
  { id: 'full-page', titleKey: 'modeFullPage', Icon: FullPageIcon },
  { id: 'visible', titleKey: 'modeVisible', Icon: VisibleIcon },
  { id: 'region', titleKey: 'modeRegion', Icon: RegionIcon },
];

const SAVE_PAGE_COMMAND = 'capture-trace-bundle';

/** Shown when Chrome reports no binding; matches the manifest's suggested key. */
function fallbackShortcut(): string {
  return /Mac/i.test(navigator.platform || navigator.userAgent) ? '⌘⇧E' : 'Ctrl+Shift+E';
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState<CaptureMode | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const saveShortcut = shortcuts[SAVE_PAGE_COMMAND] || fallbackShortcut();

  // Load settings + apply theme on mount.
  useEffect(() => {
    void getSettings().then((s) => {
      setSettingsState(s);
      setShowWelcome(s.showOnboarding);
      applyTheme(s.theme);
    });
    // Actual (possibly user-remapped) bindings, formatted per platform by Chrome.
    void chrome.commands.getAll().then((cmds) => {
      const map: Record<string, string> = {};
      for (const c of cmds) if (c.name && c.shortcut) map[c.name] = c.shortcut;
      setShortcuts(map);
    });
  }, []);

  // Listen for background progress / completion / errors.
  useEffect(() => {
    const off = onPopupMessage((msg: PopupMessage) => {
      switch (msg.type) {
        case 'CAPTURE_COMPLETE':
        case 'PACK_COMPLETE':
        case 'TEXT_COMPLETE':
          setBusy(null);
          setProgress(null);
          window.close();
          break;
        case 'CAPTURE_ERROR':
          setBusy(null);
          setProgress(null);
          pushToast(msg.message, 'error');
          break;
        case 'CAPTURE_PROGRESS':
          setProgress(msg.percent);
          break;
      }
    });
    return off;
  }, []);

  function pushToast(message: string, tone: ToastTone) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  async function updateSettings(patch: Partial<Settings>) {
    const next = await setSettings(patch);
    setSettingsState(next);
    if (patch.theme) applyTheme(next.theme);
  }

  function capture(mode: CaptureMode) {
    if (busy) return;
    setBusy(mode);
    if (mode === 'region') {
      sendToBackground({ type: 'CAPTURE_REQUEST', mode }).catch(() => {});
      setTimeout(() => window.close(), 0);
      return;
    }
    setProgress(0);
    sendToBackground({ type: 'CAPTURE_REQUEST', mode }).catch(() => {
      setBusy(null);
      setProgress(null);
      pushToast(t('couldNotReach'), 'error');
    });
  }

  async function dismissWelcome() {
    setShowWelcome(false);
    const next = await setSettings({ showOnboarding: false });
    setSettingsState(next);
  }

  return (
    <div class="app">
      <header class="header">
        {showSettings ? (
          <div class="brand">
            <button
              class="icon-btn"
              title={t('backAria')}
              aria-label={t('backAria')}
              onClick={() => setShowSettings(false)}
            >
              <BackMark />
            </button>
            <span class="brand-name">{t('settingsTitle')}</span>
          </div>
        ) : (
          <>
            <div class="brand">
              <ParcelMark />
              <span class="brand-name">PageParcel</span>
            </div>
            <button
              class="icon-btn"
              title={t('settingsTitle')}
              aria-label={t('settingsTitle')}
              onClick={() => setShowSettings(true)}
            >
              <GearMark />
            </button>
          </>
        )}
      </header>

      {showSettings ? (
        <SettingsView settings={settings} onChange={updateSettings} shortcut={saveShortcut} />
      ) : showWelcome ? (
        <Welcome onDone={dismissWelcome} />
      ) : (
        <>
          <button
            class="primary-action"
            data-busy={busy === 'pack' ? 'true' : undefined}
            disabled={!!busy}
            onClick={() => capture('pack')}
          >
            <span class="primary-icon" aria-hidden="true">
              {busy === 'pack' ? <span class="spinner spinner-light" /> : <SaveIcon />}
            </span>
            <span class="primary-text">
              <span class="primary-title">{t('modePack')}</span>
              <span class="primary-sub">
                {busy === 'pack'
                  ? t('capturing') + (progress != null ? ' ' + progress + '%' : '')
                  : t('modePackSub')}
              </span>
            </span>
            <kbd class="primary-kbd">{saveShortcut}</kbd>
            {busy === 'pack' && progress != null ? (
              <div class="progress" aria-hidden="true">
                <div class="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </button>

          <div class="section-label" id="one-part">
            {t('sectionJustOnePart')}
          </div>
          <nav class="list" aria-labelledby="one-part">
            {SECONDARY.map((m) => {
              const isBusy = busy === m.id;
              return (
                <button
                  key={m.id}
                  class="list-row"
                  data-busy={isBusy ? 'true' : undefined}
                  disabled={!!busy}
                  onClick={() => capture(m.id)}
                >
                  <span class="list-icon" aria-hidden="true">
                    <m.Icon />
                  </span>
                  <span class="list-label">
                    {t(m.titleKey)}
                    {m.noteKey ? <span class="list-note">{t(m.noteKey)}</span> : null}
                  </span>
                  {isBusy ? (
                    <span class="list-status">
                      {m.id === 'full-page' && progress != null
                        ? t('capturing') + ' ' + progress + '%'
                        : t('capturing')}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </>
      )}

      <div class="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} class={`toast toast-${toast.tone}`} role="status">
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  label,
  onPick,
  disabled,
  full,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onPick: (v: T) => void;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <div class={full ? 'seg seg-full' : 'seg'}>
      {options.map((v) => (
        <button
          key={v}
          class="seg-btn"
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onPick(v)}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SettingsView({
  settings,
  onChange,
  shortcut,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  shortcut: string;
}) {
  const showQuality = settings.defaultFormat === 'jpeg' || settings.defaultFormat === 'webp';
  const isPdf = settings.defaultFormat === 'pdf';
  const pdfDisabled = settings.pdfPageSize === 'full';

  const pdfCard = (
    <div class="card">
      <div class="card-row">
        <span>{t('settingsPdfPageSize')}</span>
        <Seg
          value={settings.pdfPageSize}
          options={['a4', 'letter', 'full'] as const}
          label={(p) => t('pdfPageSize' + cap(p))}
          onPick={(p) => onChange({ pdfPageSize: p })}
        />
      </div>
      <div class="card-row">
        <span>{t('settingsPdfOrientation')}</span>
        <Seg
          value={settings.pdfOrientation}
          options={['portrait', 'landscape'] as const}
          label={(o) => t('pdfOrientation' + cap(o))}
          onPick={(o) => onChange({ pdfOrientation: o })}
          disabled={pdfDisabled}
        />
      </div>
      <label class="card-row">
        <span>{t('pdfMultiPage')}</span>
        <input
          class="switch"
          type="checkbox"
          role="switch"
          checked={settings.pdfMultiPage && !pdfDisabled}
          disabled={pdfDisabled}
          onChange={(e) => onChange({ pdfMultiPage: (e.target as HTMLInputElement).checked })}
        />
      </label>
      <label class="card-row">
        <span>{t('pdfMargin')}</span>
        <span class="unit">
          <input
            class="num-input"
            type="number"
            min="0"
            max="40"
            step="1"
            value={settings.pdfMarginMm}
            disabled={pdfDisabled}
            onInput={(e) => onChange({ pdfMarginMm: Number((e.target as HTMLInputElement).value) })}
          />
          mm
        </span>
      </label>
      {pdfDisabled ? <div class="card-hint">{t('pdfFullHint')}</div> : null}
    </div>
  );

  return (
    <div class="settings">
      <div class="section-label">{t('settingsAppearance')}</div>
      <div class="card">
        <div class="card-row">
          <span>{t('settingsTheme')}</span>
          <Seg
            value={settings.theme}
            options={['light', 'dark', 'system'] as const}
            label={(v) => t('theme' + cap(v))}
            onPick={(v) => onChange({ theme: v })}
          />
        </div>
      </div>

      <div class="section-label">{t('settingsSaving')}</div>
      <div class="card">
        <div class="card-row card-col">
          <span>{t('settingsDefaultFormat')}</span>
          <Seg
            full
            value={settings.defaultFormat}
            options={['png', 'jpeg', 'webp', 'pdf'] as const}
            label={(f) => t('format' + cap(f))}
            onPick={(f) => onChange({ defaultFormat: f as ExportFormat })}
          />
        </div>
        {showQuality ? (
          <label class="card-row card-col">
            <span class="row-between">
              <span>{t('settingsQuality')}</span>
              <span class="value">{Math.round(settings.quality * 100)}%</span>
            </span>
            <input
              class="range"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.quality}
              onInput={(e) => onChange({ quality: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        ) : null}
        <label class="card-row card-col">
          <span>{t('settingsFilename')}</span>
          <input
            class="text-input"
            type="text"
            spellcheck={false}
            value={settings.filenameTemplate}
            onInput={(e) => onChange({ filenameTemplate: (e.target as HTMLInputElement).value })}
          />
          <span class="card-hint">{t('filenameHint')}</span>
        </label>
      </div>

      {isPdf ? (
        <>
          <div class="section-label">{t('settingsPdfDefaults')}</div>
          {pdfCard}
        </>
      ) : (
        <details class="pdf-details">
          <summary class="section-label">{t('settingsPdfDefaults')}</summary>
          <div class="card-hint pdf-note">{t('pdfOptionsHint')}</div>
          {pdfCard}
        </details>
      )}

      <div class="section-label">{t('settingsShortcuts')}</div>
      <div class="card">
        <div class="card-row">
          <span>
            {t('shortcutSavePage')} <span class="value">{shortcut}</span>
          </span>
          <button class="link-btn" onClick={openShortcutSettings}>
            {t('changeInChrome')} ›
          </button>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onDone }: { onDone: () => void }) {
  return (
    <div class="welcome">
      <h2 class="welcome-title">{t('welcomeTitle')}</h2>
      <p class="welcome-lede">{t('welcomeLede')}</p>
      <ul class="welcome-list">
        <li>{t('welcomeList1')}</li>
        <li>{t('welcomeList2')}</li>
        <li>{t('welcomeList3')}</li>
      </ul>
      <p class="welcome-perm">{t('welcomePerm')}</p>
      <button class="btn-primary" onClick={onDone}>
        {t('welcomeCta')}
      </button>
    </div>
  );
}

function ParcelMark() {
  return (
    <span class="brand-mark" aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 2l9 5v10l-9 5-9-5V7z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
    </span>
  );
}

function LineIcon({
  children,
  size = 20,
}: {
  children: JSX.Element[] | JSX.Element;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  );
}

function SaveIcon() {
  return (
    <LineIcon size={22}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </LineIcon>
  );
}

function TextIcon() {
  return (
    <LineIcon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </LineIcon>
  );
}

function FullPageIcon() {
  return (
    <LineIcon>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M12 7v10M9 14l3 3 3-3" />
    </LineIcon>
  );
}

function VisibleIcon() {
  return (
    <LineIcon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
    </LineIcon>
  );
}

function RegionIcon() {
  return (
    <LineIcon>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </LineIcon>
  );
}

function GearMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BackMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function applyTheme(theme: Settings['theme']) {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
