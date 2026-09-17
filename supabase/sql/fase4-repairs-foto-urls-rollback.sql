drop policy if exists repair_photos_delete on storage.objects;
-- la colonna foto_urls resta (dati): rimuoverla solo se davvero necessario:
-- alter table public.repairs drop column if exists foto_urls;
