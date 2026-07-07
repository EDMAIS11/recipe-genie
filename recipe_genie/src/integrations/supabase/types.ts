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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      import_sources: {
        Row: {
          created_at: string
          created_by: string
          exhausted: boolean
          host: string
          id: string
          is_active: boolean
          last_result: Json | null
          last_run_at: string | null
          path_includes: string[]
          search: string | null
          site_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          exhausted?: boolean
          host: string
          id?: string
          is_active?: boolean
          last_result?: Json | null
          last_run_at?: string | null
          path_includes?: string[]
          search?: string | null
          site_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          exhausted?: boolean
          host?: string
          id?: string
          is_active?: boolean
          last_result?: Json | null
          last_run_at?: string | null
          path_includes?: string[]
          search?: string | null
          site_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredient_prices: {
        Row: {
          base_unit: string | null
          fetched_at: string
          id: string
          ingredient_id: string
          is_current: boolean
          package_quantity: number | null
          package_unit: string | null
          price_eur: number | null
          price_per_base_unit: number | null
          product_name: string | null
          product_url: string | null
          source_site: string
        }
        Insert: {
          base_unit?: string | null
          fetched_at?: string
          id?: string
          ingredient_id: string
          is_current?: boolean
          package_quantity?: number | null
          package_unit?: string | null
          price_eur?: number | null
          price_per_base_unit?: number | null
          product_name?: string | null
          product_url?: string | null
          source_site: string
        }
        Update: {
          base_unit?: string | null
          fetched_at?: string
          id?: string
          ingredient_id?: string
          is_current?: boolean
          package_quantity?: number | null
          package_unit?: string | null
          price_eur?: number | null
          price_per_base_unit?: number | null
          product_name?: string | null
          product_url?: string | null
          source_site?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_prices_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          base_unit: string
          category: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          base_unit?: string
          category?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          base_unit?: string
          category?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          notes: string | null
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          notes?: string | null
          quantity: number
          recipe_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          notes?: string | null
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_preferences: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          status: Database["public"]["Enums"]["recipe_pref_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          status: Database["public"]["Enums"]["recipe_pref_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          status?: Database["public"]["Enums"]["recipe_pref_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_preferences_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author: string | null
          calories_per_serving: number | null
          cook_time_min: number | null
          created_at: string
          created_by: string
          cuisine_style: string | null
          description: string | null
          estimated_cost_per_serving: number | null
          id: string
          image_url: string | null
          meal_type: string | null
          prep_time_min: number | null
          servings: number
          source_site: string | null
          source_url: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          calories_per_serving?: number | null
          cook_time_min?: number | null
          created_at?: string
          created_by: string
          cuisine_style?: string | null
          description?: string | null
          estimated_cost_per_serving?: number | null
          id?: string
          image_url?: string | null
          meal_type?: string | null
          prep_time_min?: number | null
          servings?: number
          source_site?: string | null
          source_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          calories_per_serving?: number | null
          cook_time_min?: number | null
          created_at?: string
          created_by?: string
          cuisine_style?: string | null
          description?: string | null
          estimated_cost_per_serving?: number | null
          id?: string
          image_url?: string | null
          meal_type?: string | null
          prep_time_min?: number | null
          servings?: number
          source_site?: string | null
          source_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopping_list_checks: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          ingredient_id: string
          list_id: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          ingredient_id: string
          list_id: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          ingredient_id?: string
          list_id?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_checks_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_checks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          list_id: string
          recipe_id: string
          servings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          list_id: string
          recipe_id: string
          servings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          list_id?: string
          recipe_id?: string
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_shares: {
        Row: {
          created_at: string
          id: string
          invited_email: string
          invited_user_id: string | null
          list_id: string
          owner_user_id: string
          permission: string
          share_token: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email: string
          invited_user_id?: string | null
          list_id: string
          owner_user_id: string
          permission?: string
          share_token?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string
          invited_user_id?: string | null
          list_id?: string
          owner_user_id?: string
          permission?: string
          share_token?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_shares_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_list_access: {
        Args: { _list_id: string; _viewer: string }
        Returns: boolean
      }
      ingredients_needing_price_refresh: {
        Args: { p_limit?: number; p_stale_days?: number }
        Returns: {
          id: string
          name: string
        }[]
      }
    }
    Enums: {
      recipe_pref_status: "favorite" | "excluded"
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
    Enums: {
      recipe_pref_status: ["favorite", "excluded"],
    },
  },
} as const
