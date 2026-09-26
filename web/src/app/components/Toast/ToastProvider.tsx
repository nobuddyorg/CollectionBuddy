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
import {
  type Countdown,
  type HoldReason,
  holdCountdown,
  releaseCountdown,
  startCountdown,
} from './countdown';
import { createPendingToasts } from './pendingToasts';
import { isUndoShortcut } from './undoShortcut';

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
  countdown: Countdown;
  /** Set only while the countdown runs. */
  timer?: ReturnType<typeof setTimeout>;
};
type SuccessOptions = {
  /** A second button that cancels `onExpire` and runs its own `onClick`: the toast's undo, also on Ctrl+Z. */
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
  // Keyed, so the same message twice still inserts a node the live region announces.
  const [announcement, setAnnouncement] = useState({ key: 0, message: '' });
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

  const schedule = useCallback(
    (id: number, countdown: Countdown) =>
      countdown.kind === 'running'
        ? setTimeout(() => void expire(id), countdown.remainingMs)
        : undefined,
    [expire],
  );

  const adjust = useCallback(
    (id: number, change: (countdown: Countdown, now: number) => Countdown) => {
      pending.update(id, (held) => {
        const countdown = change(held.countdown, Date.now());
        if (countdown === held.countdown) return held;
        clearTimeout(held.timer);
        return { ...held, countdown, timer: schedule(id, countdown) };
      });
    },
    [pending, schedule],
  );

  // WCAG 2.2.1: the time runs only while the toast is neither pointed at nor focused.
  const hold = useCallback(
    (id: number, reason: HoldReason) =>
      adjust(id, (countdown, now) => holdCountdown(countdown, { reason, now })),
    [adjust],
  );
  const release = useCallback(
    (id: number, reason: HoldReason) =>
      adjust(id, (countdown, now) =>
        releaseCountdown(countdown, { reason, now }),
      ),
    [adjust],
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
      const countdown = startCountdown(AUTO_DISMISS_MS, Date.now());
      pending.add(id, { entry, countdown, timer: schedule(id, countdown) });
      setToasts((previous) => [...previous, entry]);
    },
    [pending, schedule],
  );

  // The toasts sit last in the tab order; the shortcut reaches Undo from wherever focus is.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const newest = toasts.findLast((entry) => entry.action);
      if (!newest || !isUndoShortcut(event)) return;
      event.preventDefault();
      undo(newest.id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toasts, undo]);

  const announce = useCallback((message: string) => {
    setAnnouncement((previous) => ({ key: previous.key + 1, message }));
  }, []);

  const error = useCallback(
    (message: string) => post('error', message),
    [post],
  );
  // Spoken through the persistent live region: one inserted already filled is not reliably read.
  const success = useCallback(
    (message: string, options?: SuccessOptions) => {
      post('success', message, options);
      announce(
        options?.action
          ? `${message} ${t('common.undo_shortcut_hint')}`
          : message,
      );
    },
    [post, announce, t],
  );

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
        <span key={announcement.key}>{announcement.message}</span>
      </span>
      {mounted &&
        ReactDOM.createPortal(
          <div className="fixed inset-x-0 bottom-4 z-overlay flex flex-col items-center gap-2 px-4 pointer-events-none">
            {toasts.map((entry) => (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- hover and focus only hold the timer; the buttons inside carry every interaction
              <div
                key={entry.id}
                data-testid="toast"
                role={entry.kind === 'error' ? 'alert' : undefined}
                aria-live={entry.kind === 'error' ? 'assertive' : undefined}
                onPointerEnter={() => hold(entry.id, 'hover')}
                onPointerLeave={() => release(entry.id, 'hover')}
                onFocus={() => hold(entry.id, 'focus')}
                onBlur={() => release(entry.id, 'focus')}
                className={`pointer-events-auto max-w-sm w-full rounded-sm shadow-lg px-4 py-3 flex items-start gap-3 ${
                  entry.kind === 'error'
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                <span className="flex-1 text-sm">{entry.message}</span>
                {entry.action && (
                  <>
                    <button
                      type="button"
                      data-testid="toast-action"
                      onClick={() => undo(entry.id)}
                      aria-keyshortcuts="Control+Z Meta+Z"
                      className="shrink-0 -my-1 px-1 py-1 text-sm font-medium underline underline-offset-2"
                    >
                      {entry.action.label}
                    </button>
                    <kbd
                      aria-hidden="true"
                      className="hidden pointer-fine:inline shrink-0 font-sans text-xs leading-5"
                    >
                      {t('common.undo_shortcut')}
                    </kbd>
                  </>
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
