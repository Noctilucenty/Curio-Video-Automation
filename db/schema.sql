-- Postgres/Supabase-compatible schema for curio-automation.
-- The dev server uses a JSON snapshot (data/automation.json); this schema is the
-- contract for the production adapter. Column names mirror the API wire format.

-- The current Postgres adapter persists the complete repository contract in a
-- single atomic JSONB row. This includes immutable prompt/model traces,
-- platform-separated metrics, human gates, and versioned over-time analyses.
-- Normalized tables below remain the migration contract for larger deployments.
create table if not exists curio_app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists topics (
  id text primary key,
  topic text not null,
  category text not null default 'general',
  target_platform text not null default 'tiktok' check (target_platform in ('tiktok','reels','shorts')),
  tone text not null default 'calm, premium, mysterious',
  -- Mirrors the API's clampLength [10,45]; app default is 15 (12-16s policy).
  target_length_seconds int not null default 15 check (target_length_seconds between 10 and 45),
  language text not null default 'en',
  format text not null default 'narrated' check (format in ('narrated','card')),
  source_ref text,
  status text not null default 'queued' check (status in ('queued','used','archived')),
  created_at timestamptz not null default now()
);
-- Format routing + 12-16s length policy (2026-07-12): format controls the
-- card freeze and renderer selection; the old 20-45s check rejected the
-- current default.
alter table topics add column if not exists format text not null default 'narrated'
  check (format in ('narrated','card'));
alter table topics alter column target_length_seconds set default 15;
alter table topics drop constraint if exists topics_target_length_seconds_check;
alter table topics add constraint topics_target_length_seconds_check
  check (target_length_seconds between 10 and 45);

create table if not exists videos (
  id text primary key,
  topic_id text references topics(id),
  status text not null default 'draft' check (status in
    ('draft','generated','needs_revision','ready_for_review','approved','published','rejected','failed')),
  attempts int not null default 0,
  format text not null default 'narrated' check (format in ('narrated','card')),
  package jsonb,            -- full OpenAI video package (hooks, script, caption_lines, copy)
  judge jsonb,              -- latest judge scores + problems + fix + pass
  applied_rule_ids jsonb,   -- generator rules active at generation time (rule-cohort validation)
  render_provider text,     -- 'heygen' | 'local' | 'mock'
  render_status text,       -- 'not_started' | 'rendering' | 'completed' | 'failed'
  provider_video_id text,
  video_url text,
  error text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists videos_status_idx on videos(status);
alter table videos add column if not exists applied_rule_ids jsonb;
alter table videos add column if not exists format text not null default 'narrated'
  check (format in ('narrated','card'));

-- Every LLM call: prompt A/B trail + future fine-tuning dataset.
create table if not exists prompt_versions (
  id text primary key,
  video_id text not null,   -- video id, or learning run id for kind='learning'
  kind text not null check (kind in ('package','judge','factcheck','learning','ingest')),
  prompt_version text not null,
  model text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists prompt_versions_video_idx on prompt_versions(video_id);
alter table prompt_versions drop constraint if exists prompt_versions_kind_check;
alter table prompt_versions add constraint prompt_versions_kind_check
  check (kind in ('package','judge','factcheck','learning','ingest'));

create table if not exists performance_metrics (
  id text primary key,
  video_id text not null references videos(id),
  platform text not null check (platform in ('tiktok','reels','shorts')),
  views bigint not null default 0,
  avg_watch_time real not null default 0,
  completion_rate real not null default 0 check (completion_rate between 0 and 1),
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  follows bigint not null default 0,
  profile_clicks bigint not null default 0,
  skip_rate real check (skip_rate between 0 and 1),
  app_downloads bigint,
  posted_at timestamptz not null,
  ingested_at timestamptz not null default now()
);
create index if not exists performance_metrics_video_idx on performance_metrics(video_id);
alter table performance_metrics add column if not exists skip_rate real check (skip_rate between 0 and 1);
-- Platform separation + provenance (2026-07-12): IG and FB must never share a
-- denominator, and learning excludes synthetic (dev/mock-era) rows.
alter table performance_metrics add column if not exists surface text
  check (surface in ('instagram','facebook','tiktok','youtube'));
alter table performance_metrics add column if not exists reach bigint;
alter table performance_metrics add column if not exists provenance text
  check (provenance in ('real','synthetic'));

-- Content rules the generator obeys; learning runs supersede their predecessors.
-- category 'calibration' rules tune the JUDGE (predicted vs actual), not the generator.
create table if not exists learning_rules (
  id text primary key,
  category text not null check (category in ('hook','caption','topic','structure','tone','length','calibration')),
  rule text not null,
  source text not null check (source in ('seed','learning_run','manual')),
  active boolean not null default true,
  run_id text,
  created_at timestamptz not null default now()
);
create index if not exists learning_rules_active_idx on learning_rules(active);
alter table learning_rules drop constraint if exists learning_rules_category_check;
alter table learning_rules add constraint learning_rules_category_check
  check (category in ('hook','caption','topic','structure','tone','length','calibration'));

create table if not exists learning_runs (
  id text primary key,
  analyzed_videos int not null,
  top_patterns jsonb not null default '[]',
  weak_patterns jsonb not null default '[]',
  hook_formulas jsonb not null default '[]',
  recommended_topics jsonb not null default '[]',
  caption_recommendations jsonb not null default '[]',
  platform_notes jsonb not null default '[]',
  judge_calibration_notes jsonb not null default '[]',
  best_length_seconds int,
  best_categories jsonb not null default '[]',
  best_tone text,
  new_rule_ids jsonb not null default '[]',
  improvement_delta real,          -- avg engagement after prev run minus before
  previous_run_id text,
  prompt_version text not null,
  model text not null,
  created_at timestamptz not null default now()
);
alter table learning_runs add column if not exists platform_notes jsonb not null default '[]';
alter table learning_runs add column if not exists judge_calibration_notes jsonb not null default '[]';
alter table learning_runs add column if not exists improvement_delta real;
alter table learning_runs add column if not exists previous_run_id text;
