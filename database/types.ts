/**
 * Database types generated from Supabase
 *
 * To regenerate these types, run:
 * npm run types:db
 *
 * This requires SUPABASE_PROJECT_ID to be set in the npm script.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      [key: string]: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
    }
    Views: {
      [key: string]: {
        Row: Record<string, unknown>
      }
    }
    Functions: {
      [key: string]: unknown
    }
    Enums: {
      [key: string]: string
    }
  }
}

// Placeholder - will be replaced with generated types
