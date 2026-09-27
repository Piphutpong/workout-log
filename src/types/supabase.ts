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
      body_comp: {
        Row: {
          body_fat_kg: number | null
          created_at: string
          date: string
          id: string
          note: string | null
          pbf_pct: number | null
          smm_kg: number | null
          updated_at: string
          user_id: string
          visceral_fat: number | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          body_fat_kg?: number | null
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          pbf_pct?: number | null
          smm_kg?: number | null
          updated_at?: string
          user_id?: string
          visceral_fat?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          body_fat_kg?: number | null
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          pbf_pct?: number | null
          smm_kg?: number | null
          updated_at?: string
          user_id?: string
          visceral_fat?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      body_weight: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      daily_checkin: {
        Row: {
          created_at: string
          date: string
          energy: number | null
          id: string
          note: string | null
          resting_hr: number | null
          sleep_hours: number | null
          soreness: number | null
          steps: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          note?: string | null
          resting_hr?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          steps?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          note?: string | null
          resting_hr?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          steps?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      day_marks: {
        Row: {
          activity: string | null
          created_at: string
          date: string
          id: string
          note: string | null
          plan_day_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity?: string | null
          created_at?: string
          date: string
          id?: string
          note?: string | null
          plan_day_id?: string | null
          status: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity?: string | null
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          plan_day_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_marks_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "run_plan_days"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          active: boolean
          created_at: string
          grip_intensive: boolean
          id: string
          measure_type: string
          muscle_group: string | null
          name: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          grip_intensive?: boolean
          id?: string
          measure_type?: string
          muscle_group?: string | null
          name: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          grip_intensive?: boolean
          id?: string
          measure_type?: string
          muscle_group?: string | null
          name?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      food_log: {
        Row: {
          calories: number
          carb_g: number
          created_at: string
          date: string
          fat_g: number
          fiber_g: number | null
          food_id: string | null
          id: string
          meal: string
          name: string | null
          note: string | null
          protein_g: number
          recipe_id: string | null
          servings: number
          sodium_mg: number | null
          time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          carb_g?: number
          created_at?: string
          date?: string
          fat_g?: number
          fiber_g?: number | null
          food_id?: string | null
          id?: string
          meal: string
          name?: string | null
          note?: string | null
          protein_g?: number
          recipe_id?: string | null
          servings?: number
          sodium_mg?: number | null
          time?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          calories?: number
          carb_g?: number
          created_at?: string
          date?: string
          fat_g?: number
          fiber_g?: number | null
          food_id?: string | null
          id?: string
          meal?: string
          name?: string | null
          note?: string | null
          protein_g?: number
          recipe_id?: string | null
          servings?: number
          sodium_mg?: number | null
          time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_log_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calories: number
          carb_g: number
          category: string | null
          created_at: string
          fat_g: number
          fiber_g: number | null
          id: string
          is_estimate: boolean
          is_favorite: boolean
          name: string
          name_en: string | null
          protein_g: number
          serving_desc: string | null
          serving_g: number | null
          sodium_mg: number | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories?: number
          carb_g?: number
          category?: string | null
          created_at?: string
          fat_g?: number
          fiber_g?: number | null
          id?: string
          is_estimate?: boolean
          is_favorite?: boolean
          name: string
          name_en?: string | null
          protein_g?: number
          serving_desc?: string | null
          serving_g?: number | null
          sodium_mg?: number | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories?: number
          carb_g?: number
          category?: string | null
          created_at?: string
          fat_g?: number
          fiber_g?: number | null
          id?: string
          is_estimate?: boolean
          is_favorite?: boolean
          name?: string
          name_en?: string | null
          protein_g?: number
          serving_desc?: string | null
          serving_g?: number | null
          sodium_mg?: number | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          achieved_at: string | null
          created_at: string
          direction: string
          goal_type: string
          id: string
          metric: string
          sort_order: number
          start_date: string
          start_value: number | null
          status: string
          target_date: string | null
          target_value: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          direction: string
          goal_type: string
          id?: string
          metric: string
          sort_order?: number
          start_date?: string
          start_value?: number | null
          status?: string
          target_date?: string | null
          target_value: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          direction?: string
          goal_type?: string
          id?: string
          metric?: string
          sort_order?: number
          start_date?: string
          start_value?: number | null
          status?: string
          target_date?: string | null
          target_value?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_templates: {
        Row: {
          created_at: string
          id: string
          items: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string | null
          channels: string[]
          created_at: string
          date: string
          id: string
          kind: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channels?: string[]
          created_at?: string
          date: string
          id?: string
          kind: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string | null
          channels?: string[]
          created_at?: string
          date?: string
          id?: string
          kind?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_targets: {
        Row: {
          carb_g: number
          created_at: string
          day_type: string
          fat_g: number
          id: string
          kcal: number
          protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          carb_g: number
          created_at?: string
          day_type: string
          fat_g: number
          id?: string
          kcal: number
          protein_g: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          carb_g?: number
          created_at?: string
          day_type?: string
          fat_g?: number
          id?: string
          kcal?: number
          protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pain_log: {
        Row: {
          body_part: string
          context: string | null
          created_at: string
          date: string
          id: string
          linked_run_id: string | null
          linked_session_id: string | null
          note: string | null
          pinned: boolean
          score: number
          side: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_part: string
          context?: string | null
          created_at?: string
          date?: string
          id?: string
          linked_run_id?: string | null
          linked_session_id?: string | null
          note?: string | null
          pinned?: boolean
          score: number
          side?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body_part?: string
          context?: string | null
          created_at?: string
          date?: string
          id?: string
          linked_run_id?: string | null
          linked_session_id?: string | null
          note?: string | null
          pinned?: boolean
          score?: number
          side?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pain_log_linked_run_id_fkey"
            columns: ["linked_run_id"]
            isOneToOne: false
            referencedRelation: "last_run_by_type"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "pain_log_linked_run_id_fkey"
            columns: ["linked_run_id"]
            isOneToOne: false
            referencedRelation: "run_pr_events"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "pain_log_linked_run_id_fkey"
            columns: ["linked_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pain_log_linked_session_id_fkey"
            columns: ["linked_session_id"]
            isOneToOne: false
            referencedRelation: "weight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_enrollments: {
        Row: {
          created_at: string
          day_offset: number
          id: string
          plan_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_offset?: number
          id?: string
          plan_id: string
          start_date: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day_offset?: number
          id?: string
          plan_id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "run_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          note: string | null
          program_id: string
          rest_sec: number | null
          sort_order: number
          superset_group: string | null
          target_reps: number | null
          target_reps_max: number | null
          target_seconds: number | null
          target_sets: number
          target_weight_lb: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          note?: string | null
          program_id: string
          rest_sec?: number | null
          sort_order?: number
          superset_group?: string | null
          target_reps?: number | null
          target_reps_max?: number | null
          target_seconds?: number | null
          target_sets?: number
          target_weight_lb?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          note?: string | null
          program_id?: string
          rest_sec?: number | null
          sort_order?: number
          superset_group?: string | null
          target_reps?: number | null
          target_reps_max?: number | null
          target_seconds?: number | null
          target_sets?: number
          target_weight_lb?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "weight_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          angle: string
          created_at: string
          date: string
          id: string
          note: string | null
          storage_path: string
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          angle: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          storage_path: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Update: {
          angle?: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recipe_items: {
        Row: {
          amount_g: number
          created_at: string
          food_id: string
          id: string
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_g: number
          created_at?: string
          food_id: string
          id?: string
          recipe_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount_g?: number
          created_at?: string
          food_id?: string
          id?: string
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          servings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          servings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      run_intervals: {
        Row: {
          avg_hr: number | null
          created_at: string
          distance_m: number | null
          duration_sec: number | null
          id: string
          rep_no: number
          run_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_sec?: number | null
          id?: string
          rep_no: number
          run_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_sec?: number | null
          id?: string
          rep_no?: number
          run_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_intervals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "last_run_by_type"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "run_intervals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "run_pr_events"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "run_intervals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_plan_days: {
        Row: {
          add_strides: boolean
          add_weights: boolean
          created_at: string
          day_no: number
          description: string | null
          id: string
          note: string | null
          plan_id: string
          repeat_of_week: number | null
          segments: Json
          title: string
          updated_at: string
          user_id: string | null
          week_no: number
          workout_type: string
        }
        Insert: {
          add_strides?: boolean
          add_weights?: boolean
          created_at?: string
          day_no: number
          description?: string | null
          id?: string
          note?: string | null
          plan_id: string
          repeat_of_week?: number | null
          segments?: Json
          title: string
          updated_at?: string
          user_id?: string | null
          week_no: number
          workout_type: string
        }
        Update: {
          add_strides?: boolean
          add_weights?: boolean
          created_at?: string
          day_no?: number
          description?: string | null
          id?: string
          note?: string | null
          plan_id?: string
          repeat_of_week?: number | null
          segments?: Json
          title?: string
          updated_at?: string
          user_id?: string | null
          week_no?: number
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "run_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      run_plans: {
        Row: {
          active: boolean
          created_at: string
          goal_distance_km: number | null
          id: string
          level: string
          name: string
          note: string | null
          slug: string | null
          source: string | null
          total_days: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          goal_distance_km?: number | null
          id?: string
          level: string
          name: string
          note?: string | null
          slug?: string | null
          source?: string | null
          total_days: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          goal_distance_km?: number | null
          id?: string
          level?: string
          name?: string
          note?: string | null
          slug?: string | null
          source?: string | null
          total_days?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      run_splits: {
        Row: {
          avg_hr: number | null
          created_at: string
          duration_sec: number | null
          elevation_gain_m: number | null
          id: string
          km_no: number
          run_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          created_at?: string
          duration_sec?: number | null
          elevation_gain_m?: number | null
          id?: string
          km_no: number
          run_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          avg_hr?: number | null
          created_at?: string
          duration_sec?: number | null
          elevation_gain_m?: number | null
          id?: string
          km_no?: number
          run_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_splits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "last_run_by_type"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "run_splits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "run_pr_events"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "run_splits_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          avg_hr: number | null
          completed: string
          created_at: string
          date: string
          distance_km: number | null
          duration_sec: number | null
          external_id: string | null
          feeling: number | null
          humidity_pct: number | null
          id: string
          max_hr: number | null
          note: string | null
          pace_sec_per_km: number | null
          plan_day_id: string | null
          rpe: number | null
          run_type: string
          shoe_id: string | null
          source: string
          temp_c: number | null
          time_of_day: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          completed?: string
          created_at?: string
          date?: string
          distance_km?: number | null
          duration_sec?: number | null
          external_id?: string | null
          feeling?: number | null
          humidity_pct?: number | null
          id?: string
          max_hr?: number | null
          note?: string | null
          pace_sec_per_km?: number | null
          plan_day_id?: string | null
          rpe?: number | null
          run_type: string
          shoe_id?: string | null
          source?: string
          temp_c?: number | null
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          avg_hr?: number | null
          completed?: string
          created_at?: string
          date?: string
          distance_km?: number | null
          duration_sec?: number | null
          external_id?: string | null
          feeling?: number | null
          humidity_pct?: number | null
          id?: string
          max_hr?: number | null
          note?: string | null
          pace_sec_per_km?: number | null
          plan_day_id?: string | null
          rpe?: number | null
          run_type?: string
          shoe_id?: string | null
          source?: string
          temp_c?: number | null
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "run_plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "shoe_usage"
            referencedColumns: ["shoe_id"]
          },
          {
            foreignKeyName: "runs_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "shoes"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          birth_date: string | null
          created_at: string
          default_rest_sec: number
          deload_week_start: string | null
          display_name: string | null
          height_cm: number | null
          id: string
          max_hr: number
          notify_email: boolean
          notify_evening_time: string | null
          notify_morning_time: string | null
          notify_push: boolean
          notify_weekly: boolean
          nutrition_mode: string
          onboarded_at: string | null
          pinned_pain_parts: string[]
          program_start_date: string | null
          sex: string | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          weather_lat: number | null
          weather_lon: number | null
          weight_step_lb: number
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          default_rest_sec?: number
          deload_week_start?: string | null
          display_name?: string | null
          height_cm?: number | null
          id?: string
          max_hr?: number
          notify_email?: boolean
          notify_evening_time?: string | null
          notify_morning_time?: string | null
          notify_push?: boolean
          notify_weekly?: boolean
          nutrition_mode?: string
          onboarded_at?: string | null
          pinned_pain_parts?: string[]
          program_start_date?: string | null
          sex?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weather_lat?: number | null
          weather_lon?: number | null
          weight_step_lb?: number
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          default_rest_sec?: number
          deload_week_start?: string | null
          display_name?: string | null
          height_cm?: number | null
          id?: string
          max_hr?: number
          notify_email?: boolean
          notify_evening_time?: string | null
          notify_morning_time?: string | null
          notify_push?: boolean
          notify_weekly?: boolean
          nutrition_mode?: string
          onboarded_at?: string | null
          pinned_pain_parts?: string[]
          program_start_date?: string | null
          sex?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weather_lat?: number | null
          weather_lon?: number | null
          weight_step_lb?: number
        }
        Relationships: []
      }
      shoes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          retire_km: number
          start_date: string
          start_km: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          retire_km?: number
          start_date?: string
          start_km?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          retire_km?: number
          start_date?: string
          start_km?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supplement_log: {
        Row: {
          created_at: string
          date: string
          id: string
          supplement_id: string
          taken: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          supplement_id: string
          taken?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          supplement_id?: string
          taken?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_log_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplements: {
        Row: {
          active: boolean
          created_at: string
          dose: string | null
          id: string
          name: string
          timing: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dose?: string | null
          id?: string
          name: string
          timing?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dose?: string | null
          id?: string
          name?: string
          timing?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tdee_proposals: {
        Row: {
          avg_kcal: number | null
          created_at: string
          current_avg_target: number | null
          days_logged: number | null
          id: string
          mode: string
          proposed_delta: number | null
          status: string
          tdee: number | null
          updated_at: string
          user_id: string
          week_start: string
          weight_change_kg: number | null
          window_days: number | null
        }
        Insert: {
          avg_kcal?: number | null
          created_at?: string
          current_avg_target?: number | null
          days_logged?: number | null
          id?: string
          mode: string
          proposed_delta?: number | null
          status?: string
          tdee?: number | null
          updated_at?: string
          user_id?: string
          week_start: string
          weight_change_kg?: number | null
          window_days?: number | null
        }
        Update: {
          avg_kcal?: number | null
          created_at?: string
          current_avg_target?: number | null
          days_logged?: number | null
          id?: string
          mode?: string
          proposed_delta?: number | null
          status?: string
          tdee?: number | null
          updated_at?: string
          user_id?: string
          week_start?: string
          weight_change_kg?: number | null
          window_days?: number | null
        }
        Relationships: []
      }
      warmup_routines: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          items: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          items?: Json
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          items?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      water_log: {
        Row: {
          created_at: string
          date: string
          id: string
          ml: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          ml: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          ml?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          created_at: string
          good: Json
          id: string
          improve: Json
          stats: Json | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          good?: Json
          id?: string
          improve?: Json
          stats?: Json | null
          updated_at?: string
          user_id?: string
          week_start: string
        }
        Update: {
          created_at?: string
          good?: Json
          id?: string
          improve?: Json
          stats?: Json | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_schedule: {
        Row: {
          activity: string
          created_at: string
          day_of_week: number
          id: string
          run_type: string | null
          segments: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity: string
          created_at?: string
          day_of_week: number
          id?: string
          run_type?: string | null
          segments?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity?: string
          created_at?: string
          day_of_week?: number
          id?: string
          run_type?: string | null
          segments?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_programs: {
        Row: {
          active: boolean
          color: string
          created_at: string
          description: string | null
          id: string
          is_warmup: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_warmup?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_warmup?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_rotation: {
        Row: {
          created_at: string
          id: string
          program_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          program_id: string
          sort_order: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          program_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_rotation_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "weight_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_sessions: {
        Row: {
          created_at: string
          date: string
          duration_min: number | null
          id: string
          is_deload: boolean
          note: string | null
          program_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          is_deload?: boolean
          note?: string | null
          program_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_min?: number | null
          id?: string
          is_deload?: boolean
          note?: string | null
          program_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "weight_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_sets: {
        Row: {
          band_level: string | null
          created_at: string
          date: string
          exercise_id: string
          id: string
          reps: number | null
          rpe: number | null
          seconds: number | null
          session_id: string
          set_no: number
          updated_at: string
          user_id: string
          weight_lb: number | null
        }
        Insert: {
          band_level?: string | null
          created_at?: string
          date: string
          exercise_id: string
          id?: string
          reps?: number | null
          rpe?: number | null
          seconds?: number | null
          session_id: string
          set_no: number
          updated_at?: string
          user_id?: string
          weight_lb?: number | null
        }
        Update: {
          band_level?: string | null
          created_at?: string
          date?: string
          exercise_id?: string
          id?: string
          reps?: number | null
          rpe?: number | null
          seconds?: number | null
          session_id?: string
          set_no?: number
          updated_at?: string
          user_id?: string
          weight_lb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weight_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "weight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_nutrition: {
        Row: {
          carb_g: number | null
          date: string | null
          day_type: string | null
          fat_g: number | null
          fiber_g: number | null
          items: number | null
          kcal: number | null
          kcal_in_range: boolean | null
          protein_g: number | null
          protein_hit: boolean | null
          sodium_mg: number | null
          target_carb_g: number | null
          target_fat_g: number | null
          target_kcal: number | null
          target_protein_g: number | null
          user_id: string | null
          water_ml: number | null
        }
        Relationships: []
      }
      exercise_progress: {
        Row: {
          date: string | null
          e1rm_lb: number | null
          exercise_id: string | null
          max_seconds: number | null
          max_weight_lb: number | null
          session_id: string | null
          set_count: number | null
          total_reps: number | null
          user_id: string | null
          volume_lb: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weight_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "weight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      food_usage: {
        Row: {
          food_id: string | null
          last_at: string | null
          last_used: string | null
          recipe_id: string | null
          user_id: string | null
          uses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_log_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_progress: {
        Row: {
          current_value: number | null
          days_left: number | null
          direction: string | null
          expected_value: number | null
          forecast_date: string | null
          goal_id: string | null
          goal_type: string | null
          metric: string | null
          progress_pct: number | null
          remaining: number | null
          slope_per_day: number | null
          start_date: string | null
          start_value: number | null
          state: string | null
          status: string | null
          target_date: string | null
          target_value: number | null
          title: string | null
        }
        Relationships: []
      }
      last_performance: {
        Row: {
          date: string | null
          exercise_id: string | null
          session_id: string | null
          sets: Json | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weight_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "weight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      last_run_by_type: {
        Row: {
          avg_hr: number | null
          date: string | null
          distance_km: number | null
          duration_sec: number | null
          humidity_pct: number | null
          max_hr: number | null
          pace_sec_per_km: number | null
          run_id: string | null
          run_type: string | null
          temp_c: number | null
          user_id: string | null
        }
        Relationships: []
      }
      pr_events: {
        Row: {
          date: string | null
          e1rm_lb: number | null
          exercise_id: string | null
          max_seconds: number | null
          max_weight_lb: number | null
          prev_best_e1rm: number | null
          prev_best_seconds: number | null
          prev_best_weight: number | null
          session_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weight_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "weight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      run_pr_events: {
        Row: {
          date: string | null
          distance_km: number | null
          kind: string | null
          pace_sec_per_km: number | null
          run_id: string | null
          run_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      shoe_usage: {
        Row: {
          km: number | null
          last_used: string | null
          runs: number | null
          shoe_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      weekly_summary: {
        Row: {
          active_days: number | null
          avg_carb_g: number | null
          avg_fat_g: number | null
          avg_kcal: number | null
          avg_protein_g: number | null
          avg_resting_hr: number | null
          avg_sleep_hours: number | null
          avg_weight_kg: number | null
          food_days: number | null
          kcal_days_in_range: number | null
          protein_days_hit: number | null
          run_km: number | null
          run_km_change: number | null
          run_sec: number | null
          runs: number | null
          user_id: string | null
          week_end: string | null
          week_start: string | null
          weigh_ins: number | null
          weight_change_kg: number | null
          weight_sessions: number | null
        }
        Relationships: []
      }
      weekly_training: {
        Row: {
          sessions: number | null
          sets: number | null
          user_id: string | null
          volume_lb: number | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      achievements: { Args: { p_today?: string }; Returns: Json }
      best_time_for: { Args: { p_km: number }; Returns: Json }
      bkk_today: { Args: never; Returns: string }
      bootstrap_user: { Args: { p_start_date?: string }; Returns: boolean }
      day_activity: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          mark: string
          planned: string
          planned_workout: string
          run_done: boolean
          run_km: number
          weight_done: boolean
        }[]
      }
      day_type_of: {
        Args: { p_activity: string; p_workout: string }
        Returns: string
      }
      epley_1rm: { Args: { p_reps: number; p_weight: number }; Returns: number }
      goal_progress: {
        Args: { p_date?: string }
        Returns: {
          current_value: number
          days_left: number
          direction: string
          expected_value: number
          forecast_date: string
          goal_id: string
          goal_type: string
          metric: string
          progress_pct: number
          remaining: number
          slope_per_day: number
          start_date: string
          start_value: number
          state: string
          status: string
          target_date: string
          target_value: number
          title: string
        }[]
      }
      metric_current: {
        Args: { p_date?: string; p_metric: string }
        Returns: number
      }
      metric_slope: {
        Args: { p_date?: string; p_metric: string }
        Returns: number
      }
      notification_payload: {
        Args: { p_date: string; p_uid: string; p_weekly?: boolean }
        Returns: Json
      }
      personal_records: { Args: never; Returns: Json }
      progress_compare: {
        Args: { p_ref?: string; p_today?: string }
        Returns: Json
      }
      resolve_plan_day: {
        Args: { p_day_no: number; p_plan_id: string }
        Returns: Json
      }
      seed_foods: { Args: { p_uid: string }; Returns: boolean }
      seed_toning_programs: { Args: { p_uid: string }; Returns: boolean }
      tdee_inputs: { Args: { p_end?: string }; Returns: Json }
      today_plan: { Args: { p_date?: string }; Returns: Json }
      weekly_review_stats: { Args: { p_week_start: string }; Returns: Json }
      weight_program_for: { Args: { p_date?: string }; Returns: string }
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
