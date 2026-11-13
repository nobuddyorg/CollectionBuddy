'use client';

import { useI18n } from '../../i18n/useI18n';
import { prefetchOnIntent } from '../../lib/prefetchOnIntent';
import { useCameraCapture } from '../../lib/useCameraCapture';
import Icon, { IconType } from '../Icon';
import { IconButton, iconButtonClasses } from '../ui/IconButton';
import { StatusSpinner } from '../ui/Spinner';
import { prefetchItemForm } from '../ItemForm/load';

function UploadInput({
  onUpload,
  busy,
  label,
  camera = false,
}: {
  onUpload: (files: File[]) => void;
  busy: boolean;
  label?: string;
  /** Opens the camera where there is one; one shot at a time, unlike the file picker. */
  camera?: boolean;
}) {
  return (
    <input
      type="file"
      accept="image/*"
      capture={camera ? 'environment' : undefined}
      multiple={!camera}
      data-testid={camera ? 'take-photo' : 'upload-photo'}
      className="peer sr-only"
      aria-label={label}
      disabled={busy}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        // Emptied, or picking the same file again after a failed upload fires no change at all.
        event.target.value = '';
        if (files.length > 0) onUpload(files);
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
  onUpload: (files: File[]) => void;
  busy: boolean;
  /** Read-only renders a `div`, not the interactive `label`, so it doesn't read as clickable. */
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const hasCamera = useCameraCapture();
  const Frame = readOnly ? 'div' : 'label';
  let interactionClasses = '';
  if (!readOnly) {
    interactionClasses = 'cursor-pointer hover:bg-mount-hover';
    if (busy) interactionClasses += ' pointer-events-none opacity-60';
  }
  const filesLabel = hasCamera
    ? t('item_list.choose_files')
    : t('item_list.add_image');
  const plate = (
    <Frame
      className={`group/plate relative flex aspect-4/3 w-full items-center justify-center bg-mount transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${interactionClasses}`}
      title={readOnly ? undefined : filesLabel}
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
          <StatusSpinner size="xl" label={t('common.loading')} />
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
            {filesLabel}
          </span>
        )}
      </span>
    </Frame>
  );
  if (readOnly || !hasCamera) return plate;
  return (
    <div className="relative">
      {plate}
      {/* A sibling of the file label, not inside it: a label holds one control. */}
      <label
        className={`absolute inset-x-0 bottom-4 mx-auto inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm bg-card px-2.5 py-1.5 font-label text-[0.6875rem] text-foreground ring-1 ring-border has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-foreground ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <UploadInput camera onUpload={onUpload} busy={busy} />
        <Icon
          icon={IconType.Camera}
          className="w-3.5 h-3.5"
          aria-hidden="true"
        />
        {t('item_list.take_photo')}
      </label>
    </div>
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
  onUpload: (files: File[]) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const hasCamera = useCameraCapture();
  const filesLabel = hasCamera
    ? t('item_list.choose_files')
    : t('item_list.add_image');

  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
      {/* A file input needs a label, not a button, so it borrows the icon button's own classes. */}
      <label
        className={`${iconButtonClasses({ variant: 'outline' })} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground cursor-pointer ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
        title={filesLabel}
      >
        <UploadInput onUpload={onUpload} busy={busy} label={filesLabel} />
        {busy ? (
          <StatusSpinner size="sm" label={t('common.loading')} />
        ) : (
          <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
        )}
      </label>

      {hasCamera && (
        <label
          className={`${iconButtonClasses({ variant: 'outline' })} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground cursor-pointer ${
            busy ? 'pointer-events-none opacity-60' : ''
          }`}
          title={t('item_list.take_photo')}
        >
          <UploadInput
            camera
            onUpload={onUpload}
            busy={busy}
            label={t('item_list.take_photo')}
          />
          <Icon icon={IconType.Camera} className="w-4 h-4" aria-hidden="true" />
        </label>
      )}

      <IconButton
        variant="outline"
        data-testid="edit-entry"
        onClick={onEdit}
        {...prefetchOnIntent(prefetchItemForm)}
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
