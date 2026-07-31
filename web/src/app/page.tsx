'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect/index';
import { useCategories } from './components/CategorySelect/useCategories';
import Header from './components/Header/index';
import ItemList from './components/ItemList/index';
import { ItemListSkeleton } from './components/ItemList/Skeleton';
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

  const categories = useCategories();
  const { reload } = categories;

  // False until the first listing has come back *and* a lone category has
  // been selected from it -- both in the same tick, so there is no render
  // in between where the categories exist but nothing is selected yet.
  // That render is what used to flash the "choose a category" prompt on
  // the way to a collection the user never had to choose.
  const [catalogueReady, setCatalogueReady] = useState(false);

  // Waits for the session: these rows are readable only under the signed-in
  // user's RLS policies, so firing this before the session resolves asks
  // the database for a list it will refuse to return.
  useEffect(() => {
    if (loading || !user) return;
    void reload().then((catsData) => {
      if (catsData.length === 1) setSelectedCategoryId(catsData[0].id);
      setCatalogueReady(true);
    });
  }, [loading, user, reload]);

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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-overlay focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('page.skip_to_content')}
      </a>

      <Header user={headerUser} onSignOut={signOut} />

      {/* No wrapper panels: cards are pinned straight to the teal wall.
          Nesting them inside bordered trays ate the width on a 390px
          screen and contradicted the board metaphor. */}
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-5 sm:py-8 space-y-5 sm:space-y-7"
      >
        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          categories={categories}
        />

        {!catalogueReady ? (
          // Sign-in lands here before the categories are back, and for a
          // single-category collection the entries are the next thing to
          // appear. Holding their shape means the page fills in rather
          // than assembling itself in three visible steps.
          <ItemListSkeleton />
        ) : hasCategory ? (
          <section className="relative z-50 space-y-4">
            <h2 id="entries-heading" className="sr-only">
              {t('page.entries')}
            </h2>
            <ItemList
              key={selectedCategoryId}
              categoryId={selectedCategoryId!}
            />
          </section>
        ) : (
          <section className="py-16 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4 max-w-xs">
              <div className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl">
                🧺
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-lg">
                  {t('page.choose_category')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('page.add_collectibles')}
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="px-4 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-center font-label text-[0.6875rem] text-muted-foreground">
        {t('page.footer')}
      </footer>
    </div>
  );
}
