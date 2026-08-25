# Foyer

Appli de gestion de foyer partagée (Billel & Cérine). PWA — installable sur PC, Android et iPhone.
Premier volet livré : **Sport & Bien-être** (poids, signes vitaux, programmes modifiables, minuteur de séance).
Les autres volets (Budget, Sorties, Événements, Voyages, Tâches, Administratif, Inventaire, Véhicule, Souvenirs)
ont déjà leur table en base et leur entrée de menu ("à construire") — l'architecture est prête à les recevoir.

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → New Project (gratuit).
2. Une fois créé, ouvre **SQL Editor** et colle tout le contenu de `supabase/migrations/0001_init.sql`, puis exécute.
3. Va dans **Project Settings → API** : récupère 
`Project URL = https://xykpoddjpvkyeexckgwn.supabase.co` et 
`anon public key = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5a3BvZGRqcHZreWVleGNrZ3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzgzMDIsImV4cCI6MjEwMzIxNDMwMn0.U2d0PY0fEDs2hCnVYrjedwTQOhl4b53sfUevnbSWfVg `.

## 2. Créer vos deux comptes et profils

1. Dans Supabase, **Authentication → Users → Add user** : crée un compte pour toi et un pour Cérine (email + mot de passe, ou laisse-les se connecter par lien magique la première fois via l'appli).
2. Dans **SQL Editor**, crée le foyer et les deux profils (remplace les UUID par ceux des users créés à l'étape 1, visibles dans Authentication → Users) :

```sql
insert into households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Notre foyer');

insert into profiles (id, household_id, display_name, color_tag) values
  ('85bfc10d-f045-463c-9851-a458b94ad01d', '11111111-1111-1111-1111-111111111111', 'Billel', 'billel'),
  ('ced02beb-fd3b-49af-a6bb-83c8c21f71d6', '11111111-1111-1111-1111-111111111111', 'Cerine', 'cerine');
```

## 3. Configurer l'appli

```bash
cp .env.example .env.local
# remplis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ouvre `http://localhost:5173`. Connexion par lien magique (email).

## 4. Tester sur téléphone (PWA)

- `npm run dev` affiche une URL réseau local (ex `http://192.168.1.x:5173`) — ouvre-la sur ton téléphone connecté au même Wi-Fi, puis "Ajouter à l'écran d'accueil".
- Pour une vraie installation stable (hors réseau local), déploie sur **Vercel** ou **Netlify** (gratuit) : connecte le repo GitHub, ajoute les mêmes variables d'environnement, déploie. Le service worker (mise en cache offline) ne s'active qu'en HTTPS/production, pas en `npm run dev`.

## Limite connue : Apple Santé / Samsung Health

Une PWA ne peut pas accéder à HealthKit (iOS) ni à Health Connect (Android) — ce sont des APIs réservées aux apps natives.
Pour l'instant la saisie est manuelle. Si on veut la vraie intégration montre connectée plus tard, on empaquettera cette
même appli avec **Capacitor** pour publier une version native iOS/Android avec les plugins santé — sans réécrire le code.

## Structure

```
src/
  pages/sport/     — Poids & signes vitaux, Programmes, Minuteur
  components/      — Layout (nav "plan du foyer")
  hooks/useAuth    — session + profil + membres du foyer (mode partagé)
  lib/supabase.ts  — client Supabase
  types/database.ts — types générés à la main depuis le schéma SQL
supabase/migrations/0001_init.sql — schéma complet (sport + stubs des autres volets)
```
