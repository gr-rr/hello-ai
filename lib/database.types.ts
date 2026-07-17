export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          base_model: string
          created_at: string
          dataset_path: string | null
          error: string | null
          finished_at: string | null
          id: string
          loss_log: string
          params: Json
          status: string
        }
        Insert: {
          base_model: string
          created_at?: string
          dataset_path?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          loss_log?: string
          params?: Json
          status?: string
        }
        Update: {
          base_model?: string
          created_at?: string
          dataset_path?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          loss_log?: string
          params?: Json
          status?: string
        }
        Relationships: []
      }
      models: {
        Row: {
          adapter_path: string
          base_model: string
          created_at: string
          id: string
          job_id: string | null
          name: string
        }
        Insert: {
          adapter_path: string
          base_model: string
          created_at?: string
          id?: string
          job_id?: string | null
          name: string
        }
        Update: {
          adapter_path?: string
          base_model?: string
          created_at?: string
          id?: string
          job_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          audio_path: string
          created_at: string
          duration: number
          guidance_scale: number
          id: string
          model: string
          prompt: string
          temperature: number
        }
        Insert: {
          audio_path: string
          created_at?: string
          duration: number
          guidance_scale: number
          id?: string
          model?: string
          prompt: string
          temperature: number
        }
        Update: {
          audio_path?: string
          created_at?: string
          duration?: number
          guidance_scale?: number
          id?: string
          model?: string
          prompt?: string
          temperature?: number
        }
        Relationships: []
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
