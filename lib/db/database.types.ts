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
    PostgrestVersion: "17.1"
  }
  public: {
    Tables: {
      payments: {
        Row: {
          amount_paise: number
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          payment_type: string
          provider: string
          provider_ref: string
          request_id: string
          status: string
        }
        Insert: {
          amount_paise: number
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          payment_type: string
          provider: string
          provider_ref: string
          request_id: string
          status: string
        }
        Update: {
          amount_paise?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          payment_type?: string
          provider?: string
          provider_ref?: string
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "work_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_files: {
        Row: {
          created_at: string
          direction: string
          field_key: string | null
          id: string
          mime_type: string
          original_filename: string
          request_id: string
          size_bytes: number
          storage_key: string
          uploaded_by_staff_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          field_key?: string | null
          id?: string
          mime_type: string
          original_filename: string
          request_id: string
          size_bytes: number
          storage_key: string
          uploaded_by_staff_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          field_key?: string | null
          id?: string
          mime_type?: string
          original_filename?: string
          request_id?: string
          size_bytes?: number
          storage_key?: string
          uploaded_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_files_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "work_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_files_uploaded_by_staff_id_fkey"
            columns: ["uploaded_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price_paise: number
          created_at: string
          description: string
          display_order: number
          estimated_turnaround: string
          form_schema: Json
          id: string
          is_active: boolean
          is_collectible_online: boolean
          name: string
          pricing_rules: Json
          slug: string
          updated_at: string
        }
        Insert: {
          base_price_paise: number
          created_at?: string
          description?: string
          display_order?: number
          estimated_turnaround?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          is_collectible_online?: boolean
          name: string
          pricing_rules?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          base_price_paise?: number
          created_at?: string
          description?: string
          display_order?: number
          estimated_turnaround?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          is_collectible_online?: boolean
          name?: string
          pricing_rules?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          address: string
          closed_notice: string
          email: string
          id: number
          is_open: boolean
          phone: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          address: string
          closed_notice: string
          email: string
          id?: number
          is_open?: boolean
          phone: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          address?: string
          closed_notice?: string
          email?: string
          id?: number
          is_open?: boolean
          phone?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      staff_users: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          password_hash: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          password_hash: string
          role: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string
          role?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      work_requests: {
        Row: {
          advance_required_paise: number
          amount_paid_paise: number
          cancellation_reason: string | null
          created_at: string
          customer_email: string | null
          customer_note: string | null
          customer_phone: string | null
          files_expire_at: string | null
          files_purged_at: string | null
          form_data: Json
          id: string
          service_id: string
          service_snapshot: Json
          status: string
          storage_prefix: string
          submitted_while_closed: boolean
          terminal_at: string | null
          token: string | null
          total_amount_paise: number
          updated_at: string
        }
        Insert: {
          advance_required_paise: number
          amount_paid_paise?: number
          cancellation_reason?: string | null
          created_at?: string
          customer_email?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          files_expire_at?: string | null
          files_purged_at?: string | null
          form_data?: Json
          id?: string
          service_id: string
          service_snapshot: Json
          status: string
          storage_prefix: string
          submitted_while_closed?: boolean
          terminal_at?: string | null
          token?: string | null
          total_amount_paise: number
          updated_at?: string
        }
        Update: {
          advance_required_paise?: number
          amount_paid_paise?: number
          cancellation_reason?: string | null
          created_at?: string
          customer_email?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          files_expire_at?: string | null
          files_purged_at?: string | null
          form_data?: Json
          id?: string
          service_id?: string
          service_snapshot?: Json
          status?: string
          storage_prefix?: string
          submitted_while_closed?: boolean
          terminal_at?: string | null
          token?: string | null
          total_amount_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
