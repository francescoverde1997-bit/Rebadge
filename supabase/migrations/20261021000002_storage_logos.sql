-- =====================================================================
-- Storage: logo aziendale. Bucket privato, un file per azienda in "<company_id>/...".
-- Solo il titolare carica/sostituisce/elimina; i membri dell'azienda leggono.
-- I dipendenti non possono caricare nulla.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy logos_read on storage.objects for select to authenticated
  using (bucket_id = 'logos'
         and public.is_company_member(((storage.foldername(name))[1])::uuid));

create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos'
              and public.is_company_owner(((storage.foldername(name))[1])::uuid));

create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos'
         and public.is_company_owner(((storage.foldername(name))[1])::uuid));

create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos'
         and public.is_company_owner(((storage.foldername(name))[1])::uuid));
