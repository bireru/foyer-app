export interface Database {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name?: string }
        Update: Partial<{ name: string }>
      }
      profiles: {
        Row: {
          id: string
          household_id: string
          display_name: string
          color_tag: 'billel' | 'cerine'
          created_at: string
        }
        Insert: {
          id: string
          household_id: string
          display_name: string
          color_tag: 'billel' | 'cerine'
        }
        Update: Partial<{ display_name: string; color_tag: 'billel' | 'cerine' }>
      }
      weight_logs: {
        Row: {
          id: string
          household_id: string
          profile_id: string
          measured_at: string
          weight_kg: number
          note: string | null
        }
        Insert: {
          household_id: string
          profile_id: string
          measured_at?: string
          weight_kg: number
          note?: string | null
        }
        Update: Partial<{ weight_kg: number; note: string | null; measured_at: string }>
      }
      vital_signs: {
        Row: {
          id: string
          household_id: string
          profile_id: string
          measured_at: string
          systolic: number | null
          diastolic: number | null
          heart_rate: number | null
          sleep_hours: number | null
          back_pain_level: number | null
          note: string | null
        }
        Insert: {
          household_id: string
          profile_id: string
          measured_at?: string
          systolic?: number | null
          diastolic?: number | null
          heart_rate?: number | null
          sleep_hours?: number | null
          back_pain_level?: number | null
          note?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['vital_signs']['Row'], 'id'>>
      }
      exercise_programs: {
        Row: {
          id: string
          household_id: string
          profile_id: string
          name: string
          goal: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          profile_id: string
          name: string
          goal?: string | null
          active?: boolean
        }
        Update: Partial<{ name: string; goal: string | null; active: boolean }>
      }
      program_exercises: {
        Row: {
          id: string
          program_id: string
          order_index: number
          name: string
          target_sets: number
          target_reps: number
          target_weight_kg: number | null
          rest_seconds: number
          notes: string | null
        }
        Insert: {
          program_id: string
          order_index?: number
          name: string
          target_sets?: number
          target_reps?: number
          target_weight_kg?: number | null
          rest_seconds?: number
          notes?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['program_exercises']['Row'], 'id' | 'program_id'>>
      }
      workout_sessions: {
        Row: {
          id: string
          household_id: string
          profile_id: string
          program_id: string | null
          started_at: string
          ended_at: string | null
          notes: string | null
        }
        Insert: {
          household_id: string
          profile_id: string
          program_id?: string | null
          started_at?: string
          notes?: string | null
        }
        Update: Partial<{ ended_at: string | null; notes: string | null }>
      }
      workout_sets: {
        Row: {
          id: string
          session_id: string
          program_exercise_id: string | null
          set_number: number
          reps_done: number | null
          weight_kg: number | null
          duration_seconds: number | null
          completed_at: string | null
        }
        Insert: {
          session_id: string
          program_exercise_id?: string | null
          set_number: number
          reps_done?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          completed_at?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['workout_sets']['Row'], 'id' | 'session_id'>>
      }
    }
  }
}
