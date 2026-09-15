-- Fase 3: fix upload foto riparazioni (bucket repair-photos).
-- L'app carica la foto con upsert (INSERT ... ON CONFLICT DO UPDATE RETURNING *):
-- Postgres richiede anche una policy SELECT per il ruolo, altrimenti l'upload
-- fallisce con 42501 "new row violates row-level security policy for table objects"
-- (storage risponde 400 e la foto non viene mai salvata: bucket vuoto, foto_url NULL).
-- Verificato a DB il 15/09/2026. Idempotente.
drop policy if exists repair_photos_select on storage.objects;
create policy repair_photos_select on storage.objects for select to authenticated using (bucket_id = 'repair-photos');
