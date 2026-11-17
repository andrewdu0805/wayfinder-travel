export type VisitStatus = 'unvisited' | 'visited_revisit' | 'visited_skip';

export type BusinessStatus =
  | 'OPERATIONAL'
  | 'CLOSED_TEMPORARILY'
  | 'CLOSED_PERMANENTLY';

export type TravelMode = 'WALK' | 'SCOOTER' | 'TRANSIT' | 'DRIVE';

export interface CategoryConfig {
  id: string; // e.g. 'restaurant:meal'
  primary_category: string; // e.g. 'restaurant'
  primary_label: string; // e.g. '餐廳與飲食'
  sub_category: string; // e.g. 'meal'
  sub_label: string; // e.g. '正餐'
  default_stay_mins: number;
  icon_name: string;
  sort_order: number;
}

export interface OpeningHoursJson {
  open_now?: boolean;
  weekday_descriptions?: string[];
  /** Daily open/close hours in 24h format e.g. { open: "10:00", close: "21:00" } */
  daily_hours?: {
    open: string;
    close: string;
    closed_days?: number[]; // 0 = Sunday, 1 = Monday, ...
  };
}

export interface SavedPlace {
  id: string;
  google_place_id: string;
  name: string;
  formatted_address: string;
  country: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  primary_category: string;
  sub_category: string;
  visit_status: VisitStatus;
  business_status: BusinessStatus;
  estimated_stay_mins: number;
  rating: number | null;
  opening_hours_json: OpeningHoursJson | null;
  google_maps_url: string;
  user_notes: string;
  custom_tags: string[];
  last_visited_at: string | null;
  hours_updated_at: string;
  created_at: string;
  updated_at: string;
  distance_meters?: number;
}

export interface UpsertActionRecord {
  place: SavedPlace;
  action: 'created' | 'updated_existing';
  previousVisitStatus?: VisitStatus;
  mergedNotes?: boolean;
}

export interface IntentStepBlock {
  id: string;
  label: string;
  primary_category?: string;
  sub_category?: string;
  only_unvisited?: boolean;
}

export interface ItineraryStop {
  stop_order: number;
  place: SavedPlace;
  arrival_time: string; // "14:00"
  departure_time: string; // "16:00"
  stay_mins: number;
  travel_mins_from_prev: number;
  distance_meters_from_prev: number;
  is_open_at_arrival: boolean;
  open_status_note: string;
  ai_reason: string;
  /** Same-category nearby alternatives for 1-tap swap on the timeline */
  alternatives: Array<{
    place: SavedPlace;
    distance_from_prev_meters: number;
    travel_mins_from_prev: number;
    open_status_note: string;
  }>;
}

export interface ItineraryPlan {
  id: string;
  title: string;
  subtitle: string;
  total_duration_mins: number;
  total_travel_mins: number;
  total_distance_meters: number;
  travel_mode: TravelMode;
  start_time: string;
  return_departure_time?: string | null;
  origin: {
    name: string;
    latitude: number;
    longitude: number;
  };
  end_anchor?: {
    name: string;
    anchor_type?: 'hotel' | 'hsr' | 'train';
    latitude: number;
    longitude: number;
    distance_from_last_stop_meters: number;
    travel_mins_from_last_stop: number;
    arrival_time: string;
    return_departure_time?: string | null;
    must_arrive_by?: string | null;
    buffer_mins_remaining?: number | null;
    time_fit_note?: string | null;
  } | null;
  stops: ItineraryStop[];
  google_maps_nav_url: string;
  refreshed_candidates_count: number;
  excluded_closed_places: Array<{
    name: string;
    reason: string;
  }>;
}

export interface AppSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  googleMapsApiKey: string;
  geminiApiKey: string;
  autoRefreshHoursOnPlan: boolean;
  defaultTravelMode: TravelMode;
  defaultRadiusMeters: number;
}
