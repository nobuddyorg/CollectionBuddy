'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect/index';
import Header from './components/Header/index';
import ItemList from './components/ItemList/index';
import LoadingOverlay from './components/LoadingOverlay/index';
import { useI18n } from './i18n/useI18n';
import { supabase } from './supabase';
import { useSession } from './useSession';

export default function Page() {
  const { user, loading } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const signOut = useCallback(async () => {
    try {
      // Global scope revokes the refresh token server-side. Fall back to a
      // local clear if that call fails, so the user is never left signed in
      // on this device by a network error.
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign-out failed:', error.message);
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (err) {
      console.error('Unexpected error during sign-out:', err);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }, [router]);

  if (loading)
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;
  if (!user) return null;

  const hasCategory = !!selectedCategoryId;
  const headerUser = { ...user, email: user.email ?? '' };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-overlay focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('page.skip_to_content')}
      </a>

      <Header user={headerUser} onSignOut={signOut} />

      <main
        id="main-content"
        className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6"
      >
        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {hasCategory ? (
          <section className="relative z-50 rounded-2xl border-2 border-primary/50 bg-muted p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 id="entries-heading" className="font-display text-lg">
                {t('page.entries')}
              </h2>
            </div>
            <ItemList
              key={selectedCategoryId}
              categoryId={selectedCategoryId!}
            />
          </section>
        ) : (
          <section className="rounded-2xl border-2 border-dashed border-primary/40 p-10 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-16 w-16 rounded-full bg-card grid place-items-center text-3xl shadow-inner border-2 border-primary/60">
                <span
                  className="pin"
                  style={{ top: -8, left: 'calc(50% - 9px)' }}
                  aria-hidden="true"
                />
                🧺
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg">
                  {t('page.choose_category')}
                </h3>
                <p className="text-sm text-foreground/70">
                  {t('page.add_collectibles')}
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center font-label text-[0.65rem] text-foreground/60">
        {t('page.footer')}
      </footer>
    </div>
  );
}
