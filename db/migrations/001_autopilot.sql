-- 001_autopilot.sql — durable control plane for one-click Autopilot runs.
--
-- ADDITIVE ONLY. The existing tables (topics, videos, prompt_versions,
-- performance_metrics, learning_rules, learning_runs) are untouched; this migration
-- only adds new tables and is safe to run against a populated database.
--
-- Design premise: Postgres is the single source of truth for run state. Redis/BullMQ
-- carries IDs only. If Redis is wiped, runs are recoverable; if a worker dies
-- mid-stage, the lease expires and another worker resumes from the last COMPLETED
-- stage — without repeating a paid provider call, because provider_calls records the
-- provider's own operation id before the result is known.

begin;

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------
create table if not exists autopilot_runs (
  id                  uuid primary key,
  -- Idempotency: the dashboard sends a key per button press. A double-click reuses
  -- the same key, so the second POST returns the SAME run instead of starting a
  -- second paid production.
  idempotency_key     text unique,
  state               text not null,
  previous_state      text,
  config              jsonb not null default '{}'::jsonb,
  -- denormalised for cheap dashboard listing
  topic_id            text,
  topic_title         text,
  budget_usd          numeric(10,4) not null default 0,
  spent_usd           numeric(10,4) not null default 0,
  dry_run             boolean not null default false,
  correction_passes   int not null default 0,
  max_correction_passes int not null default 1,
  blocker_code        text,
  blocker_detail      text,
  error               text,
  cancel_requested    boolean not null default false,
  pause_requested     boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz
);
create index if not exists autopilot_runs_state_idx   on autopilot_runs (state);
create index if not exists autopilot_runs_created_idx on autopilot_runs (created_at desc);

-- ---------------------------------------------------------------------------
-- stages — one row per stage per run; the resume ledger
-- ---------------------------------------------------------------------------
create table if not exists autopilot_stages (
  id            bigserial primary key,
  run_id        uuid not null references autopilot_runs(id) on delete cascade,
  stage         text not null,
  status        text not null default 'pending',   -- pending|running|completed|failed|skipped
  attempt       int  not null default 0,
  -- lease: a worker claims a stage for lease_expires_at; heartbeats extend it. A
  -- crashed worker's lease simply expires and the stage becomes claimable again.
  lease_owner   text,
  lease_expires_at timestamptz,
  heartbeat_at  timestamptz,
  input         jsonb,
  output        jsonb,
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (run_id, stage)
);
create index if not exists autopilot_stages_run_idx   on autopilot_stages (run_id);
create index if not exists autopilot_stages_lease_idx on autopilot_stages (status, lease_expires_at);

-- ---------------------------------------------------------------------------
-- provider_calls — the duplicate-spend guard AND the cost ledger
-- ---------------------------------------------------------------------------
create table if not exists provider_calls (
  id              bigserial primary key,
  run_id          uuid not null references autopilot_runs(id) on delete cascade,
  stage           text not null,
  provider        text not null,           -- openai|elevenlabs|gemini|captions|youtube
  model           text,
  -- dedupe_key is a hash of (run, stage, provider, semantic inputs). UNIQUE, so a
  -- retry after a restart cannot bill twice: the insert conflicts and we reuse the
  -- recorded operation/result instead of calling the provider again.
  dedupe_key      text not null unique,
  operation_id    text,                    -- the PROVIDER's id, recorded before polling
  status          text not null default 'started', -- started|succeeded|failed
  attempt         int not null default 1,
  prompt          text,
  reason          text,                    -- why this generation was necessary
  estimated_usd   numeric(10,4) not null default 0,
  actual_usd      numeric(10,4),
  response_meta   jsonb,
  verdict         text,                    -- used|rejected
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists provider_calls_run_idx on provider_calls (run_id);

-- ---------------------------------------------------------------------------
-- artifacts — object-storage pointers with full lineage
-- ---------------------------------------------------------------------------
create table if not exists autopilot_artifacts (
  id            bigserial primary key,
  run_id        uuid not null references autopilot_runs(id) on delete cascade,
  stage         text not null,
  kind          text not null,            -- master|captioned|audio|stem|sheet|report|...
  storage_key   text not null,
  storage_driver text not null default 'local',
  mime_type     text,
  bytes         bigint,
  sha256        text,
  width         int,
  height        int,
  duration_s    numeric(10,3),
  -- how it was made: real footage | licensed stock | gpt-image | veo | local render.
  -- Drives the mandatory AI-disclosure metadata on delivery.
  provenance    jsonb,
  lineage       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists autopilot_artifacts_run_idx on autopilot_artifacts (run_id);

-- ---------------------------------------------------------------------------
-- topic candidates + scorecards (the rejected alternatives are evidence)
-- ---------------------------------------------------------------------------
create table if not exists topic_candidates (
  id            bigserial primary key,
  run_id        uuid not null references autopilot_runs(id) on delete cascade,
  title         text not null,
  angle         text,
  category      text,
  source        text,                     -- youtube|ledger|patterns|history
  evidence      jsonb,
  scores        jsonb,                    -- full per-dimension scorecard
  penalties     jsonb,
  total_score   numeric(10,4),
  chosen        boolean not null default false,
  reject_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists topic_candidates_run_idx on topic_candidates (run_id, total_score desc);

-- ---------------------------------------------------------------------------
-- claims — the fact map; a failed claim blocks BEFORE paid generation
-- ---------------------------------------------------------------------------
create table if not exists autopilot_claims (
  id              bigserial primary key,
  run_id          uuid not null references autopilot_runs(id) on delete cascade,
  claim           text not null,
  source_url      text,
  source_type     text,
  excerpt         text,
  status          text not null,          -- supported|unsupported|uncertain
  required_qualifier text,
  visual_implication text,
  uncertainty     text,
  created_at      timestamptz not null default now()
);
create index if not exists autopilot_claims_run_idx on autopilot_claims (run_id);

-- ---------------------------------------------------------------------------
-- events — append-only; powers SSE and post-hoc debugging
-- ---------------------------------------------------------------------------
create table if not exists autopilot_events (
  id          bigserial primary key,
  run_id      uuid not null references autopilot_runs(id) on delete cascade,
  seq         bigint not null,
  level       text not null default 'info',
  stage       text,
  message     text not null,
  data        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists autopilot_events_run_seq_idx on autopilot_events (run_id, seq);

-- ---------------------------------------------------------------------------
-- judgments — self-review findings and the correction that followed
-- ---------------------------------------------------------------------------
create table if not exists autopilot_judgments (
  id           bigserial primary key,
  run_id       uuid not null references autopilot_runs(id) on delete cascade,
  stage        text not null,
  kind         text not null,             -- script_self_review|creative_self_review|final_qa
  verdict      text,                      -- pass|correct|block
  findings     jsonb,
  correction   jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists autopilot_judgments_run_idx on autopilot_judgments (run_id);

insert into schema_migrations (version) values ('001_autopilot')
  on conflict (version) do nothing;

commit;
