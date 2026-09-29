// The client's request limits, mirrored once for every script; change one with the source its comment names.

// data/postgrestLimits.ts POSTGREST_MAX_ROWS.
export const POSTGREST_MAX_ROWS = 1000;
// data/postgrestLimits.ts ID_FILTER_CHUNK_SIZE.
export const ID_FILTER_CHUNK_SIZE = 100;
// lib/pages.ts CHUNK_READ_CONCURRENCY.
export const CHUNK_READ_CONCURRENCY = 6;
// data/images.ts SIGN_URLS_BATCH_SIZE.
export const SIGN_URLS_BATCH_SIZE = 1000;
// data/exportCategory.ts ITEM_PAGE_SIZE.
export const EXPORT_ITEM_PAGE_SIZE = 500;
// data/exportCategory.ts SIGN_BATCH_SIZE.
export const SIGN_BATCH_SIZE = 100;
// data/exportCategory.ts SIGN_CONCURRENCY.
export const SIGN_CONCURRENCY = 6;
// data/exportCategory.ts EXPORT_SIGNED_URL_TTL_SECONDS.
export const EXPORT_SIGNED_URL_TTL_SECONDS = 6 * 3600;
// data/exportPhotos.ts PHOTO_DOWNLOAD_CONCURRENCY.
export const PHOTO_DOWNLOAD_CONCURRENCY = 6;
