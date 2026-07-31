-- Coordinates for `place`, captured when the user picks a Photon suggestion.
--
-- `place` is a display string, so the map used to re-derive its pins by
-- geocoding every distinct one through a free public API -- coordinates the
-- app already had in hand at entry time and threw away. Storing them here
-- takes that third-party service off the path of opening the map.
--
-- Nullable on purpose: rows written before this, and places typed by hand
-- rather than picked from a suggestion, have no coordinates and keep using
-- the geocode fallback. There is no backfill.
begin;

alter table public.items
  add column if not exists place_lat double precision,
  add column if not exists place_lng double precision;

commit;
