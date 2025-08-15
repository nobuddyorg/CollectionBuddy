'use client';
import { useCallback, useState } from 'react';
import { supabase } from './lib/supabase';
import { useSession } from './hooks/useSession';
import LoadingOverlay from './components/LoadingOverlay';
import CategorySelect from './components/CategorySelect';
import ItemCreate from './components/ItemCreate';
import ItemList from './components/ItemList';
import Header from './components/Header';
import { useI18n } from './hooks/useI18n';

export default function Page() {
  const { user, loading } = useSession();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const { t } = useI18n();

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  if (loading) return <LoadingOverlay />;
  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-amber-50 via-white to-stone-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      <Header user={user} onSignOut={signOut} />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6">
        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {selectedCategoryId ? (
          <>
            <ItemCreate
              categoryId={selectedCategoryId}
              onCreated={() => setRefreshToken((k) => k + 1)}
            />

            <section className="relative z-60 rounded-2xl border bg-white/70 dark:bg-neutral-900/60 backdrop-blur shadow-sm p-4 sm:p-5">
              <h2 className="text-base font-semibold mb-3">
                {t('page.entries')}
              </h2>
              <ItemList key={refreshToken} categoryId={selectedCategoryId} />
            </section>
          </>
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

      <footer className="px-4 py-8 text-center text-xs opacity-60">
        {t('page.footer')}
      </footer>
    </div>
  );
}
