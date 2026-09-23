'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect';
import {
  CATEGORY_TABPANEL_ID,
  categoryTabId,
} from './components/CategorySelect/Dropdown';
import Header from './components/Header';
import ItemList from './components/ItemList';
import { ItemListSkeleton } from './components/ItemList/Skeleton';
import LoadingOverlay from './components/LoadingOverlay';
import { labelClasses } from './components/ui/labelClasses';
import { useI18n } from './i18n/useI18n';
import { useCatalogue } from './useCatalogue';
import { useSession } from './useSession';
import { useSignOut } from './useSignOut';

export default function Page() {
  const { user, loading } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  // The id, not `user`: a fresh user object arrives on every onAuthStateChange event.
  const userId = user?.id;
  const { categories, selectedCategoryId, selectCategory, catalogueReady } =
    useCatalogue(loading, userId);
  const signOut = useSignOut();

  if (loading)
    return <LoadingOverlay label={t('item_list.loading')} theme="auto" />;
  if (!user) return null;

  const hasCategory = !!selectedCategoryId;
  const headerUser = { ...user, email: user.email ?? '' };

  const selectedCategory =
    categories.cats.find((category) => category.id === selectedCategoryId) ??
    null;
  // UX only, RLS decides: owner or an editor grant; a viewer grant or none falls through to false.
  const canEditSelected =
    !!selectedCategory &&
    (selectedCategory.user_id === userId ||
      (selectedCategory.category_shares ?? []).some(
        (share) => share.role === 'editor',
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

      {/* No wrapper panels: cards nested in bordered trays ate the width on a 390px screen. */}
      <main
        id="main-content"
        // Focusable so a closing dialog can land focus here when its opener is gone (useFocusTrap's fallback).
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

        {!catalogueReady && (
          // Holds the shape of the entries about to appear, so the page fills in rather than assembling in steps.
          <ItemListSkeleton />
        )}

        {catalogueReady && hasCategory && (
          <section
            role="tabpanel"
            id={CATEGORY_TABPANEL_ID}
            // The tab id only resolves while the strip is expanded; the heading id names the panel either way.
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
        )}

        {catalogueReady && !hasCategory && (
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

      <footer
        className={labelClasses(
          'px-4 py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-center',
        )}
      >
        {t('page.footer')}
      </footer>
    </div>
  );
}
