-- Programme l'appel de la Edge Function check-reminders toutes les 15 minutes.
-- ⚠️ Remplace les deux valeurs ci-dessous avant d'exécuter ce script :
--   - VOTRE-PROJECT-REF : visible dans l'URL de ton projet Supabase (https://VOTRE-PROJECT-REF.supabase.co)
--   - VOTRE_ANON_KEY : Project Settings → API → anon public key (la même que dans ton .env.local)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'check-reminders-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://VOTRE-PROJECT-REF.supabase.co/functions/v1/check-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer VOTRE_ANON_KEY', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Pour vérifier que la tâche est bien programmée :
-- select * from cron.job;

-- Pour la supprimer si besoin :
-- select cron.unschedule('check-reminders-15min');
