# Testi email in italiano (Supabase → Authentication → Email Templates)

I link usano `token_hash` e la rotta `/auth/confirm`: funzionano anche se l'email si apre su un altro dispositivo.
Sostituisci interamente i template predefiniti. Il logo viene da `public/brand/rebadge-logo.png` (rigenerabile con `npm run brand:icons`).

## Confirm signup
**Oggetto:** Conferma il tuo account ReBadge

```html
<p><img src="{{ .SiteURL }}/brand/rebadge-logo.png" alt="ReBadge" width="220" style="display:block;border:0"></p>
<h2 style="color:#1b2b44;font-family:Helvetica,Arial,sans-serif">Benvenuto in ReBadge</h2>
<p style="color:#1b2b44;font-family:Helvetica,Arial,sans-serif">Per attivare l'account della tua azienda, conferma il tuo indirizzo email:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app"
      style="display:inline-block;background:#24508a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold">Conferma email</a></p>
<p style="color:#4a5a70;font-family:Helvetica,Arial,sans-serif">Se non hai creato tu questo account, ignora questa email.</p>
<p style="color:#4a5a70;font-family:Helvetica,Arial,sans-serif;font-size:13px">ReBadge · Timbra. Controlla. Invia.</p>
```

## Reset password
**Oggetto:** Scegli una nuova password per ReBadge

```html
<p><img src="{{ .SiteURL }}/brand/rebadge-logo.png" alt="ReBadge" width="220" style="display:block;border:0"></p>
<h2 style="color:#1b2b44;font-family:Helvetica,Arial,sans-serif">Recupero password</h2>
<p style="color:#1b2b44;font-family:Helvetica,Arial,sans-serif">Hai chiesto di scegliere una nuova password. Apri il link entro un'ora:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reimposta-password"
      style="display:inline-block;background:#24508a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold">Scegli una nuova password</a></p>
<p style="color:#4a5a70;font-family:Helvetica,Arial,sans-serif">Se non sei stato tu, ignora questa email: la password attuale resta valida.</p>
<p style="color:#4a5a70;font-family:Helvetica,Arial,sans-serif;font-size:13px">ReBadge · Timbra. Controlla. Invia.</p>
```
