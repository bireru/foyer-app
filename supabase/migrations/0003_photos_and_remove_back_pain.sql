-- Supprime le suivi de la douleur au dos (trop difficile à mesurer de façon fiable)
alter table vital_signs drop column if exists back_pain_level;

-- ============================================================
-- Photos de progression
-- ============================================================

create table progress_photos (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz not null default now()
);

alter table progress_photos enable row level security;

create policy "household rw" on progress_photos for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- ---------- Stockage : bucket privé ----------
-- "public = false" : aucune photo n'est accessible par une URL publique.
-- L'appli génère des liens signés, valables 1h, uniquement pour les membres du foyer.

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Convention de chemin : {household_id}/{profile_id}/{fichier}
-- Les policies vérifient que le premier dossier du chemin correspond au foyer de l'utilisateur connecté.

create policy "household can view progress photos"
on storage.objects for select
using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select household_id::text from profiles where id = auth.uid())
);

create policy "household can upload progress photos"
on storage.objects for insert
with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select household_id::text from profiles where id = auth.uid())
);

create policy "household can delete progress photos"
on storage.objects for delete
using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select household_id::text from profiles where id = auth.uid())
);
