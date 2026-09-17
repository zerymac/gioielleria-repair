-- Fase 4 (17/09/2026): più foto per riparazione + eliminazione dallo storage.
-- Applicata a DB come migration repairs_foto_urls_and_photo_delete. Idempotente.
alter table public.repairs add column if not exists foto_urls jsonb not null default '[]'::jsonb;
update public.repairs set foto_urls = jsonb_build_array(foto_url) where foto_url is not null and foto_urls = '[]'::jsonb;
drop policy if exists repair_photos_delete on storage.objects;
create policy repair_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'repair-photos');
