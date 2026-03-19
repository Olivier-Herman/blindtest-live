-- ═══════════════════════════════════════════════
-- BLINDTEST LIVE — Supabase Schema
-- À coller dans Supabase > SQL Editor > Run
-- ═══════════════════════════════════════════════

-- État du round en cours (une seule ligne active)
create table if not exists game_state (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null default 'default',
  status      text not null default 'idle', -- idle | playing | revealed
  song_title  text,
  song_artist text,
  timer_end   timestamptz,
  winner_name text,
  round_number integer default 0,
  updated_at  timestamptz default now()
);

-- Insérer l'état initial
insert into game_state (session_id, status)
values ('default', 'idle')
on conflict do nothing;

-- Playlist du blind test
create table if not exists playlist (
  id         uuid primary key default gen_random_uuid(),
  session_id text not null default 'default',
  title      text not null,
  artist     text not null,
  played     boolean default false,
  position   integer default 0,
  created_at timestamptz default now()
);

-- Classement des viewers
create table if not exists scores (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null default 'default',
  username    text not null,
  score       integer default 0,
  answers     integer default 0,
  updated_at  timestamptz default now(),
  unique(session_id, username)
);

-- Historique des commentaires TikTok
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null default 'default',
  username    text not null,
  message     text not null,
  is_correct  boolean default false,
  created_at  timestamptz default now()
);

-- Activer Realtime sur game_state et scores
alter publication supabase_realtime add table game_state;
alter publication supabase_realtime add table scores;
alter publication supabase_realtime add table comments;

-- RLS : désactivé pour v1 (on protège via service_role key côté API)
alter table game_state disable row level security;
alter table playlist   disable row level security;
alter table scores     disable row level security;
alter table comments   disable row level security;
