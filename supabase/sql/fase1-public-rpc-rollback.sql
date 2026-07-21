-- Rollback Fase 1 — rimuove le RPC pubbliche token-based.
-- Sicuro: le pagine pubbliche devono essere state riportate all'accesso
-- diretto (versione precedente di docs/*.html) PRIMA di eseguire questo.
drop function if exists public.respond_quote(text, text);
drop function if exists public.get_quote(text);
drop function if exists public.get_repair_status(text);
