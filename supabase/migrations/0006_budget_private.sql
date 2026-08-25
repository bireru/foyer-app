-- ============================================================
-- Le volet Budget est PRIVÉ, contrairement au reste de l'appli.
-- Chacun voit uniquement ses propres dépenses — pas celles de son/sa partenaire.
-- ============================================================

-- Jusqu'ici budget_transactions suivait le même mode "foyer partagé" que les autres tables.
-- On retire cette policy pour la remplacer par une policy strictement personnelle.
drop policy if exists "household rw" on budget_transactions;

-- Les transactions doivent être rattachées à une personne précise (plus de ligne "commune")
alter table budget_transactions alter column profile_id set not null;

create policy "owner only" on budget_transactions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
