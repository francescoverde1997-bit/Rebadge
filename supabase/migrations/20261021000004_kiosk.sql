-- =====================================================================
-- Fase 3 — Tablet timbratrice
-- =====================================================================

-- Il logo è un'immagine di marchio, pensata per essere mostrata: bucket in sola lettura pubblica,
-- così compare anche sul tablet (che non ha una sessione utente). Il percorso contiene l'id
-- dell'azienda (non indovinabile). Caricare/sostituire/eliminare resta riservato al titolare.
update storage.buckets set public = true where id = 'logos';

-- Il tablet riceve il minimo indispensabile: nessuna informazione su chi è presente
-- (visibile a tutti in sede), solo nomi e se il PIN è impostato.
create or replace function public.kiosk_info(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d devices; c companies;
begin
  d := _device_from_token(p_token);
  select * into c from companies where id = d.company_id;
  return jsonb_build_object(
    'device', jsonb_build_object('name', d.name),
    'company', jsonb_build_object('name', c.name, 'logo_path', c.logo_path, 'timezone', c.timezone),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
               'has_pin', e.pin_set_at is not null)
             order by e.first_name, e.last_name)
        from employees e
       where e.company_id = d.company_id and e.active), '[]'::jsonb));
end;
$$;

-- Nome del tablet obbligatorio e ragionevole
alter table public.devices add constraint devices_name_len check (char_length(btrim(name)) between 1 and 60);
