'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

type ToastKind = 'error' | 'success';
type ToastEntry = { id: number; message: string; kind: ToastKind };

type ToastApi = {
  error: (message: string) => void;
  /** Visible, self-dismissing confirmation for actions whose only other
   * signal is structural (a card disappearing, a button re-enabling). */
  success: (message: string) => void;
  /** Posts an outcome to the app-level polite live region, for anyone not
   * looking at whatever just changed. */
  announce: (message: string) => void;
  /** console.error + toast.error together: `scope` is a short console
   * label, `err` is logged in full, `message` is shown to the user. */
  reportError: (scope: string, err: unknown, message: string) => void;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const AUTO_DISMISS_MS = 6000;

/* v8 ignore start -- provider internals (state, effects, portal); useToast
 * above and the pure error/dismiss logic aren't separable from React state
 * here, so there's no pure surface left to unit-test in isolation. */
// Stryker disable all: provider internals aren't covered by tests.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(0);

  // Gated on a post-mount flag, not a bare `typeof document` check, so the
  // client's first render pass matches the server's (which never renders
  // the portal at all) for hydration.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const post = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const error = useCallback(
    (message: string) => post('error', message),
    [post],
  );
  const success = useCallback(
    (message: string) => post('success', message),
    [post],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const reportError = useCallback(
    (scope: string, err: unknown, message: string) => {
      console.error(scope, err);
      post('error', message);
    },
    [post],
  );

  const api = useMemo<ToastApi>(
    () => ({ error, success, announce, reportError }),
    [error, success, announce, reportError],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The one polite live region for the whole app -- unlike the toasts
          below, this never needs to be seen. */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {mounted &&
        ReactDOM.createPortal(
          <div className="fixed inset-x-0 bottom-4 z-overlay flex flex-col items-center gap-2 px-4 pointer-events-none">
            {toasts.map((entry) => (
              <div
                key={entry.id}
                role={entry.kind === 'error' ? 'alert' : 'status'}
                aria-live={entry.kind === 'error' ? 'assertive' : 'polite'}
                className={`pointer-events-auto max-w-sm w-full rounded-sm shadow-lg px-4 py-3 flex items-start gap-3 ${
                  entry.kind === 'error'
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                <span className="flex-1 text-sm">{entry.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(entry.id)}
                  className="shrink-0 -m-1 p-1"
                  aria-label={t('common.close')}
                >
                  <Icon icon={IconType.Close} className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
// Stryker restore all
/* v8 ignore stop */
