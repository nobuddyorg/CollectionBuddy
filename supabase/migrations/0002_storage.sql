insert into storage.buckets (id, name, public) values ('item-images','item-images',false)
on conflict (id) do nothing;

create policy "list own"
on storage.objects for select
using (bucket_id = 'item-images' and (auth.uid()::text || '/') = left(name, 37));

create policy "upload own"
on storage.objects for insert
with check (bucket_id = 'item-images' and (auth.uid()::text || '/') = left(name, 37));

create policy "update own"
on storage.objects for update
using (bucket_id = 'item-images' and (auth.uid()::text || '/') = left(name, 37));

create policy "delete own"
on storage.objects for delete
using (bucket_id = 'item-images' and (auth.uid()::text || '/') = left(name, 37));
