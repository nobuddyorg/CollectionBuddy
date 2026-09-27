'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { labelClasses } from '../components/ui/labelClasses';
import { useI18n } from '../i18n/useI18n';

const CONTACT_EMAIL = 'info@nobuddy.org';

const linkClasses = 'underline underline-offset-2 hover:text-accent';

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl pt-4">{heading}</h2>
      {children}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2">{children}</ul>;
}

function Item({ label, text }: { label: string; text: string }) {
  return (
    <li>
      <strong>{label}</strong> {text}
    </li>
  );
}

// Opens without a session, so a sign-up flow can link it; must change whenever data handling does.
export default function PrivacyPage() {
  const { t } = useI18n();
  const title = t('privacy.title');

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · CollectionBuddy`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main
      id="main-content"
      className="mx-auto max-w-3xl px-4 py-8 sm:py-12 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] min-h-[100dvh] bg-background text-foreground text-sm sm:text-base leading-relaxed space-y-4"
    >
      <Link href="/" data-testid="privacy-back" className={linkClasses}>
        {t('privacy.back')}
      </Link>
      <h1 data-testid="privacy-title" className="font-display text-3xl pt-2">
        {title}
      </h1>
      <p className={labelClasses()}>{t('privacy.updated')}</p>
      <p>{t('privacy.intro')}</p>

      <Section heading={t('privacy.controller_heading')}>
        <p>{t('privacy.controller_text')}</p>
        {/* Not translated: a name and an address. */}
        <address data-testid="privacy-controller" className="not-italic">
          Matthias Eggert
          <br />
          <a
            data-testid="privacy-contact"
            href={`mailto:${CONTACT_EMAIL}`}
            className={linkClasses}
          >
            {CONTACT_EMAIL}
          </a>
        </address>
      </Section>

      <Section heading={t('privacy.data_heading')}>
        <List>
          <Item
            label={t('privacy.data_account_label')}
            text={t('privacy.data_account')}
          />
          <Item
            label={t('privacy.data_sign_ins_label')}
            text={t('privacy.data_sign_ins')}
          />
          <Item
            label={t('privacy.data_collections_label')}
            text={t('privacy.data_collections')}
          />
          <Item
            label={t('privacy.data_photos_label')}
            text={t('privacy.data_photos')}
          />
          <Item
            label={t('privacy.data_sharing_label')}
            text={t('privacy.data_sharing')}
          />
          <Item
            label={t('privacy.data_location_label')}
            text={t('privacy.data_location')}
          />
          <Item
            label={t('privacy.data_technical_label')}
            text={t('privacy.data_technical')}
          />
        </List>
      </Section>

      <Section heading={t('privacy.purpose_heading')}>
        <List>
          <li>{t('privacy.purpose_service')}</li>
          <li>{t('privacy.purpose_sharing')}</li>
          <li>{t('privacy.purpose_security')}</li>
        </List>
        <p>{t('privacy.purpose_required')}</p>
        <p>{t('privacy.purpose_none')}</p>
      </Section>

      <Section heading={t('privacy.recipients_heading')}>
        <List>
          <Item
            label={t('privacy.recipients_supabase_label')}
            text={t('privacy.recipients_supabase')}
          />
          <Item
            label={t('privacy.recipients_google_label')}
            text={t('privacy.recipients_google')}
          />
          <Item
            label={t('privacy.recipients_github_label')}
            text={t('privacy.recipients_github')}
          />
          <Item
            label={t('privacy.recipients_photon_label')}
            text={t('privacy.recipients_photon')}
          />
          <Item
            label={t('privacy.recipients_osm_label')}
            text={t('privacy.recipients_osm')}
          />
          <Item
            label={t('privacy.recipients_people_label')}
            text={t('privacy.recipients_people')}
          />
        </List>
        <p>{t('privacy.recipients_transfer')}</p>
      </Section>

      <Section heading={t('privacy.retention_heading')}>
        <List>
          <li>{t('privacy.retention_until_deleted')}</li>
          <li>{t('privacy.retention_orphans')}</li>
          <li>{t('privacy.retention_account')}</li>
          <li>{t('privacy.retention_sharing')}</li>
          <li>{t('privacy.retention_logs')}</li>
        </List>
      </Section>

      <Section heading={t('privacy.browser_heading')}>
        <p>{t('privacy.browser_storage')}</p>
        <p>{t('privacy.browser_cache')}</p>
        <p>{t('privacy.browser_no_cookies')}</p>
      </Section>

      <Section heading={t('privacy.rights_heading')}>
        <p>{t('privacy.rights_in_app')}</p>
        <p>{t('privacy.rights_list')}</p>
        <p>{t('privacy.rights_complaint')}</p>
      </Section>
    </main>
  );
}
