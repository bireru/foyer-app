import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Message clair plutôt qu'une erreur Supabase obscure au démarrage
  // eslint-disable-next-line no-console
  console.error(
    'Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. Copie .env.example vers .env.local et renseigne-les.'
  )
}

// Pas de generic <Database> ici : le typage strict de supabase-js demande Views/Functions/Enums
// en plus de Tables, ce qui ajoute de la friction pour peu de valeur sur un petit projet.
// src/types/database.ts reste la référence lisible du schéma (Row/Insert/Update par table).
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
