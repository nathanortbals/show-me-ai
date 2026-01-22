export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bill_actions: {
        Row: {
          action_date: string | null
          bill_id: string
          created_at: string | null
          description: string
          id: string
          sequence_order: number | null
        }
        Insert: {
          action_date?: string | null
          bill_id: string
          created_at?: string | null
          description: string
          id?: string
          sequence_order?: number | null
        }
        Update: {
          action_date?: string | null
          bill_id?: string
          created_at?: string | null
          description?: string
          id?: string
          sequence_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_actions_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_documents: {
        Row: {
          bill_id: string
          created_at: string | null
          document_type: string
          document_url: string | null
          id: string
          storage_path: string | null
        }
        Insert: {
          bill_id: string
          created_at?: string | null
          document_type: string
          document_url?: string | null
          id?: string
          storage_path?: string | null
        }
        Update: {
          bill_id?: string
          created_at?: string | null
          document_type?: string
          document_url?: string | null
          id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_documents_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_embeddings: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      bill_hearings: {
        Row: {
          bill_id: string
          committee_id: string | null
          created_at: string | null
          hearing_date: string | null
          hearing_time: string | null
          hearing_time_text: string | null
          id: string
          location: string | null
        }
        Insert: {
          bill_id: string
          committee_id?: string | null
          created_at?: string | null
          hearing_date?: string | null
          hearing_time?: string | null
          hearing_time_text?: string | null
          id?: string
          location?: string | null
        }
        Update: {
          bill_id?: string
          committee_id?: string | null
          created_at?: string | null
          hearing_date?: string | null
          hearing_time?: string | null
          hearing_time_text?: string | null
          id?: string
          location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_hearings_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_hearings_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_sponsors: {
        Row: {
          bill_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          session_legislator_id: string
        }
        Insert: {
          bill_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          session_legislator_id: string
        }
        Update: {
          bill_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          session_legislator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_sponsors_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_sponsors_session_legislator_id_fkey"
            columns: ["session_legislator_id"]
            isOneToOne: false
            referencedRelation: "session_legislators"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_number: string
          bill_string: string | null
          bill_url: string | null
          calendar_status: string | null
          created_at: string | null
          description: string | null
          embeddings_generated: boolean | null
          embeddings_generated_at: string | null
          hearing_status: string | null
          id: string
          last_action: string | null
          lr_number: string | null
          proposed_effective_date: string | null
          session_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          bill_number: string
          bill_string?: string | null
          bill_url?: string | null
          calendar_status?: string | null
          created_at?: string | null
          description?: string | null
          embeddings_generated?: boolean | null
          embeddings_generated_at?: string | null
          hearing_status?: string | null
          id?: string
          last_action?: string | null
          lr_number?: string | null
          proposed_effective_date?: string | null
          session_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          bill_number?: string
          bill_string?: string | null
          bill_url?: string | null
          calendar_status?: string | null
          created_at?: string | null
          description?: string | null
          embeddings_generated?: boolean | null
          embeddings_generated_at?: string | null
          hearing_status?: string | null
          id?: string
          last_action?: string | null
          lr_number?: string | null
          proposed_effective_date?: string | null
          session_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      committees: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      legislators: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          legislator_type: string | null
          name: string
          party_affiliation: string | null
          picture_url: string | null
          profile_url: string | null
          updated_at: string | null
          year_elected: number | null
          years_served: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legislator_type?: string | null
          name: string
          party_affiliation?: string | null
          picture_url?: string | null
          profile_url?: string | null
          updated_at?: string | null
          year_elected?: number | null
          years_served?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legislator_type?: string | null
          name?: string
          party_affiliation?: string | null
          picture_url?: string | null
          profile_url?: string | null
          updated_at?: string | null
          year_elected?: number | null
          years_served?: number | null
        }
        Relationships: []
      }
      session_legislators: {
        Row: {
          created_at: string | null
          district: string
          id: string
          legislator_id: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          district: string
          id?: string
          legislator_id: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          district?: string
          id?: string
          legislator_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_legislators_legislator_id_fkey"
            columns: ["legislator_id"]
            isOneToOne: false
            referencedRelation: "legislators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_legislators_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          session_code: string
          start_date: string | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          session_code: string
          start_date?: string | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          session_code?: string
          start_date?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_bill_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          embedding: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_bill_embeddings_filtered: {
        Args: {
          filter_committee_name?: string
          filter_session_code?: string
          filter_session_year?: number
          filter_sponsor_name?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          embedding: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
