'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((msg) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setMessage(msg);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setMessage(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <CenteredModal
        open={message !== null}
        onOpenChange={(v) => {
          if (!v) settle(false);
        }}
        title={message ?? ''}
        closeLabel={t('common.close')}
        initialFocusRef={cancelRef}
      >
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="rounded-xl px-3 py-1.5 border hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className="rounded-xl px-3 py-1.5 bg-destructive text-destructive-foreground hover:brightness-110"
          >
            {t('common.confirm')}
          </button>
        </div>
      </CenteredModal>
    </ConfirmContext.Provider>
  );
}
