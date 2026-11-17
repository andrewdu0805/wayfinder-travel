-- ============================================================================
-- Google Antigravity 智慧旅遊景點分類與動態行程串聯 App
-- Migration: 001_init_places_schema.sql (方便更新強化版：彈性分類 + 智慧 Upsert + 地區歸檔)
-- ============================================================================

-- 1. 啟用 PostGIS 擴充套件
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- 2. 建立彈性分類與預設停留時間設定表（取代寫死的 PostgreSQL ENUM，讓前端隨時可新增/修改分類）
create table if not exists public.category_configs (
  id text primary key,
  primary_category text not null,
  primary_label text not null,
  sub_category text not null unique,
  sub_label text not null,
  default_stay_mins integer not null default 60,
  icon_name text default 'MapPin',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 寫入預設分類設定
insert into public.category_configs (id, primary_category, primary_label, sub_category, sub_label, default_stay_mins, icon_name, sort_order)
values
  ('restaurant:meal', 'restaurant', '餐廳與飲食', 'meal', '正餐', 90, 'Utensils', 10),
  ('restaurant:snack_dessert', 'restaurant', '餐廳與飲食', 'snack_dessert', '點心／下午茶', 45, 'Coffee', 20),
  ('restaurant:souvenir', 'restaurant', '餐廳與飲食', 'souvenir', '伴手禮／名產', 20, 'Gift', 30),
  ('museum_culture:museum', 'museum_culture', '展館與文化', 'museum', '博物館／美術館', 120, 'Landmark', 40),
  ('museum_culture:landmark', 'museum_culture', '展館與文化', 'landmark', '文化古蹟／地標', 60, 'Compass', 50),
  ('theme_park_leisure:amusement_park', 'theme_park_leisure', '遊樂園與休閒', 'amusement_park', '遊樂園／主題園區', 240, 'FerrisWheel', 60),
  ('nature_outdoor:trail', 'nature_outdoor', '自然與戶外', 'trail', '自然步道／景觀', 90, 'Trees', 70),
  ('shopping:other', 'shopping', '購物與市集', 'other', '商圈／市集／選物', 60, 'ShoppingBag', 80)
on conflict (sub_category) do nothing;

-- 3. 建立個人景點收藏主表（使用彈性 text + check 約束，支援地區分組與營業狀態更新）
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name text not null,
  formatted_address text,
  country text default '台灣',
  city text default '高雄市',
  district text default '',
  location extensions.geography(Point, 4326) not null,
  latitude double precision generated always as (extensions.ST_Y(location::extensions.geometry)) stored,
  longitude double precision generated always as (extensions.ST_X(location::extensions.geometry)) stored,
  primary_category text not null default 'restaurant',
  sub_category text not null default 'meal',
  visit_status text not null default 'unvisited' check (visit_status in ('unvisited', 'visited_revisit', 'visited_skip')),
  business_status text not null default 'OPERATIONAL', -- OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
  estimated_stay_mins integer not null default 60,
  rating numeric(2,1),
  opening_hours_json jsonb,
  google_maps_url text,
  source_text text,
  user_notes text,
  custom_tags text[] default '{}',
  last_visited_at date,
  hours_updated_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 建立空間索引、分類索引與城市索引以加速查詢與批次更新
create index if not exists idx_saved_places_location
  on public.saved_places using gist (location);

create index if not exists idx_saved_places_categories
  on public.saved_places (primary_category, sub_category, visit_status);

create index if not exists idx_saved_places_region
  on public.saved_places (country, city, district);

-- 4. 建立智慧增量合併 (Smart Upsert) RPC 函數：
-- 當重複貼上已存在的 google_place_id 時，自動更新最新營業時間與評分，保留使用者原本設定的 visit_status 與分類，並附加新備註
create or replace function public.upsert_saved_place(
  p_google_place_id text,
  p_name text,
  p_formatted_address text,
  p_country text,
  p_city text,
  p_district text,
  p_lat double precision,
  p_lng double precision,
  p_primary_category text,
  p_sub_category text,
  p_visit_status text,
  p_estimated_stay_mins integer,
  p_rating numeric,
  p_opening_hours_json jsonb,
  p_google_maps_url text,
  p_user_notes text,
  p_custom_tags text[]
)
returns public.saved_places
language plpgsql
as $$
declare
  v_result public.saved_places;
begin
  insert into public.saved_places (
    google_place_id, name, formatted_address, country, city, district,
    location, primary_category, sub_category, visit_status,
    estimated_stay_mins, rating, opening_hours_json, google_maps_url,
    user_notes, custom_tags, hours_updated_at, updated_at
  )
  values (
    p_google_place_id, p_name, p_formatted_address, p_country, p_city, p_district,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography,
    p_primary_category, p_sub_category, p_visit_status,
    p_estimated_stay_mins, p_rating, p_opening_hours_json, p_google_maps_url,
    p_user_notes, coalesce(p_custom_tags, '{}'), now(), now()
  )
  on conflict (google_place_id) do update set
    formatted_address = coalesce(excluded.formatted_address, public.saved_places.formatted_address),
    rating = coalesce(excluded.rating, public.saved_places.rating),
    opening_hours_json = coalesce(excluded.opening_hours_json, public.saved_places.opening_hours_json),
    google_maps_url = coalesce(excluded.google_maps_url, public.saved_places.google_maps_url),
    user_notes = case
      when excluded.user_notes is null or excluded.user_notes = '' then public.saved_places.user_notes
      when public.saved_places.user_notes is null or public.saved_places.user_notes = '' then excluded.user_notes
      when position(excluded.user_notes in public.saved_places.user_notes) > 0 then public.saved_places.user_notes
      else public.saved_places.user_notes || ' | ' || excluded.user_notes
    end,
    custom_tags = array(
      select distinct unnest(public.saved_places.custom_tags || coalesce(excluded.custom_tags, '{}'))
    ),
    hours_updated_at = now(),
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- 5. 建立抵達當地周邊篩選 RPC 函數（排除已歇業店家與 visited_skip）
create or replace function public.find_nearby_candidate_places(
  user_lat double precision,
  user_lng double precision,
  radius_meters double precision default 5000,
  allowed_statuses text[] default array['unvisited', 'visited_revisit']
)
returns table (
  id uuid,
  google_place_id text,
  name text,
  formatted_address text,
  country text,
  city text,
  district text,
  primary_category text,
  sub_category text,
  visit_status text,
  business_status text,
  estimated_stay_mins integer,
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  rating numeric,
  opening_hours_json jsonb,
  google_maps_url text,
  user_notes text,
  custom_tags text[],
  hours_updated_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    p.google_place_id,
    p.name,
    p.formatted_address,
    p.country,
    p.city,
    p.district,
    p.primary_category,
    p.sub_category,
    p.visit_status,
    p.business_status,
    p.estimated_stay_mins,
    p.latitude,
    p.longitude,
    extensions.ST_Distance(
      p.location,
      extensions.ST_SetSRID(extensions.ST_MakePoint(user_lng, user_lat), 4326)::extensions.geography
    ) as distance_meters,
    p.rating,
    p.opening_hours_json,
    p.google_maps_url,
    p.user_notes,
    p.custom_tags,
    p.hours_updated_at
  from public.saved_places p
  where p.visit_status = any(allowed_statuses)
    and p.business_status != 'CLOSED_PERMANENTLY'
    and extensions.ST_DWithin(
      p.location,
      extensions.ST_SetSRID(extensions.ST_MakePoint(user_lng, user_lat), 4326)::extensions.geography,
      radius_meters
    )
  order by distance_meters asc;
$$;
