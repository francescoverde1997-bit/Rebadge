-- =====================================================================
-- Promemoria serale al titolare (decisione 74)
-- =====================================================================
-- Ogni sera, all'orario scelto, il titolare riceve un'email SOLO se qualcuno risulta ancora al lavoro
-- o se ci sono uscite mancanti non sistemate. L'invio lo fa il server con la chiave di servizio.

-- Impostazioni dell'azienda: attivo (sì di base) e orario, dalle 18:00 alle 23:30 a passi di 30 minuti
alter table public.company_settings
  add column reminder_enabled boolean not null default true,
  add column reminder_minutes int not null default 1200
    check (reminder_minutes between 1080 and 1410 and reminder_minutes % 30 = 0);

-- Registro degli invii: al massimo un promemoria per azienda per giorno (data locale dell'azienda).
-- Solo il server lo usa: nessun accesso dal browser.
create table public.reminder_log (
  company_id uuid not null references public.companies(id) on delete cascade,
  local_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (company_id, local_date)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
