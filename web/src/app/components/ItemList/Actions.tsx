'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton, iconButtonClasses } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

// Warms the edit modal's lazy ItemForm chunk before the click that opens it.
const prefetchItemForm = () => {
  void import('../ItemForm').catch(() => {});
};

function UploadInput({
  onUpload,
  busy,
  label,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  label?: string;
}) {
  return (
    <input
      type="file"
      accept="image/*"
      data-testid="upload-photo"
      className="peer sr-only"
      aria-label={label}
      disabled={busy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onUpload(file);
      }}
    />
  );
}

// Holds the same 4:3 frame a photo would, so unphotographed entries fit the grid's repeating shape.
export function AddPhotoPlate({
  onUpload,
  busy,
  readOnly = false,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
  /** Read-only renders a `div`, not the interactive `label`, so it doesn't read as clickable. */
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const Frame = readOnly ? 'div' : 'label';
  let interactionClasses = '';
  if (!readOnly) {
    interactionClasses = 'cursor-pointer hover:bg-mount-hover';
    if (busy) interactionClasses += ' pointer-events-none opacity-60';
  }
  return (
    <Frame
      className={`group/plate relative flex aspect-4/3 w-full items-center justify-center bg-mount transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${interactionClasses}`}
      title={readOnly ? undefined : t('item_list.add_image')}
    >
      {!readOnly && <UploadInput onUpload={onUpload} busy={busy} />}

      {/* border-foreground/60: any less falls under the 3:1 WCAG floor against `--mount`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-sm border border-dashed border-foreground/60"
      />

      {/* text-foreground/80: text-muted-foreground falls under the 4.5:1 AA floor on `--mount` in light mode. */}
      <span className="relative flex flex-col items-center gap-2.5 text-foreground/80 transition-colors group-hover/plate:text-foreground">
        {busy && !readOnly ? (
          <span role="status" aria-label={t('common.loading')}>
            <Spinner size="xl" />
          </span>
        ) : (
          <Icon icon={IconType.Photo} className="w-8 h-8" aria-hidden="true" />
        )}

        <span className="font-label text-[0.6875rem]">
          {t('item_list.no_images')}
        </span>

        {!readOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-card px-2.5 py-1.5 font-label text-[0.6875rem] text-foreground ring-1 ring-border">
            <Icon
              icon={IconType.Plus}
              className="w-3.5 h-3.5"
              aria-hidden="true"
            />
            {t('item_list.add_image')}
          </span>
        )}
      </span>
    </Frame>
  );
}

// Icon-only: spelled-out German labels overflowed the card by up to 45px; each has a title/aria-label.
export function Actions({
  onEdit,
  onDelete,
  onUpload,
  busy,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
      {/* A file input needs a label, not a button, so it borrows the icon button's own classes. */}
      <label
        className={`${iconButtonClasses({ variant: 'outline' })} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground cursor-pointer ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
        title={t('item_list.add_image')}
      >
        <UploadInput
          onUpload={onUpload}
          busy={busy}
          label={t('item_list.add_image')}
        />
        {busy ? (
          <span role="status" aria-label={t('common.loading')}>
            <Spinner size="sm" />
          </span>
        ) : (
          <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
        )}
      </label>

      <IconButton
        variant="outline"
        data-testid="edit-entry"
        onClick={onEdit}
        onPointerEnter={prefetchItemForm}
        onPointerDown={prefetchItemForm}
        onFocus={prefetchItemForm}
        aria-label={t('item_list.edit')}
        title={t('item_list.edit')}
      >
        <Icon icon={IconType.Edit} className="w-4 h-4" aria-hidden="true" />
      </IconButton>

      <IconButton
        variant="outlineDestructive"
        data-testid="delete-entry"
        onClick={onDelete}
        aria-label={t('item_list.delete_entry')}
        title={t('item_list.delete_entry')}
        className="ml-auto"
      >
        <Icon icon={IconType.Trash} className="w-4 h-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
