// PostgREST caps an unranged request at max_rows (supabase/config.toml) and truncates silently.
export const POSTGREST_MAX_ROWS = 1000;

// Ids per .in() filter; more risks a URL length limit before the row cap.
export const ID_FILTER_CHUNK_SIZE = 100;
