# Cahier des charges — Foyer

Application de gestion de foyer partagée pour Billel & Cérine. PWA installable (PC, Android, iPhone).

**Dernière mise à jour :** fonctionnalité "budget auto-alimenté par les courses cochées" + catégories de recettes modifiables.

---

## 1. Architecture technique

- **Frontend** : React + Vite + TypeScript + Tailwind CSS, PWA (`vite-plugin-pwa`, installable, cache offline partiel)
- **Backend** : Supabase (Postgres + Auth + Storage + Edge Functions), aucun serveur à maintenir soi-même
- **Auth** : email + mot de passe (pas de lien magique)
- **Hébergement** : Vercel (déploiement automatique à chaque `git push` sur `main`), gratuit
- **Design** : palette chaleureuse (crème/terracotta/prune), polices Fredoka (titres) et Nunito Sans (texte), coins arrondis, ombres douces. Chaque personne a une couleur d'accent (Billel = terracotta, Cérine = prune)
- **Performance** : chaque volet est chargé à la demande (`React.lazy`) plutôt que tout au démarrage
- **Sécurité des données** : Row Level Security (RLS) sur toutes les tables — les règles d'accès sont appliquées par la base de données elle-même, pas seulement par le code de l'appli

### Mode partagé vs privé

- **Sport & Bien-être, Nourriture** : entièrement partagés — Billel et Cérine voient toutes les données l'un de l'autre
- **Budget → Mes dépenses, Budget → Épargne** : strictement **privés** — chacun ne voit que les siennes, y compris au niveau base de données
- **Budget → Commun, Budget → Courses** : partagés

---

## 2. Volet Sport & Bien-être

### Poids & signes vitaux
- Saisie du poids et du sommeil, historique par personne
- Objectif de poids personnalisable, affiché en grand avec le poids actuel et l'écart restant
- Taille renseignable → calcul automatique de l'IMC avec catégorie (insuffisance pondérale / normal / surpoids / obésité)
- Graphique d'évolution du poids superposant les deux courbes, avec ligne d'objectif
- Photos de progression : prise directe depuis l'appareil photo, compressées automatiquement avant envoi, stockées dans un bucket **privé** (liens signés temporaires, jamais d'URL publique), limitées à 2 par mois et par personne (1er–15 et 16–fin de mois)
- Signes vitaux supprimables ligne par ligne

### Programmes
- Un ou plusieurs programmes d'exercices par personne
- Chacun modifie uniquement son propre programme (lecture seule sur celui du/de la partenaire)
- Programmes et exercices : ajoutables, renommables, supprimables
- Par exercice : séries, répétitions, poids cible, temps de repos — modifiables individuellement

### Minuteur
- Démarre une séance à partir d'un programme
- Suivi en temps réel : chrono de séance, décompte de repos entre les séries
- Support du cardio : exercices à "0 série" traités comme une action unique chronométrée, sans compteur de séries
- Chaque série validée est enregistrée (répétitions, poids, durée réelle) et reste visible/supprimable pendant la séance
- Système basé sur des horodatages (pas de compteurs fragiles) pour éviter les blocages

### Calendrier
- Vue mensuelle, un point coloré par personne sur les jours avec séance
- Clique sur un jour → résumé par exercice (nombre de séries, répétitions totales, temps total, poids moyen), horodaté

### Progression
- Sélection d'un exercice → record personnel (poids max, reps, date) par personne
- Graphique d'évolution du poids soulevé dans le temps, courbes superposées

---

## 3. Volet Nourriture

### Plan de repas
- Grille hebdomadaire (petit-déj / déjeuner / dîner / collation), navigation semaine par semaine
- Chaque créneau : choix d'une recette existante ou texte libre

### Recettes
- Bibliothèque de recettes avec ingrédients (nom + quantité), calories, protéines
- **Catégories personnalisables** : ajoutables, renommables, supprimables (ex: léger, riche en protéines, batch cooking, rapide, végé)
- Filtre par catégorie
- Une recette peut avoir plusieurs catégories

### Objectifs
- Objectif calories/protéines par jour et par personne, affiché en grand
- Journal alimentaire du jour : saisie libre ou sélection depuis une recette existante (calories/protéines pré-remplies)
- Total du jour calculé automatiquement, comparé à l'objectif

---

## 4. Volet Budget

### Mes dépenses (privé)
- Transactions avec libellé, montant, catégorie, date — navigation mois par mois
- Catégories personnalisables (ajout/renommage/suppression), les transactions liées passent en "Sans catégorie" si leur catégorie est supprimée
- Salaire mensuel : montant + jour de réception, modifiable par mois
- Reste à vivre calculé en temps réel
- Camembert de répartition des dépenses par rapport au salaire (avec part "non dépensé"), pourcentages affichés

### Épargne (privé)
- Comptes/supports d'épargne (Livret, Assurance vie, Actions, Crypto, etc.)
- Mise à jour manuelle de la valeur de chaque compte, historique conservé
- Patrimoine total et courbe d'évolution dans le temps (façon Finary simplifié)

### Commun (Tricount)
- Dépenses communes avec qui a payé
- Calcul automatique de la balance ("X doit Y € à Z"), basé sur un partage 50/50

### Courses (partagé)
- Listes de courses : créables, renommables, supprimables (nom par défaut = lundi de la semaine en cours)
- Génération automatique d'une liste à partir des recettes planifiées dans la semaine (regroupe les ingrédients)
- Ajout manuel d'articles avec coût estimé
- **Scan de reçu** (sans IA) : lecture OCR locale (Tesseract.js) + reconnaissance des articles par comparaison à une table d'apprentissage du foyer (distance de Levenshtein), pré-remplie avec ~140 produits courants (alimentaire, hygiène, entretien). Chaque correction est mémorisée pour améliorer la reconnaissance au fil du temps
- Coût réel par article, total estimé vs réel
- **Cocher un article acheté (avec un prix) crée automatiquement une dépense dans le budget privé de la personne qui coche**, catégorie "Courses" auto-créée ; décocher retire la dépense ; modifier le prix réel met à jour la dépense liée

---

## 5. Sauvegarde

- Export de toutes les données accessibles (volets partagés + données privées propres à la personne connectée) en un seul fichier CSV
- Réimport du même format : met à jour les lignes existantes, ajoute les nouvelles, aucun doublon
- Chacun doit exporter depuis son propre compte pour inclure ses données privées (Budget/Épargne)

---

## 6. Infrastructure Supabase

- **Auth** : email + mot de passe, un profil par personne rattaché à un foyer (`households` / `profiles`)
- **Storage** : bucket `progress-photos` (privé, RLS, liens signés)
- **Edge Functions** : `scan-receipt` — code écrit pour une lecture de reçu par IA (Claude vision), **actuellement non utilisé** par l'appli (remplacé par la reconnaissance sans IA), conservé pour un usage futur éventuel
- **Migrations SQL** : `0001` à `0013`, dans `supabase/migrations/`, à coller manuellement dans le SQL Editor Supabase (ne s'exécutent pas automatiquement au déploiement)

---

## 7. Volets prévus mais pas encore construits

Ces entrées apparaissent en pointillé sur le tableau de bord, avec leur table déjà présente en base :

- Sorties
- Événements
- Voyages
- Tâches ménagères
- Administratif & documents
- Inventaire maison
- Véhicule
- Souvenirs

## 8. Pistes explorées mais non retenues / en attente

- **Fonctionnalités IA** (génération de recettes, calcul de calories depuis une photo, catégorisation automatique des dépenses) : pipeline technique identifié (clé API Anthropic + Edge Function), non implémenté à ce jour, sauf l'essai initial sur le scan de reçu, abandonné au profit d'une solution sans IA
- **Backup automatique + email** en cas d'approche des limites Supabase : jugé trop complexe pour la valeur apportée (nécessite Management API token + service d'emailing tiers), non retenu — export manuel via le volet Sauvegarde à la place
- **Application native iOS/Android (Capacitor)** : évoquée pour débloquer l'intégration Apple Santé / Health Connect et l'installation directe (APK Android, ou compte développeur Apple à 99 €/an pour iOS sans passer par les stores) — non commencée
