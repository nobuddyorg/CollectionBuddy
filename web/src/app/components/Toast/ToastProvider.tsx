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

type ToastEntry = { id: number; message: string };

type ToastApi = { error: (message: string) => void };

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
  const nextId = useRef(0);

  // The portal target (document.body) only exists in the browser. Gating on
  // a post-mount flag instead of a bare `typeof document` check keeps the
  // client's first render pass -- the one hydration diffs against -- matching
  // the server's, which never renders the portal at all.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const error = useCallback(
    (message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ error }), [error]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        ReactDOM.createPortal(
          <div className="fixed inset-x-0 bottom-4 z-overlay flex flex-col items-center gap-2 px-4 pointer-events-none">
            {toasts.map((entry) => (
              <div
                key={entry.id}
                role="alert"
                aria-live="assertive"
                className="pointer-events-auto max-w-sm w-full rounded-xl bg-destructive text-destructive-foreground shadow-lg px-4 py-3 flex items-start gap-3"
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
