-- =====================================================================
-- Malattia: numero di protocollo del certificato INPS (facoltativo)
-- La modifica delle assenze da parte del titolare era già consentita (policy leave_update),
-- con i controlli su sovrapposizioni (leave_no_overlap) e mesi chiusi (leave_closed_guard).
-- =====================================================================
alter table public.leave_requests
  add column inps_protocol text,
  add constraint leave_inps_protocol check (
    inps_protocol is null
    or (type = 'malattia' and inps_protocol ~ '^[A-Za-z0-9/-]{4,30}$')
  );

comment on column public.leave_requests.inps_protocol is
  'Numero di protocollo del certificato medico INPS (solo per la malattia). Nessun dato sanitario: solo il numero.';
