'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect';
import {
  CATEGORY_TABPANEL_ID,
  categoryTabId,
} from './components/CategorySelect/Dropdown';
import {
  pickInitialCategory,
  readStoredCategory,
  storeSelectedCategory,
} from './components/CategorySelect/selection';
import { useCategories } from './components/CategorySelect/useCategories';
import Header from './components/Header';
import ItemList from './components/ItemList';
import { ItemListSkeleton } from './components/ItemList/Skeleton';
import LoadingOverlay from './components/LoadingOverlay';
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

  // Every selection is remembered, so the next visit opens where this one
  // left off rather than on a chooser.
  const selectCategory = useCallback((id: string | null) => {
    setSelectedCategoryId(id);
    storeSelectedCategory(id);
  }, []);

  const categories = useCategories();
  const { reload } = categories;
  // `user` is a fresh object on every onAuthStateChange event, so depending
  // on it by identity re-ran this effect far more than the session actually
  // changed. The id is stable across those events.
  const userId = user?.id;

  // True only once the first listing is back *and* a category is selected,
  // in the same tick -- otherwise there's a render with categories loaded
  // but nothing selected, which used to flash the "choose a category"
  // prompt unnecessarily.
  const [catalogueReady, setCatalogueReady] = useState(false);

  // These rows are only readable under the signed-in user's RLS policies,
  // so firing before the session resolves just asks for a list Postgres
  // will refuse to return.
  useEffect(() => {
    if (loading || !userId) return;
    void reload().then((catsData) => {
      // Whatever was last on screen, or the first category. Auto-selecting
      // only a lone category meant owning a second one turned every
      // sign-in into a decision.
      setSelectedCategoryId(
        (current) =>
          current ?? pickInitialCategory(catsData, readStoredCategory()),
      );
      setCatalogueReady(true);
    });
  }, [loading, userId, reload]);

  const signOut = useCallback(async () => {
    try {
      // Global scope revokes the refresh token server-side; fall back to a
      // local clear on failure so a network error can't leave the user
      // signed in on this device.
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

  // Not memoized: cats is short, and this only runs on renders the
  // component is already doing for its own reasons.
  const selectedCategory =
    categories.cats.find((c) => c.id === selectedCategoryId) ?? null;
  // Owner, or an active editor grant (0014_editor_shares.sql); a viewer
  // grant or no grant both fall through to false.
  const canEditSelected =
    !!selectedCategory &&
    (selectedCategory.user_id === userId ||
      (selectedCategory.category_shares ?? []).some(
        (s) => s.role === 'editor',
      ));

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-overlay focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('page.skip_to_content')}
      </a>

      <Header user={headerUser} onSignOut={signOut} />

      {/* No wrapper panels: nesting cards inside bordered trays ate the
          width on a 390px screen. */}
      <main
        id="main-content"
        // Focusable so a closing dialog can land focus here when the
        // control that opened it is gone -- see useFocusTrap's fallback.
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-5 sm:py-8 space-y-5 sm:space-y-7"
      >
        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={selectCategory}
          categories={categories}
          userId={userId ?? null}
          ready={catalogueReady}
        />

        {!catalogueReady ? (
          // Holds the shape of the entries about to appear, so the page
          // fills in rather than assembling itself in visible steps.
          <ItemListSkeleton />
        ) : hasCategory ? (
          <section
            role="tabpanel"
            id={CATEGORY_TABPANEL_ID}
            // The tab id only resolves while the category strip is
            // expanded; a dangling id is just skipped, so the heading id
            // still gives the panel an accessible name either way.
            aria-labelledby={`entries-heading ${categoryTabId(selectedCategoryId)}`}
            className="relative z-50 space-y-4"
          >
            <h2 id="entries-heading" className="sr-only">
              {t('page.entries')}
            </h2>
            <ItemList
              key={selectedCategoryId}
              categoryId={selectedCategoryId}
              canEdit={canEditSelected}
            />
          </section>
        ) : (
          // Only reachable for a collection with no categories at all.
          <section className="py-16 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4 max-w-xs">
              <div className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl">
                🧺
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-lg">
                  {t('page.no_categories')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('page.name_first_category')}
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
