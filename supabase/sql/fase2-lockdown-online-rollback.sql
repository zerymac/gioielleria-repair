-- Rollback di fase2-lockdown-online.sql: ripristina l'accesso anon com'era
-- (policy TO public USING(true) con i nomi originali + policy storage anon).
-- Le policy authenticated_all restano: sono innocue.
grant select, insert, update, delete on public.customers, public.repairs, public.ddts,
  public.repairers, public.orders, public.quote_tokens to anon;
create policy "accesso completo" on public.customers    for all to public using (true) with check (true);
create policy "accesso completo" on public.repairs      for all to public using (true) with check (true);
create policy "accesso completo" on public.ddts         for all to public using (true) with check (true);
create policy "accesso completo" on public.repairers    for all to public using (true) with check (true);
create policy "Allow all"        on public.orders       for all to public using (true) with check (true);
create policy "public access"    on public.quote_tokens for all to public using (true) with check (true);
create policy "Allow anon insert" on storage.objects for insert to anon with check (bucket_id = 'repair-photos');
create policy "Allow anon update" on storage.objects for update to anon using (bucket_id = 'repair-photos');
