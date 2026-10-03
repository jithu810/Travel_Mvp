// Foundation schema types. Regenerate from Supabase after applying migrations.
type Timestamped = { created_at: string; updated_at: string };
type Profile = Timestamped & { id: string; username: string | null; display_name: string | null; avatar_path: string | null; bio: string | null };
type Journey = Timestamped & { id: string; user_id: string; title: string; description: string | null; status: "draft" | "published"; published_at: string | null; cover_image_path: string | null; destination_slug: string | null; destination_name: string | null; destination_latitude: number | null; destination_longitude: number | null; traveler_type: "solo" | "couple" | "friends" | "family" | null; duration_days: number; is_demo: boolean; copied_from_journey_id: string | null };
type JourneyStop = Timestamped & { id: string; journey_id: string; sequence: number; name: string; description: string | null; latitude: number | null; longitude: number | null; mapbox_place_id: string | null; photo_path: string | null; rating: number | null; day_number: number | null };
type Interaction = { user_id: string; journey_id: string; created_at: string };
type TravelTrack = Timestamped & { id: string; journey_id: string; user_id: string; status: string; started_at: string; ended_at: string | null; distance_meters: number; duration_seconds: number; points: Json; revision: number; last_payload: Json };

type Table<Row, Required extends keyof Row, Relationships extends { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] }[]> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      travel_tracks: Table<TravelTrack, "id" | "journey_id" | "user_id" | "status" | "started_at", []>;
      profiles: Table<Profile, "id", []>;
      journeys: Table<Journey, "user_id" | "title", [{ foreignKeyName: "journeys_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]>;
      journey_stops: Table<JourneyStop, "journey_id" | "sequence" | "name", [{ foreignKeyName: "journey_stops_journey_id_fkey"; columns: ["journey_id"]; isOneToOne: false; referencedRelation: "journeys"; referencedColumns: ["id"] }]>;
      journey_likes: Table<Interaction, "user_id" | "journey_id", [{ foreignKeyName: "journey_likes_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "journey_likes_journey_id_fkey"; columns: ["journey_id"]; isOneToOne: false; referencedRelation: "journeys"; referencedColumns: ["id"] }]>;
      saved_journeys: Table<Interaction, "user_id" | "journey_id", [{ foreignKeyName: "saved_journeys_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "saved_journeys_journey_id_fkey"; columns: ["journey_id"]; isOneToOne: false; referencedRelation: "journeys"; referencedColumns: ["id"] }]>;
    };
    Views: { [_ in never]: never };
    Functions: {
      append_travel_track: { Args: { payload: Json }; Returns: Json };
      get_public_profile: { Args: { handle: string }; Returns: Json };
      get_account_journeys: { Args: { owner_id?: string; collection?: string }; Returns: Json[] };
      get_public_journeys: { Args: { destination_filter?: string; traveler_filter?: string; journey_filter?: string }; Returns: Json[] };
      get_journey_detail: { Args: { target_id: string }; Returns: Json };
      save_journey: { Args: { payload: Json }; Returns: Json };
      copy_journey: { Args: { source_id: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
