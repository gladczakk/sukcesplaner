export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string
          id: string
          name: string
          project_id: string
          seq: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date: string
          id?: string
          name: string
          project_id: string
          seq?: never
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          name?: string
          project_id?: string
          seq?: never
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          due_date: string
          id: string
          life_area: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          life_area: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          life_area?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_occurrences: {
        Row: {
          created_at: string
          moved_to: string | null
          occurrence_date: string
          state: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          moved_to?: string | null
          occurrence_date: string
          state?: string
          task_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          moved_to?: string | null
          occurrence_date?: string
          state?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_occurrences_task_owner_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          deferred_until: string | null
          due_date: string | null
          id: string
          is_recurring: boolean | null
          milestone_id: string
          recurrence_interval_days: number | null
          recurrence_start_date: string | null
          recurrence_weekdays: number[] | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deferred_until?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          milestone_id: string
          recurrence_interval_days?: number | null
          recurrence_start_date?: string | null
          recurrence_weekdays?: number[] | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deferred_until?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          milestone_id?: string
          recurrence_interval_days?: number | null
          recurrence_start_date?: string | null
          recurrence_weekdays?: number[] | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_milestone_owner_fkey"
            columns: ["milestone_id", "user_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_rhythm_day: {
        Args: {
          p_day: string
          p_interval: number
          p_start: string
          p_weekdays: number[]
        }
        Returns: boolean
      }
      today_list: {
        Args: { p_today: string }
        Returns: {
          kind: string
          life_area: string
          milestone_due_date: string
          milestone_id: string
          milestone_name: string
          project_id: string
          project_name: string
          task_can_move: boolean
          task_deferred_until: string
          task_due_date: string
          task_id: string
          task_moved_from: string
          task_recurrence_interval_days: number
          task_recurrence_weekdays: number[]
          task_status: string
          task_title: string
        }[]
      }
      weekdays_valid: { Args: { w: number[] }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

