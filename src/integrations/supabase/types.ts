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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          active_provider: string
          brand_tone: string
          campaign_id: string | null
          created_at: string
          custom_objective: string | null
          default_hashtags: string[]
          fallback_chain: Json
          id: string
          language: string
          max_caption_length: number
          model: string
          objective: Database["public"]["Enums"]["channel_objective"]
          platform_rules: Json
          provider_mode: string
          providers_config: Json
          temperature: number
          updated_at: string
          user_id: string
          user_instructions: string | null
        }
        Insert: {
          active_provider?: string
          brand_tone?: string
          campaign_id?: string | null
          created_at?: string
          custom_objective?: string | null
          default_hashtags?: string[]
          fallback_chain?: Json
          id?: string
          language?: string
          max_caption_length?: number
          model?: string
          objective?: Database["public"]["Enums"]["channel_objective"]
          platform_rules?: Json
          provider_mode?: string
          providers_config?: Json
          temperature?: number
          updated_at?: string
          user_id: string
          user_instructions?: string | null
        }
        Update: {
          active_provider?: string
          brand_tone?: string
          campaign_id?: string | null
          created_at?: string
          custom_objective?: string | null
          default_hashtags?: string[]
          fallback_chain?: Json
          id?: string
          language?: string
          max_caption_length?: number
          model?: string
          objective?: Database["public"]["Enums"]["channel_objective"]
          platform_rules?: Json
          provider_mode?: string
          providers_config?: Json
          temperature?: number
          updated_at?: string
          user_id?: string
          user_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_settings: {
        Row: {
          created_at: string
          custom_query: string | null
          id: string
          n_value: number
          scope: Database["public"]["Enums"]["analysis_scope"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_query?: string | null
          id?: string
          n_value?: number
          scope?: Database["public"]["Enums"]["analysis_scope"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_query?: string | null
          id?: string
          n_value?: number
          scope?: Database["public"]["Enums"]["analysis_scope"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          attempt: number
          created_at: string
          duration_ms: number | null
          error: string | null
          event_type: string
          id: string
          module: string | null
          payload: Json | null
          queue_item_id: string | null
          run_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_type: string
          id?: string
          module?: string | null
          payload?: Json | null
          queue_item_id?: string | null
          run_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_type?: string
          id?: string
          module?: string | null
          payload?: Json | null
          queue_item_id?: string | null
          run_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      buffer_credentials: {
        Row: {
          api_token: string
          campaign_id: string | null
          created_at: string
          graphql_endpoint: string
          id: string
          label: string
          last_tested_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token: string
          campaign_id?: string | null
          created_at?: string
          graphql_endpoint?: string
          id?: string
          label?: string
          last_tested_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token?: string
          campaign_id?: string | null
          created_at?: string
          graphql_endpoint?: string
          id?: string
          label?: string
          last_tested_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buffer_credentials_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          custom_objective: string | null
          custom_scheduled_at: string | null
          description: string | null
          id: string
          name: string
          objective: string
          publish_delay_minutes: number | null
          publish_mode: string
          sample_caption_mode: string
          share_learning: boolean
          status: string
          updated_at: string
          use_sample_captions: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_objective?: string | null
          custom_scheduled_at?: string | null
          description?: string | null
          id?: string
          name: string
          objective?: string
          publish_delay_minutes?: number | null
          publish_mode?: string
          sample_caption_mode?: string
          share_learning?: boolean
          status?: string
          updated_at?: string
          use_sample_captions?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          custom_objective?: string | null
          custom_scheduled_at?: string | null
          description?: string | null
          id?: string
          name?: string
          objective?: string
          publish_delay_minutes?: number | null
          publish_mode?: string
          sample_caption_mode?: string
          share_learning?: boolean
          status?: string
          updated_at?: string
          use_sample_captions?: boolean
          user_id?: string
        }
        Relationships: []
      }
      sample_captions: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          is_active: boolean
          text: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          text: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_captions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      captions: {
        Row: {
          campaign_id: string | null
          created_at: string
          cta: string | null
          emoji_count: number | null
          hashtags: string[] | null
          hook: string | null
          id: string
          length: number | null
          run_id: string
          style_tags: string[] | null
          text: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          cta?: string | null
          emoji_count?: number | null
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          length?: number | null
          run_id: string
          style_tags?: string[] | null
          text: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          cta?: string | null
          emoji_count?: number | null
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          length?: number | null
          run_id?: string
          style_tags?: string[] | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active: boolean
          active_run_id: string | null
          buffer_channel_id: string
          campaign_id: string | null
          created_at: string
          credential_id: string | null
          id: string
          last_seen_at: string | null
          lock_expires_at: string | null
          missing_since: string | null
          name: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          active_run_id?: string | null
          buffer_channel_id: string
          campaign_id?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          last_seen_at?: string | null
          lock_expires_at?: string | null
          missing_since?: string | null
          name: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          active_run_id?: string | null
          buffer_channel_id?: string
          campaign_id?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          last_seen_at?: string | null
          lock_expires_at?: string | null
          missing_since?: string | null
          name?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "buffer_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_trends: {
        Row: {
          baseline: number | null
          campaign_id: string | null
          confidence: number | null
          dimension: string
          human_summary: string | null
          id: string
          last_computed_at: string
          lift_pct: number | null
          metric: string
          observed: number | null
          sample_size: number | null
          user_id: string
          value: string
        }
        Insert: {
          baseline?: number | null
          campaign_id?: string | null
          confidence?: number | null
          dimension: string
          human_summary?: string | null
          id?: string
          last_computed_at?: string
          lift_pct?: number | null
          metric: string
          observed?: number | null
          sample_size?: number | null
          user_id: string
          value: string
        }
        Update: {
          baseline?: number | null
          campaign_id?: string | null
          confidence?: number | null
          dimension?: string
          human_summary?: string | null
          id?: string
          last_computed_at?: string
          lift_pct?: number | null
          metric?: string
          observed?: number | null
          sample_size?: number | null
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_trends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_reports: {
        Row: {
          campaign_id: string | null
          cause: string | null
          change_recommendation: string | null
          created_at: string
          cta_verdict: string | null
          emoji_verdict: string | null
          hashtag_verdict: string | null
          hook_verdict: string | null
          id: string
          length_verdict: string | null
          objective_score: number | null
          prediction_delta: Json | null
          raw: Json | null
          run_id: string
          time_of_day_verdict: string | null
          user_id: string
          worked: boolean | null
        }
        Insert: {
          campaign_id?: string | null
          cause?: string | null
          change_recommendation?: string | null
          created_at?: string
          cta_verdict?: string | null
          emoji_verdict?: string | null
          hashtag_verdict?: string | null
          hook_verdict?: string | null
          id?: string
          length_verdict?: string | null
          objective_score?: number | null
          prediction_delta?: Json | null
          raw?: Json | null
          run_id: string
          time_of_day_verdict?: string | null
          user_id: string
          worked?: boolean | null
        }
        Update: {
          campaign_id?: string | null
          cause?: string | null
          change_recommendation?: string | null
          created_at?: string
          cta_verdict?: string | null
          emoji_verdict?: string | null
          hashtag_verdict?: string | null
          hook_verdict?: string | null
          id?: string
          length_verdict?: string | null
          objective_score?: number | null
          prediction_delta?: Json | null
          raw?: Json | null
          run_id?: string
          time_of_day_verdict?: string | null
          user_id?: string
          worked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          meta: Json | null
          module: string | null
          run_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          level?: string
          message: string
          meta?: Json | null
          module?: string | null
          run_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          level?: string
          message?: string
          meta?: Json | null
          module?: string | null
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_insights: {
        Row: {
          active: boolean
          applicable_topics: string[] | null
          campaign_id: string | null
          category: Database["public"]["Enums"]["insight_category"]
          channel_id: string | null
          confidence: number
          contradiction_count: number
          created_at: string
          id: string
          insight: string
          last_reinforced_at: string
          last_success_at: string | null
          platform: string | null
          support_count: number
          supporting_run_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          applicable_topics?: string[] | null
          campaign_id?: string | null
          category: Database["public"]["Enums"]["insight_category"]
          channel_id?: string | null
          confidence?: number
          contradiction_count?: number
          created_at?: string
          id?: string
          insight: string
          last_reinforced_at?: string
          last_success_at?: string | null
          platform?: string | null
          support_count?: number
          supporting_run_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          applicable_topics?: string[] | null
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["insight_category"]
          channel_id?: string | null
          confidence?: number
          contradiction_count?: number
          created_at?: string
          id?: string
          insight?: string
          last_reinforced_at?: string
          last_success_at?: string | null
          platform?: string | null
          support_count?: number
          supporting_run_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_insights_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_insights_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics: {
        Row: {
          campaign_id: string | null
          comments: number | null
          fetched_at: string
          id: string
          impressions: number | null
          likes: number | null
          published_post_id: string
          raw: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          user_id: string
          views: number | null
        }
        Insert: {
          campaign_id?: string | null
          comments?: number | null
          fetched_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          published_post_id: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
          views?: number | null
        }
        Update: {
          campaign_id?: string | null
          comments?: number | null
          fetched_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          published_post_id?: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_analytics_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "published_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          accuracy_score: number | null
          actual_comments: number | null
          actual_likes: number | null
          actual_reach: number | null
          actual_saves: number | null
          actual_shares: number | null
          actual_views: number | null
          campaign_id: string | null
          confidence: number | null
          created_at: string
          evaluated_at: string | null
          id: string
          predicted_comments: number | null
          predicted_likes: number | null
          predicted_reach: number | null
          predicted_saves: number | null
          predicted_shares: number | null
          predicted_views: number | null
          rationale: string | null
          raw: Json | null
          run_id: string | null
          user_id: string
        }
        Insert: {
          accuracy_score?: number | null
          actual_comments?: number | null
          actual_likes?: number | null
          actual_reach?: number | null
          actual_saves?: number | null
          actual_shares?: number | null
          actual_views?: number | null
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string
          evaluated_at?: string | null
          id?: string
          predicted_comments?: number | null
          predicted_likes?: number | null
          predicted_reach?: number | null
          predicted_saves?: number | null
          predicted_shares?: number | null
          predicted_views?: number | null
          rationale?: string | null
          raw?: Json | null
          run_id?: string | null
          user_id: string
        }
        Update: {
          accuracy_score?: number | null
          actual_comments?: number | null
          actual_likes?: number | null
          actual_reach?: number | null
          actual_saves?: number | null
          actual_shares?: number | null
          actual_views?: number | null
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string
          evaluated_at?: string | null
          id?: string
          predicted_comments?: number | null
          predicted_likes?: number | null
          predicted_reach?: number | null
          predicted_saves?: number | null
          predicted_shares?: number | null
          predicted_views?: number | null
          rationale?: string | null
          raw?: Json | null
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          active: boolean
          caption_prompt: string
          created_at: string
          id: string
          learning_prompt: string
          name: string
          notes: string | null
          user_id: string | null
          version: number
          vision_prompt: string
        }
        Insert: {
          active?: boolean
          caption_prompt: string
          created_at?: string
          id?: string
          learning_prompt: string
          name: string
          notes?: string | null
          user_id?: string | null
          version: number
          vision_prompt: string
        }
        Update: {
          active?: boolean
          caption_prompt?: string
          created_at?: string
          id?: string
          learning_prompt?: string
          name?: string
          notes?: string | null
          user_id?: string | null
          version?: number
          vision_prompt?: string
        }
        Relationships: []
      }
      published_posts: {
        Row: {
          buffer_post_id: string | null
          buffer_status: string | null
          campaign_id: string | null
          channel_id: string | null
          created_at: string
          due_at: string | null
          id: string
          metrics_updated_at: string | null
          permalink: string | null
          platform: string | null
          posted_at: string | null
          raw: Json | null
          run_id: string | null
          source: string
          text_content: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          buffer_post_id?: string | null
          buffer_status?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          metrics_updated_at?: string | null
          permalink?: string | null
          platform?: string | null
          posted_at?: string | null
          raw?: Json | null
          run_id?: string | null
          source?: string
          text_content?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          buffer_post_id?: string | null
          buffer_status?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          metrics_updated_at?: string | null
          permalink?: string | null
          platform?: string | null
          posted_at?: string | null
          raw?: Json | null
          run_id?: string | null
          source?: string
          text_content?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "published_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_posts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          attempts: number
          campaign_id: string | null
          channel_id: string | null
          created_at: string
          current_step: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string | null
          next_strategy: string | null
          prediction_id: string | null
          prompt_version_id: string | null
          queue_item_id: string | null
          run_number: number
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
          step_state: Json
          strategy_id: string | null
          strategy_used: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          current_step?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          next_strategy?: string | null
          prediction_id?: string | null
          prompt_version_id?: string | null
          queue_item_id?: string | null
          run_number: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          step_state?: Json
          strategy_id?: string | null
          strategy_used?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string
          current_step?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          next_strategy?: string | null
          prediction_id?: string | null
          prompt_version_id?: string | null
          queue_item_id?: string | null
          run_number?: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          step_state?: Json
          strategy_id?: string | null
          strategy_used?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "video_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          active: boolean
          campaign_id: string | null
          channel_id: string
          created_at: string
          custom_scheduled_at: string | null
          daily_times: string[]
          id: string
          interval_hours: number | null
          last_run_at: string | null
          mode: Database["public"]["Enums"]["schedule_mode"]
          next_run_at: string | null
          paused: boolean
          publish_delay_minutes: number | null
          publish_mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          channel_id: string
          created_at?: string
          custom_scheduled_at?: string | null
          daily_times?: string[]
          id?: string
          interval_hours?: number | null
          last_run_at?: string | null
          mode?: Database["public"]["Enums"]["schedule_mode"]
          next_run_at?: string | null
          paused?: boolean
          publish_delay_minutes?: number | null
          publish_mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          channel_id?: string
          created_at?: string
          custom_scheduled_at?: string | null
          daily_times?: string[]
          id?: string
          interval_hours?: number | null
          last_run_at?: string | null
          mode?: Database["public"]["Enums"]["schedule_mode"]
          next_run_at?: string | null
          paused?: boolean
          publish_delay_minutes?: number | null
          publish_mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          analytics_delay_h: number
          created_at: string
          id: string
          max_retries: number
          notifications: Json
          rate_limit_per_min: number
          retry_interval_s: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analytics_delay_h?: number
          created_at?: string
          id?: string
          max_retries?: number
          notifications?: Json
          rate_limit_per_min?: number
          retry_interval_s?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analytics_delay_h?: number
          created_at?: string
          id?: string
          max_retries?: number
          notifications?: Json
          rate_limit_per_min?: number
          retry_interval_s?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          campaign_id: string | null
          caption_length: string | null
          created_at: string
          cta_type: string | null
          education_level: string | null
          emoji_level: string | null
          hashtag_count: number | null
          hook_style: string | null
          id: string
          memory_refs: string[] | null
          objective: string | null
          posting_time_hint: string | null
          raw: Json | null
          reasoning: string | null
          run_id: string | null
          storytelling: boolean | null
          tone: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          caption_length?: string | null
          created_at?: string
          cta_type?: string | null
          education_level?: string | null
          emoji_level?: string | null
          hashtag_count?: number | null
          hook_style?: string | null
          id?: string
          memory_refs?: string[] | null
          objective?: string | null
          posting_time_hint?: string | null
          raw?: Json | null
          reasoning?: string | null
          run_id?: string | null
          storytelling?: boolean | null
          tone?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          caption_length?: string | null
          created_at?: string
          cta_type?: string | null
          education_level?: string | null
          emoji_level?: string | null
          hashtag_count?: number | null
          hook_style?: string | null
          id?: string
          memory_refs?: string[] | null
          objective?: string | null
          posting_time_hint?: string | null
          raw?: Json | null
          reasoning?: string | null
          run_id?: string | null
          storytelling?: boolean | null
          tone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_analyses: {
        Row: {
          actions: string[] | null
          campaign_id: string | null
          created_at: string
          emotions: string[] | null
          id: string
          message: string | null
          objects: string[] | null
          people: string | null
          raw: Json | null
          run_id: string
          scene: string | null
          story: string | null
          summary: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          actions?: string[] | null
          campaign_id?: string | null
          created_at?: string
          emotions?: string[] | null
          id?: string
          message?: string | null
          objects?: string[] | null
          people?: string | null
          raw?: Json | null
          run_id: string
          scene?: string | null
          story?: string | null
          summary?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          actions?: string[] | null
          campaign_id?: string | null
          created_at?: string
          emotions?: string[] | null
          id?: string
          message?: string | null
          objects?: string[] | null
          people?: string | null
          raw?: Json | null
          run_id?: string
          scene?: string | null
          story?: string | null
          summary?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_analyses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_queue: {
        Row: {
          added_at: string
          attempts: number
          campaign_id: string | null
          channel_id: string | null
          cloudinary_url: string
          dead_letter_at: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          last_error_module: string | null
          max_attempts: number
          position: number
          processed_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          user_id: string
        }
        Insert: {
          added_at?: string
          attempts?: number
          campaign_id?: string | null
          channel_id?: string | null
          cloudinary_url: string
          dead_letter_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          last_error_module?: string | null
          max_attempts?: number
          position: number
          processed_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id: string
        }
        Update: {
          added_at?: string
          attempts?: number
          campaign_id?: string | null
          channel_id?: string | null
          cloudinary_url?: string
          dead_letter_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          last_error_module?: string | null
          max_attempts?: number
          position?: number
          processed_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      release_channel_lock: {
        Args: { _channel_id: string; _run_id: string }
        Returns: undefined
      }
      try_claim_channel_lock: {
        Args: { _channel_id: string; _run_id: string; _ttl_seconds: number }
        Returns: boolean
      }
    }
    Enums: {
      analysis_scope:
        | "last_n"
        | "top_n"
        | "highest_engagement"
        | "highest_views"
        | "highest_saves"
        | "all"
        | "custom"
      channel_objective:
        | "followers"
        | "likes"
        | "comments"
        | "shares"
        | "saves"
        | "watch_time"
        | "profile_visits"
        | "ctr"
        | "reach"
        | "engagement"
        | "brand_awareness"
        | "custom"
      insight_category:
        | "hook"
        | "length"
        | "emoji"
        | "hashtag"
        | "cta"
        | "topic"
        | "style"
        | "timing"
        | "other"
      queue_status:
        | "pending"
        | "processing"
        | "done"
        | "failed"
        | "skipped"
        | "dead_letter"
      run_status:
        | "pending"
        | "analyzing"
        | "generating"
        | "publishing"
        | "awaiting_analytics"
        | "complete"
        | "failed"
        | "stale"
      schedule_mode: "interval" | "daily_times" | "manual"
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
      analysis_scope: [
        "last_n",
        "top_n",
        "highest_engagement",
        "highest_views",
        "highest_saves",
        "all",
        "custom",
      ],
      channel_objective: [
        "followers",
        "likes",
        "comments",
        "shares",
        "saves",
        "watch_time",
        "profile_visits",
        "ctr",
        "reach",
        "engagement",
        "brand_awareness",
        "custom",
      ],
      insight_category: [
        "hook",
        "length",
        "emoji",
        "hashtag",
        "cta",
        "topic",
        "style",
        "timing",
        "other",
      ],
      queue_status: [
        "pending",
        "processing",
        "done",
        "failed",
        "skipped",
        "dead_letter",
      ],
      run_status: [
        "pending",
        "analyzing",
        "generating",
        "publishing",
        "awaiting_analytics",
        "complete",
        "failed",
        "stale",
      ],
      schedule_mode: ["interval", "daily_times", "manual"],
    },
  },
} as const
