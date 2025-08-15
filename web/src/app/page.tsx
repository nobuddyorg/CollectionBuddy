'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from './lib/supabase';
import { useSession } from './hooks/useSession';
import LoadingOverlay from './components/LoadingOverlay';
import CategorySelect from './components/CategorySelect';
import ItemCreate from './components/ItemCreate';
import ItemList from './components/ItemList';
import Header from './components/Header';
import { useI18n } from './hooks/useI18n';
import { useRouter } from 'next/navigation';

function usePref(key: string, initial: boolean) {
  const [v, setV] = useState<boolean>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s === '1') setV(true);
      if (s === '0') setV(false);
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {}
  }, [key, v]);
  return [v, setV] as const;
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639.98px)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

function CenteredModal({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  useBodyScrollLock(open);
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => onOpenChange(false)}
      />
      {/* Modal */}
      <div
        className={`fixed inset-0 z-[81] flex items-center justify-center p-4 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-base font-semibold">{title}</h3>
            <button
              className="rounded-md px-3 py-1 text-sm border"
              onClick={() => onOpenChange(false)}
              aria-label={closeLabel}
            >
              {closeLabel}
            </button>
          </div>
          <div className="p-4 overflow-auto">{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}


export default function Page() {
  const { user, loading } = useSession();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const { t } = useI18n();
  const router = useRouter();
  const isMobile = useIsMobile();

  const prefKey = useMemo(
    () => (selectedCategoryId ? `cb_open_${selectedCategoryId}` : 'cb_open_none'),
    [selectedCategoryId],
  );
  const [open, setOpen] = usePref(prefKey, false);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('Sign-out failed:', error.message);
      setTimeout(() => router.replace('/login'), 100);
    } catch (err) {
      console.error('Unexpected error during sign-out:', err);
      router.replace('/login');
    }
  }, [router]);

  const handleCreated = useCallback(() => {
    setOpen(false);
    setRefreshToken((k) => k + 1);
  }, [setOpen]);

  if (loading) return <LoadingOverlay />;
  if (!user) return null;

 return (
  <div className="min-h-[100dvh] bg-gradient-to-b from-amber-50 via-white to-stone-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
    <Header user={user} onSignOut={signOut} />

    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6">
      <CategorySelect selectedCat={selectedCategoryId} onSelect={setSelectedCategoryId} />

      {selectedCategoryId ? (
        <section className="relative z-50 rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">{t('page.entries')}</h2>
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg px-3 py-1.5 bg-primary text-primary-foreground shadow-sm hover:brightness-110"
            >
              +
            </button>
          </div>

          <ItemList key={refreshToken} categoryId={selectedCategoryId} />
        </section>
      ) : (
        <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-10 grid place-items-center text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-amber-500/90 ring-8 ring-amber-200/40 dark:ring-amber-900/20 grid place-items-center text-3xl">
              🧺
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{t('page.choose_category')}</h3>
              <p className="text-sm opacity-70">{t('page.add_collectibles')}</p>
            </div>
          </div>
        </section>
      )}
    </main>

    {/* Modal for adding new entry — works on both desktop and mobile */}
    {selectedCategoryId && (
      <CenteredModal
  open={open}
  onOpenChange={setOpen}
  title={t('item_create.new_entry')}
  closeLabel='X'
>
  <ItemCreate categoryId={selectedCategoryId} onCreated={handleCreated} />
</CenteredModal>
    )}

    <footer className="px-4 py-8 text-center text-xs opacity-60">
      {t('page.footer')}
    </footer>
  </div>
);


}
