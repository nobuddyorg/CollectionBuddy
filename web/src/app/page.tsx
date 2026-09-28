'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import CategorySelect from './components/CategorySelect';
import {
  CATEGORY_TABPANEL_ID,
  categoryTabId,
} from './components/CategorySelect/Dropdown';
import EmptyState from './components/EmptyState';
import Header from './components/Header';
import HelpDialog from './components/Help';
import { useHelp } from './components/Help/useHelp';
import ItemList from './components/ItemList';
import { ItemListSkeleton } from './components/ItemList/Skeleton';
import LoadError from './components/LoadError';
import LoadingOverlay from './components/LoadingOverlay';
import { labelClasses } from './components/ui/labelClasses';
import { catalogueViewFor } from './catalogueView';
import { canEditCategory } from './data/categories';
import { useI18n } from './i18n/useI18n';
import { useCatalogue } from './useCatalogue';
import { useDeleteAccount } from './useDeleteAccount';
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
  const {
    categories,
    selectedCategoryId,
    selectCategory,
    catalogueReady,
    retryLoad,
  } = useCatalogue(loading, userId);
  const signOut = useSignOut();
  const accountDeletion = useDeleteAccount(userId ?? '');
  const help = useHelp();

  if (loading)
    return <LoadingOverlay label={t('common.loading')} theme="auto" />;
  if (!user) return null;

  const view = catalogueViewFor({
    ready: catalogueReady,
    hasCategory: !!selectedCategoryId,
    loadFailed: categories.loadFailed,
  });
  const headerUser = { ...user, email: user.email ?? '' };

  const selectedCategory =
    categories.categories.find(
      (category) => category.id === selectedCategoryId,
    ) ?? null;
  const canEditSelected =
    !!selectedCategory && canEditCategory(selectedCategory, user.id);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-overlay focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('page.skip_to_content')}
      </a>

      <Header
        user={headerUser}
        onSignOut={signOut}
        onDeleteAccount={accountDeletion.deleteAccount}
        onOpenHelp={help.show}
      />
      <HelpDialog open={help.open} onOpenChange={help.setOpen} />
      {accountDeletion.deleting && (
        <LoadingOverlay label={t('account.deleting')} />
      )}

      <main
        id="main-content"
        // Focusable so a closing dialog can land focus here when its opener is gone (useFocusTrap's fallback).
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-5 sm:py-8 space-y-5 sm:space-y-7"
      >
        <CategorySelect
          selectedCategoryId={selectedCategoryId}
          onSelect={selectCategory}
          categories={categories}
          userId={userId ?? null}
          ready={catalogueReady}
        />

        {view === 'skeleton' && <ItemListSkeleton />}

        {view === 'entries' && (
          <section
            role="tabpanel"
            id={CATEGORY_TABPANEL_ID}
            // The tab id only resolves while the strip is expanded; the heading id names the panel either way.
            aria-labelledby={`entries-heading ${categoryTabId(selectedCategoryId!)}`}
            className="relative z-50 space-y-4"
          >
            <h2 id="entries-heading" className="sr-only">
              {t('page.entries')}
            </h2>
            <ItemList
              key={selectedCategoryId}
              categoryId={selectedCategoryId!}
              canEdit={canEditSelected}
            />
          </section>
        )}

        {view === 'loadError' && (
          <LoadError
            testId="catalogue-load-error"
            title={t('page.load_error_title')}
            busy={categories.isLoading}
            onRetry={() => void retryLoad()}
          />
        )}

        {view === 'empty' && (
          // Only reachable for a collection with no categories at all.
          <EmptyState
            symbol="🧺"
            title={t('page.no_categories')}
            hint={t('page.name_first_category')}
          >
            <button
              type="button"
              data-testid="empty-open-help"
              onClick={help.show}
              className="min-h-11 px-3 font-label text-xs text-foreground underline underline-offset-4"
            >
              {t('page.open_help')}
            </button>
          </EmptyState>
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
