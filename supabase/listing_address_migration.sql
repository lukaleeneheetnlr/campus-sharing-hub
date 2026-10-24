-- Thai address on listings: one free-text field (address_text) that the form uses,
-- plus parsed parts (house no., moo, tambon, amphoe, province) filled automatically.
-- Run after schema.sql and listing_optional_fields_migration.sql.
-- Only ADDS nullable columns. Listings are public, so these values are visible to everyone
-- who can read listings (owner's choice when filling the form).

begin;

alter table public.listings
  add column if not exists address_text text,
  add column if not exists address_house_no text,
  add column if not exists address_moo text,
  add column if not exists address_subdistrict text,
  add column if not exists address_district text,
  add column if not exists address_province text;

alter table public.listings drop constraint if exists listings_address_lengths_check;
alter table public.listings add constraint listings_address_lengths_check check (
  (address_text is null or char_length(address_text) <= 300)
  and (address_house_no is null or char_length(address_house_no) <= 20)
  and (address_moo is null or char_length(address_moo) <= 10)
  and (address_subdistrict is null or char_length(address_subdistrict) <= 80)
  and (address_district is null or char_length(address_district) <= 80)
  and (address_province is null or char_length(address_province) <= 80)
);

notify pgrst, 'reload schema';
commit;
