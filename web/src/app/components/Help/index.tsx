'use client';

import Link from 'next/link';

import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';

export default function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  // Spelled out, not built from the id: the i18n parity test only sees literal t('…') keys.
  const topics = [
    {
      id: 'collections',
      title: t('help.collections_title'),
      body: t('help.collections_body'),
    },
    {
      id: 'entries',
      title: t('help.entries_title'),
      body: t('help.entries_body'),
    },
    {
      id: 'search',
      title: t('help.search_title'),
      body: t('help.search_body'),
    },
    {
      id: 'sharing',
      title: t('help.sharing_title'),
      body: t('help.sharing_body'),
    },
    {
      id: 'transfer',
      title: t('help.transfer_title'),
      body: t('help.transfer_body'),
    },
    {
      id: 'undo',
      title: t('help.undo_title'),
      body: t('help.undo_body'),
    },
  ];

  return (
    <CenteredModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('help.title')}
    >
      <div data-testid="help" className="divide-y divide-border">
        {topics.map((topic) => (
          <details
            key={topic.id}
            data-testid={`help-topic-${topic.id}`}
            className="group"
          >
            {/* The WebKit marker needs its own rule; list-none only hides Firefox's. */}
            <summary
              data-testid="help-topic-toggle"
              className="min-h-11 flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-medium"
            >
              {topic.title}
              <span
                aria-hidden="true"
                className="text-xs text-muted-foreground transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <p className="pb-3 text-sm">{topic.body}</p>
          </details>
        ))}
      </div>
      <p className="pt-3 text-sm">
        <Link
          href="/privacy"
          data-testid="help-privacy-link"
          onClick={() => onOpenChange(false)}
          className="underline underline-offset-2 hover:text-accent"
        >
          {t('privacy.link')}
        </Link>
      </p>
    </CenteredModal>
  );
}
