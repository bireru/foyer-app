-- ============================================================
-- Refonte du suivi de progression : plus de "séance en direct".
-- Le Minuteur devient un simple chronomètre sans sauvegarde.
-- La progression se saisit manuellement : programme → exercice → séries/reps/poids (ou durée si cardio).
-- ============================================================

-- Exercices : possibilité de marquer "cardio" (temps cible au lieu de séries/reps/poids)
alter table program_exercises add column is_cardio boolean not null default false;
alter table program_exercises add column target_duration_seconds int;

-- workout_sets devient autonome : plus besoin de "démarrer une séance" (workout_sessions) pour logger une entrée
alter table workout_sets add column profile_id uuid references profiles(id) on delete cascade;
alter table workout_sets add column household_id uuid references households(id) on delete cascade;
alter table workout_sets add column logged_at timestamptz not null default now();
alter table workout_sets alter column session_id drop not null;

-- Reprend les anciennes séries déjà enregistrées (via l'ancien Minuteur) pour ne rien perdre
update workout_sets ws
set profile_id = s.profile_id,
    household_id = s.household_id,
    logged_at = coalesce(ws.completed_at, s.started_at, now())
from workout_sessions s
where ws.session_id = s.id and ws.profile_id is null;

-- Nouvelle règle d'accès pour les entrées créées directement (sans séance), en plus de l'ancienne
create policy "workout_sets direct household rw" on workout_sets for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());
