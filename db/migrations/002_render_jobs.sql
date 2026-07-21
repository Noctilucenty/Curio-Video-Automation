-- 002_render_jobs.sql — durable render state.
--
-- Additive only. Fixes a production blocker: LocalRenderer kept render status in
-- process-local Maps, so a render started by the WORKER could never be polled by the
-- WEB service, and a worker restart lost the render entirely. On Render those are two
-- separate processes and workers restart on every deploy, so the Map was not a
-- limitation — it was a guarantee of data loss.

begin;

create table if not exists render_jobs (
  -- provider_video_id: the id LocalRenderer hands back and the caller polls with.
  id                 text primary key,

  -- Idempotency: hash of (inputs that determine the output). A retry after a crash
  -- finds the existing COMPLETED row and reuses the artifact instead of re-rendering.
  -- UNIQUE is what makes "never render the same thing twice" structural.
  idempotency_key    text unique,

  run_id             uuid,
  stage              text,

  status             text not null default 'queued',   -- queued|running|completed|failed
  attempt            int  not null default 0,

  -- lease: whichever worker holds an unexpired lease owns this render. A crashed
  -- worker's lease simply expires and the job becomes claimable again.
  lease_owner        text,
  lease_expires_at   timestamptz,
  heartbeat_at       timestamptz,

  progress           numeric(5,4) not null default 0,  -- 0..1 for the dashboard

  -- inputs, so a resumed worker can prove it is rebuilding the same thing
  input_hashes       jsonb,

  -- output lives in object storage, NOT on the ephemeral container filesystem
  output_uri         text,
  output_sha256      text,
  output_bytes       bigint,

  -- ffprobe / finalqa evidence captured at completion
  probe              jsonb,

  error              text,
  retry_after        timestamptz,
  retry_count        int not null default 0,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz
);

create index if not exists render_jobs_status_idx on render_jobs (status);
create index if not exists render_jobs_lease_idx  on render_jobs (status, lease_expires_at);
create index if not exists render_jobs_run_idx    on render_jobs (run_id);

insert into schema_migrations (version) values ('002_render_jobs')
  on conflict (version) do nothing;

commit;
