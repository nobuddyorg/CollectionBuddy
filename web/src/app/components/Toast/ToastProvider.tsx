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
import { useBeforeUnloadGuard } from '../../lib/useBeforeUnloadGuard';
import Icon, { IconType } from '../Icon';
import { createPendingToasts } from './pendingToasts';

type ToastKind = 'error' | 'success';
type ToastAction = { label: string; onClick: () => void };
type ToastEntry = {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  onExpire?: () => void | Promise<void>;
};
type PendingToast = {
  entry: ToastEntry;
  timer: ReturnType<typeof setTimeout>;
};
type SuccessOptions = {
  /** A second button that cancels `onExpire` and runs its own `onClick`: the toast's undo. */
  action?: ToastAction;
  /** Runs once, on auto-dismiss or the close button; the deferred destructive step goes here. */
  onExpire?: () => void | Promise<void>;
};

type ToastApi = {
  error: (message: string) => void;
  /** Visible, self-dismissing confirmation for actions whose only other signal is structural. */
  success: (message: string, options?: SuccessOptions) => void;
  /** Posts an outcome to the app-level polite live region. */
  announce: (message: string) => void;
  /** console.error(scope, error) plus toast.error(message). */
  reportError: (scope: string, error: unknown, message: string) => void;
  /** Expires every toast now, running each onExpire, and resolves once all of them have finished. */
  commitPending: () => Promise<void>;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(0);

  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a post-mount flag keeps the client's first render identical to the server's (no portal) for hydration
  useEffect(() => setMounted(true), []);

  // Kept by id so expire() reads onExpire outside a setState updater, which Strict Mode runs twice.
  const [pending] = useState(() => createPendingToasts<PendingToast>());

  // Every way out of a toast goes through here; take() makes it the toast's only one.
  const settle = useCallback(
    (id: number) => {
      const taken = pending.take(id);
      setToasts((previous) => previous.filter((entry) => entry.id !== id));
      clearTimeout(taken?.timer);
      return taken?.entry;
    },
    [pending],
  );

  // Auto-dismiss and the close button both commit; only the action button (undo) skips onExpire.
  const expire = useCallback(
    async (id: number) => {
      await settle(id)?.onExpire?.();
    },
    [settle],
  );

  const undo = useCallback(
    (id: number) => {
      settle(id)?.action?.onClick();
    },
    [settle],
  );

  const commitPending = useCallback(async () => {
    await Promise.all(pending.ids().map(expire));
  }, [pending, expire]);

  // A deferred delete lives only in this tab: leaving inside its undo window would drop it unsent.
  useBeforeUnloadGuard(toasts.some((entry) => entry.onExpire));

  const post = useCallback(
    (kind: ToastKind, message: string, options?: SuccessOptions) => {
      const id = ++nextId.current;
      const entry: ToastEntry = {
        id,
        message,
        kind,
        action: options?.action,
        onExpire: options?.onExpire,
      };
      const timer = setTimeout(() => void expire(id), AUTO_DISMISS_MS);
      pending.add(id, { entry, timer });
      setToasts((previous) => [...previous, entry]);
    },
    [pending, expire],
  );

  const error = useCallback(
    (message: string) => post('error', message),
    [post],
  );
  const success = useCallback(
    (message: string, options?: SuccessOptions) =>
      post('success', message, options),
    [post],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const reportError = useCallback(
    (scope: string, error: unknown, message: string) => {
      console.error(scope, error);
      post('error', message);
    },
    [post],
  );

  const api = useMemo<ToastApi>(
    () => ({ error, success, announce, reportError, commitPending }),
    [error, success, announce, reportError, commitPending],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The one polite live region for the whole app; unlike the toasts, never meant to be seen */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {mounted &&
        ReactDOM.createPortal(
          <div className="fixed inset-x-0 bottom-4 z-overlay flex flex-col items-center gap-2 px-4 pointer-events-none">
            {toasts.map((entry) => (
              <div
                key={entry.id}
                data-testid="toast"
                role={entry.kind === 'error' ? 'alert' : 'status'}
                aria-live={entry.kind === 'error' ? 'assertive' : 'polite'}
                className={`pointer-events-auto max-w-sm w-full rounded-sm shadow-lg px-4 py-3 flex items-start gap-3 ${
                  entry.kind === 'error'
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                <span className="flex-1 text-sm">{entry.message}</span>
                {entry.action && (
                  <button
                    type="button"
                    data-testid="toast-action"
                    onClick={() => undo(entry.id)}
                    className="shrink-0 -my-1 px-1 py-1 text-sm font-medium underline underline-offset-2"
                  >
                    {entry.action.label}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="toast-close"
                  onClick={() => void expire(entry.id)}
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
