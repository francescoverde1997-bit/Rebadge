#!/usr/bin/env bash
# Avvia finto Supabase + app compilata e lancia i test end-to-end.
set -uo pipefail
cd "$(dirname "$0")/../.."
LOGS="${TMPDIR:-/tmp}/rebadge-e2e"; mkdir -p "$LOGS"

# Porte libere: un finto Supabase o un'app rimasti accesi da una prova precedente falserebbero i risultati.
# Non si chiude nulla da soli: si avvisa e ci si ferma.
for port in 3100 54400 54500 54600; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "La porta $port è già occupata (un server di prova rimasto acceso?). Chiudilo e rilancia: lsof -nP -iTCP:$port -sTCP:LISTEN"
    exit 1
  fi
done

# timeout di GNU (Linux) oppure, su macOS, lo stesso limite con perl
if command -v timeout >/dev/null 2>&1; then limit() { timeout "$@"; }; else limit() { perl -e 'alarm shift; exec @ARGV' "$@"; }; fi
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54400
export NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon-key
export SUPABASE_SERVICE_ROLE_KEY=fake-service-role
export NEXT_PUBLIC_SITE_URL=http://localhost:3100
export STRIPE_SECRET_KEY=sk_test_fake STRIPE_WEBHOOK_SECRET=whsec_fake STRIPE_API_BASE=http://localhost:54500
export STRIPE_PRICE_BASE=price_base STRIPE_PRICE_PLUS=price_plus
export APP_WEBHOOK_URL=http://localhost:3100/api/stripe/webhook
# promemoria serale: finto servizio email e orologio simulabile solo nei test
export RESEND_API_KEY=re_fake RESEND_API_BASE=http://localhost:54600 EMAIL_FROM="ReBadge <promemoria@rebadge.test>"
export CRON_SECRET=cron_fake REMINDER_ALLOW_TEST_TIME=1
echo "→ build"
npx next build > "$LOGS/build.log" 2>&1 || { tail -30 "$LOGS/build.log"; exit 1; }
node scripts/e2e/fake-supabase.mjs > "$LOGS/fake.log" 2>&1 &
FAKE=$!
node scripts/e2e/fake-stripe.mjs > "$LOGS/stripe.log" 2>&1 &
STRIPE=$!
node scripts/e2e/fake-email.mjs > "$LOGS/email.log" 2>&1 &
EMAIL=$!
npx next start -p 3100 > "$LOGS/app.log" 2>&1 &
APP=$!
cleanup() { kill "$FAKE" "$STRIPE" "$EMAIL" "$APP" 2>/dev/null; pkill -f "[n]ext-server" 2>/dev/null; true; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  curl -s -o /dev/null --max-time 2 http://localhost:3100/accedi && break
  sleep 1
done
echo "→ test"
status=0
for f in scripts/e2e/phase*.mjs; do
  echo "→ $f"
  limit 300 node "$f" || status=1
done
exit $status
