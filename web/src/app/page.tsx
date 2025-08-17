'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect/index';
import CenteredModal from './components/CenteredModal/index';
import Header from './components/Header/index';
import ItemCreate from './components/ItemCreate/index';
import ItemList from './components/ItemList/index';
import LoadingOverlay from './components/LoadingOverlay/index';
import { useI18n } from './i18n/useI18n';
import { supabase } from './supabase';
import { usePref } from './usePref';
import { useSession } from './useSession';

export default function Page() {
  const { user, loading } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const prefKey = selectedCategoryId
    ? `cb_open_${selectedCategoryId}`
    : 'cb_open_none';
  const [isDialogOpen, setDialogOpen] = usePref(prefKey, false);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('Sign-out failed:', error.message);
    } catch (err) {
      console.error('Unexpected error during sign-out:', err);
    } finally {
      router.replace('/login');
    }
  }, [router]);

  const handleCreated = useCallback(() => {
    setDialogOpen(false);
    setRefreshToken((k) => k + 1);
  }, [setDialogOpen]);

  if (loading) return <LoadingOverlay label={t('item_list.loading')} />;
  if (!user) return null;

  const hasCategory = !!selectedCategoryId;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-amber-50 via-white to-stone-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      <Header user={user} onSignOut={signOut} />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6">
        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {hasCategory ? (
          <section className="relative z-50 rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">{t('page.entries')}</h2>
              <button
                onClick={() => setDialogOpen(true)}
                className="rounded-xl px-3 py-1.5 bg-primary text-primary-foreground shadow-sm hover:brightness-110"
                aria-label={t('item_create.new_entry')}
              >
                +
              </button>
            </div>
            <ItemList key={refreshToken} categoryId={selectedCategoryId!} />
          </section>
        ) : (
          <section className="rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-10 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-amber-500/90 ring-8 ring-amber-200/40 dark:ring-amber-900/20 grid place-items-center text-3xl">
                🧺
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">
                  {t('page.choose_category')}
                </h3>
                <p className="text-sm opacity-70">
                  {t('page.add_collectibles')}
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {hasCategory && (
        <CenteredModal
          open={isDialogOpen}
          onOpenChange={setDialogOpen}
          title={t('item_create.new_entry')}
          closeLabel="X"
        >
          <ItemCreate
            categoryId={selectedCategoryId!}
            onCreated={handleCreated}
          />
        </CenteredModal>
      )}

      <footer className="px-4 py-8 text-center text-xs opacity-60">
        {t('page.footer')}
      </footer>
    </div>
  );
}
