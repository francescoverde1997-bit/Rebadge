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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          data: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          data?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          data?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      companies: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          custom_employee_limit: number | null
          id: string
          logo_path: string | null
          name: string
          plan: string | null
          plan_status: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          timezone: string
          trial_ends_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          custom_employee_limit?: number | null
          id?: string
          logo_path?: string | null
          name: string
          plan?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string
          trial_ends_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          custom_employee_limit?: number | null
          id?: string
          logo_path?: string | null
          name?: string
          plan?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string
          trial_ends_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          auto_break_after_minutes: number
          auto_break_minutes: number
          company_id: string
          daily_overtime_after_minutes: number
          max_shift_minutes: number
          night_end_minutes: number
          night_start_minutes: number
          patron_month_day: string | null
          patron_name: string | null
          reminder_enabled: boolean
          reminder_minutes: number
          rounding_minutes: number
          track_holiday: boolean
          track_night: boolean
          updated_at: string
          work_saturday: boolean
        }
        Insert: {
          auto_break_after_minutes?: number
          auto_break_minutes?: number
          company_id: string
          daily_overtime_after_minutes?: number
          max_shift_minutes?: number
          night_end_minutes?: number
          night_start_minutes?: number
          patron_month_day?: string | null
          patron_name?: string | null
          reminder_enabled?: boolean
          reminder_minutes?: number
          rounding_minutes?: number
          track_holiday?: boolean
          track_night?: boolean
          updated_at?: string
          work_saturday?: boolean
        }
        Update: {
          auto_break_after_minutes?: number
          auto_break_minutes?: number
          company_id?: string
          daily_overtime_after_minutes?: number
          max_shift_minutes?: number
          night_end_minutes?: number
          night_start_minutes?: number
          patron_month_day?: string | null
          patron_name?: string | null
          reminder_enabled?: boolean
          reminder_minutes?: number
          rounding_minutes?: number
          track_holiday?: boolean
          track_night?: boolean
          updated_at?: string
          work_saturday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_plan_requests: {
        Row: {
          company_id: string | null
          company_name: string
          contact_name: string
          created_at: string
          email: string
          employees_range: string
          id: string
          locations: number | null
          message: string | null
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          employees_range: string
          id?: string
          locations?: number | null
          message?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          employees_range?: string
          id?: string
          locations?: number | null
          message?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_plan_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          last_seen_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_secrets: {
        Row: {
          employee_id: string
          failed_pin_attempts: number
          pin_hash: string
          pin_locked_until: string | null
        }
        Insert: {
          employee_id: string
          failed_pin_attempts?: number
          pin_hash: string
          pin_locked_until?: string | null
        }
        Update: {
          employee_id?: string
          failed_pin_attempts?: number
          pin_hash?: string
          pin_locked_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_secrets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          pin_set_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          pin_set_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          pin_set_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          employee_id: string
          end_date: string
          hours: number | null
          id: string
          inps_protocol: string | null
          note: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          employee_id: string
          end_date: string
          hours?: number | null
          id?: string
          inps_protocol?: string | null
          note?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string
          end_date?: string
          hours?: number | null
          id?: string
          inps_protocol?: string | null
          note?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      month_closures: {
        Row: {
          closed_at: string
          closed_by: string | null
          company_id: string
          month: string
          pdf_path: string
          settings: Json
          totals: Json
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          company_id: string
          month: string
          pdf_path: string
          settings: Json
          totals: Json
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          company_id?: string
          month?: string
          pdf_path?: string
          settings?: Json
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "month_closures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      punches: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          device_id: string | null
          employee_id: string
          id: string
          kind: Database["public"]["Enums"]["punch_kind"]
          note: string | null
          punched_at: string
          source: Database["public"]["Enums"]["punch_source"]
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          employee_id: string
          id?: string
          kind: Database["public"]["Enums"]["punch_kind"]
          note?: string | null
          punched_at: string
          source: Database["public"]["Enums"]["punch_source"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          employee_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["punch_kind"]
          note?: string | null
          punched_at?: string
          source?: Database["public"]["Enums"]["punch_source"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          company_id: string
          local_date: string
          sent_at: string
        }
        Insert: {
          company_id: string
          local_date: string
          sent_at?: string
        }
        Update: {
          company_id?: string
          local_date?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _device_from_token: {
        Args: { p_token: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          last_seen_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _kiosk_require_active: { Args: { cid: string }; Returns: undefined }
      _validate_pin: { Args: { p_pin: string }; Returns: undefined }
      close_month: {
        Args: {
          p_company_id: string
          p_month: string
          p_pdf_path: string
          p_settings: Json
          p_totals: Json
        }
        Returns: string
      }
      company_month: { Args: { cid: string; ts: string }; Returns: string }
      create_device: {
        Args: { p_company_id: string; p_name?: string }
        Returns: string
      }
      create_employee: {
        Args: {
          p_company_id: string
          p_email: string
          p_first_name: string
          p_last_name: string
          p_pin: string
        }
        Returns: string
      }
      employee_limit: { Args: { cid: string }; Returns: number }
      is_company_active: { Args: { cid: string }; Returns: boolean }
      is_company_member: { Args: { cid: string }; Returns: boolean }
      is_company_owner: { Args: { cid: string }; Returns: boolean }
      is_month_closed: { Args: { cid: string; m: string }; Returns: boolean }
      is_valid_month_day: { Args: { v: string }; Returns: boolean }
      kiosk_info: { Args: { p_token: string }; Returns: Json }
      kiosk_punch: {
        Args: { p_employee_id: string; p_pin: string; p_token: string }
        Returns: Json
      }
      request_custom_plan: {
        Args: {
          p_company_name: string
          p_contact_name: string
          p_email: string
          p_employees_range: string
          p_locations: number
          p_message: string
          p_phone: string
        }
        Returns: undefined
      }
      set_employee_pin: {
        Args: { p_employee_id: string; p_pin: string }
        Returns: undefined
      }
      support_reopen_month: {
        Args: { p_company_id: string; p_month: string }
        Returns: boolean
      }
    }
    Enums: {
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "ferie" | "permesso" | "malattia" | "altro"
      member_role: "owner" | "employee"
      plan_status: "trialing" | "active" | "past_due" | "canceled"
      punch_kind: "in" | "out"
      punch_source: "kiosk" | "manual"
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
    Enums: {
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["ferie", "permesso", "malattia", "altro"],
      member_role: ["owner", "employee"],
      plan_status: ["trialing", "active", "past_due", "canceled"],
      punch_kind: ["in", "out"],
      punch_source: ["kiosk", "manual"],
    },
  },
} as const
