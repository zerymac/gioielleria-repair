-- Rollback Fase 2 — ripristina l'accesso completo con la chiave anon.
-- Da usare se, dopo il lockdown, l'app o un job restano bloccati.
-- Riporta esattamente le policy originali (backup/backup.js).

drop policy if exists authenticated_all on public.customers;
drop policy if exists authenticated_all on public.repairs;
drop policy if exists authenticated_all on public.ddts;
drop policy if exists authenticated_all on public.repairers;
drop policy if exists authenticated_all on public.orders;
drop policy if exists authenticated_all on public.quote_tokens;

-- Ripristina i privilegi SQL di base per anon (equivalenti ai default Supabase).
grant select, insert, update, delete on public.customers    to anon;
grant select, insert, update, delete on public.repairs      to anon;
grant select, insert, update, delete on public.ddts         to anon;
grant select, insert, update, delete on public.repairers    to anon;
grant select, insert, update, delete on public.orders       to anon;
grant select, insert, update, delete on public.quote_tokens to anon;

create policy anon_all on public.customers    for all to anon using (true) with check (true);
create policy anon_all on public.repairs      for all to anon using (true) with check (true);
create policy anon_all on public.ddts         for all to anon using (true) with check (true);
create policy anon_all on public.repairers    for all to anon using (true) with check (true);
create policy anon_all on public.orders       for all to anon using (true) with check (true);
create policy anon_all on public.quote_tokens for all to anon using (true) with check (true);
