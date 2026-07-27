// Hand-derived from supabase/migrations (through 0013_fix_normalize_text_trim.sql)
// because generating this via `supabase gen types typescript --local` requires
// a working local stack, and `supabase start` currently fails applying
// 0012_batch_delete_triggers.sql locally ("must be owner of table objects"
// creating an index on storage.objects) -- a local-dev-only permissions gap,
// unrelated to this file's contents.
//
// Regenerate for real once that's fixed:
//   supabase gen types typescript --local > web/src/app/data/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          place: string | null;
          tags: string[];
          // Generated (stored) from tags via join_tags(); read-only.
          tags_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          description?: string | null;
          place?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          place?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_categories: {
        Row: {
          item_id: string;
          category_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          item_id: string;
          category_id: string;
          user_id?: string;
          created_at?: string;
        };
        Update: {
          item_id?: string;
          category_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_categories_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_categories_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      normalize_text: {
        Args: { txt: string };
        Returns: string;
      };
      join_tags: {
        Args: { tags: string[] };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
