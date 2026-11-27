-- =============================================================================
-- The lecture app's database for Supabase (PostgreSQL). It creates the tables, the
-- access rules (row-level security), the functions the app calls, and the private
-- storage folders for files.
--
-- How to install: Supabase dashboard, SQL Editor, New query, paste this whole file,
-- Run. It is safe to run again: tables are kept and functions are replaced.
--
-- Every rule uses the person signed in with Google (auth.email()). The checks that
-- must not be cheated, above all the attendance check-in, run here inside the
-- database, where a phone cannot change them.
-- =============================================================================

-- =============================================================================
-- The pgcrypto extension gives us HMAC signatures and random keys for the attendance
-- code.
-- =============================================================================
create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- A course: its join code, name, weekly lecture times, the email of the lecturer who
-- created it (the owner), and its terms for AI summaries.
-- =============================================================================
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  schedule jsonb,
  terms jsonb,
  lecturer_email text not null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Other lecturers who run a course with its owner. They can do everything the owner
-- can, except add or remove lecturers and delete the course.
-- =============================================================================
create table if not exists course_admins (
  course_id uuid not null references courses on delete cascade,
  email text not null,
  added_at timestamptz not null default now(),
  primary key (course_id, email)
);

-- =============================================================================
-- A course's student list: first name, last name, email and group (never ID numbers).
-- status: listed (added by the lecturer), joined (signed in and joined), or request
-- (asked to join, waiting for the lecturer).
-- =============================================================================
create table if not exists roster (
  course_id uuid not null references courses on delete cascade,
  email text not null,
  name text not null,
  first_name text,
  last_name text,
  group_no text,
  status text not null default 'listed' check (status in ('listed', 'joined', 'request')),
  added_via text,
  primary key (course_id, email)
);

-- =============================================================================
-- A lecture. short is the short id printed inside every QR frame. A planned lecture
-- has no started_at yet. checkin is the attendance state (open, paused or closed).
-- ctx_* hold the lecturer's network and location for the checks. recheck_* hold the
-- second check: how it starts (by button, after N minutes, or at a time), when it is
-- planned, when it started, and how many seconds it stays open. deck points to the
-- slides being shown.
-- =============================================================================
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  short text unique not null,
  course_id uuid not null references courses on delete cascade,
  number int not null,
  title text,
  scheduled_at timestamptz,
  mode text not null default 'class',
  check_wifi boolean not null default true,
  check_location boolean not null default true,
  second_check boolean not null default true,
  started_at timestamptz,
  ended_at timestamptz,
  checkin text not null default 'closed',
  opened_at timestamptz,
  ctx_ip text, ctx_lat float8, ctx_lng float8,
  recheck_mode text not null default 'manual',
  recheck_after_min int,
  recheck_at timestamptz,
  recheck_planned timestamptz,
  recheck_started timestamptz,
  recheck_window int not null default 60,
  deck jsonb
);

-- =============================================================================
-- The secret key of each lecture, used to sign the QR frames. No access rule allows
-- reading it from the app; only the functions below use it (and give it to the
-- course's lecturers).
-- =============================================================================
create table if not exists session_secrets (
  session_id uuid primary key references sessions on delete cascade,
  secret text not null
);

-- =============================================================================
-- Every network address the lecturer's laptop used during a lecture (IPv4 and IPv6 can
-- both appear), for the Wi-Fi check.
-- =============================================================================
create table if not exists session_ips (
  session_id uuid not null references sessions on delete cascade,
  ip text not null,
  seen_at timestamptz not null default now(),
  primary key (session_id, ip)
);

-- =============================================================================
-- When each phone started scanning (server time), and how fast its internet is (round
-- trip in ms, measured by the server).
-- =============================================================================
create table if not exists scans (
  session_id uuid not null references sessions on delete cascade,
  email text not null,
  started_at timestamptz not null,
  nonce text,
  last_at timestamptz,
  ping_ms int,
  primary key (session_id, email)
);

-- =============================================================================
-- A successful check-in: one row per student, lecture and round (1 = first check, 2 =
-- second check), with how old the code was, the frames captured, the network and the
-- distance.
-- =============================================================================
create table if not exists attendance (
  session_id uuid not null references sessions on delete cascade,
  email text not null,
  round int not null,
  time timestamptz not null default now(),
  code_age_ms int, frames int, network text, distance int, flags jsonb,
  frames_seen jsonb,
  ping_ms int,
  primary key (session_id, email, round)
);

-- =============================================================================
-- A check-in that was refused, with the reasons.
-- =============================================================================
create table if not exists blocked (
  id bigserial primary key,
  session_id uuid not null references sessions on delete cascade,
  email text not null,
  time timestamptz not null default now(),
  round int, reasons jsonb,
  frames_seen jsonb,
  ping_ms int
);

-- =============================================================================
-- A student who could not check in asks the lecturer to mark them present. One request
-- per student and lecture.
-- =============================================================================
create table if not exists attendance_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  email text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (session_id, email)
);

-- =============================================================================
-- Every frame the projector showed, for the QR frames log.
-- =============================================================================
create table if not exists frames_log (
  session_id uuid not null references sessions on delete cascade,
  n int not null, round int not null, t bigint not null, raw text not null,
  primary key (session_id, n)
);

-- =============================================================================
-- A live poll: the question, the answers, and when it closes.
-- =============================================================================
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  question text not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  closes_at timestamptz,
  closed boolean not null default false
);

-- =============================================================================
-- One vote per student per poll.
-- =============================================================================
create table if not exists votes (
  poll_id uuid not null references polls on delete cascade,
  email text not null,
  choice int not null,
  primary key (poll_id, email)
);

-- =============================================================================
-- A student's question to the lecturer: anonymous or not, who upvoted it, whether it
-- was answered or hidden, and the lecturer's written answer.
-- =============================================================================
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  email text not null,
  anonymous boolean not null default true,
  text text not null,
  created_at timestamptz not null default now(),
  upvotes jsonb not null default '[]',
  answered boolean not null default false,
  hidden boolean not null default false,
  reply text,
  replied_at timestamptz
);

-- =============================================================================
-- An AI summary of a lecture: where the recording came from, the languages, its
-- progress, and the result. shared makes it visible to students.
-- =============================================================================
create table if not exists summaries (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  label text, source text, file_name text, spoken text, out_lang text,
  status text not null default 'processing', step text, error text,
  result jsonb, shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- =============================================================================
-- A homework assignment: title, instructions, due date, scoring parts (rubric), the
-- AI's notes about the whole class, and the assignment's PDF.
-- =============================================================================
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  title text not null, instructions text, due text,
  rubric jsonb not null, insights jsonb,
  brief_path text, brief_name text, brief_text text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- A student's handed-in work: file, text and/or link, its AI review and score, and how
-- it compares with the class.
-- =============================================================================
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  file_name text, kind text, text text,
  status text not null default 'reviewing', review jsonb, error text,
  file_path text, link text, extra text, uploaded_by text, comparison jsonb,
  unique (assignment_id, email)
);

-- =============================================================================
-- An assignment's own student list (imported from a form or CSV, from the course, or
-- typed in), with each student's link. Email may be empty for a name typed in by hand.
-- =============================================================================
create table if not exists hw_students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments on delete cascade,
  email text,
  name text not null default '', group_no text not null default '',
  link text not null default '', extra text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists hw_students_email on hw_students (assignment_id, email) where email is not null;

-- =============================================================================
-- Lecture materials the lecturer kept for the class (slides with drawings,
-- whiteboards). The files sit in the private "materials" storage folder.
-- =============================================================================
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  session_id uuid references sessions on delete set null,
  title text not null default '', kind text not null default 'file', path text not null, size bigint,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- The email of the person calling, from their Google sign-in. The p_email argument the
-- app sends is ignored, so nobody can act as someone else.
-- =============================================================================
create or replace function me(p_email text) returns text language sql stable security definer set search_path = public
as $$ select lower(auth.email()) $$;

-- =============================================================================
-- True when the caller created this course.
-- =============================================================================
create or replace function is_owner(p_course uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from courses c where c.id = p_course and lower(c.lecturer_email) = lower(auth.email())) $$;

-- =============================================================================
-- True when the caller runs this course: its owner, or a lecturer the owner added.
-- =============================================================================
create or replace function is_lecturer(p_course uuid) returns boolean language sql stable security definer set search_path = public
as $$ select is_owner(p_course) or exists (select 1 from course_admins a where a.course_id = p_course and a.email = lower(auth.email())) $$;

-- =============================================================================
-- True when the caller is a lecturer of this course or a student on its list.
-- =============================================================================
create or replace function is_member(p_course uuid) returns boolean language sql stable security definer set search_path = public
as $$ select is_lecturer(p_course) or exists (select 1 from roster r where r.course_id = p_course and r.email = lower(auth.email()) and r.status <> 'request') $$;

-- =============================================================================
-- The course a lecture belongs to.
-- =============================================================================
create or replace function course_of_session(p_session uuid) returns uuid language sql stable security definer set search_path = public
as $$ select course_id from sessions where id = p_session $$;

-- =============================================================================
-- The course an assignment belongs to.
-- =============================================================================
create or replace function course_of_assignment(p_a uuid) returns uuid language sql stable security definer set search_path = public
as $$ select course_id from assignments where id = p_a $$;

-- =============================================================================
-- A time as milliseconds since 1970.
-- =============================================================================
create or replace function ms(t timestamptz) returns bigint language sql immutable
as $$ select (extract(epoch from t) * 1000)::bigint $$;

-- =============================================================================
-- The server's clock now, in milliseconds. Every check-in time is measured with this
-- clock.
-- =============================================================================
create or replace function server_time() returns bigint language sql volatile
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- =============================================================================
-- The network address the request came from (phones on one Wi-Fi share a public
-- address).
-- =============================================================================
create or replace function request_ip() returns text language plpgsql stable as $$
declare h json;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  return nullif(trim(coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip')), '');
exception when others then return null;
end $$;

-- =============================================================================
-- The network an address belongs to: for IPv4 the first three numbers (/24), for IPv6
-- the first half (/64). Phones on one Wi-Fi share it even when IPv6 gives every device
-- its own address.
-- =============================================================================
create or replace function net_of(p_ip text) returns text language plpgsql immutable as $$
declare a inet;
begin
  if p_ip is null then return null; end if;
  a := regexp_replace(trim(p_ip), '^::ffff:(\d+\.\d+\.\d+\.\d+)$', '\1')::inet;
  return case when family(a) = 4 then host(network(set_masklen(a, 24))) || '/24'
              else host(network(set_masklen(a, 64))) || '/64' end;
exception when others then return null;
end $$;

-- =============================================================================
-- Remembers a network address the lecturer used during this lecture. Students cannot
-- add their own network.
-- =============================================================================
create or replace function note_lecturer_ip(p_session uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := request_ip();
begin
  if v_ip is null or not is_lecturer(course_of_session(p_session)) then return; end if;
  insert into session_ips values (p_session, v_ip, clock_timestamp())
  on conflict (session_id, ip) do update set seen_at = excluded.seen_at;
end $$;

-- =============================================================================
-- The signature of one frame: the first 12 hex characters of an HMAC-SHA256 with the
-- lecture's secret.
-- =============================================================================
create or replace function sign_frame(p_secret text, p_body text) returns text language sql immutable
as $$ select substr(encode(extensions.hmac(p_body, p_secret, 'sha256'), 'hex'), 1, 12) $$;

-- =============================================================================
-- Which check is running now: 2 while the second check is open, otherwise 1.
-- =============================================================================
create or replace function current_round(s sessions) returns int language sql stable as $$
  select case when s.recheck_started is not null
              and clock_timestamp() < s.recheck_started + make_interval(secs => s.recheck_window) then 2 else 1 end $$;

-- =============================================================================
-- One line of the check-in result: its key, its label, passed or not, a detail, and
-- its level (ok, warn or fail).
-- =============================================================================
create or replace function chk(p_key text, p_label text, p_ok boolean, p_detail text, p_warn boolean default false)
returns jsonb language sql immutable as $$
  select jsonb_build_object('key', p_key, 'label', p_label, 'ok', coalesce(p_ok, false), 'detail', p_detail,
         'level', case when not coalesce(p_ok, false) then 'fail' when p_warn then 'warn' else 'ok' end) $$;

-- =============================================================================
-- Turns on row-level security for every table: from now on nothing can be read or
-- changed unless a rule below allows it.
-- =============================================================================
alter table courses enable row level security;
alter table course_admins enable row level security;
alter table roster enable row level security;
alter table sessions enable row level security;
alter table session_secrets enable row level security;
alter table scans enable row level security;
alter table attendance enable row level security;
alter table blocked enable row level security;
alter table polls enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table summaries enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table hw_students enable row level security;
alter table materials enable row level security;
alter table frames_log enable row level security;
alter table session_ips enable row level security;
alter table attendance_requests enable row level security;

-- =============================================================================
-- Removes the old access rules first, so running this file again always leaves exactly
-- the rules below.
-- =============================================================================
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- =============================================================================
-- The access rules, table by table. In short: lecturers of a course can read and
-- change its data; students can read what belongs to them and to their courses. Scans,
-- votes, comments, secrets, network addresses and attendance requests have no rules at
-- all, so they are reachable only through the functions below.
-- =============================================================================
create policy courses_read  on courses for select using (lower(lecturer_email) = lower(auth.email()) or is_member(id));
create policy courses_add   on courses for insert with check (lower(lecturer_email) = lower(auth.email()));
create policy courses_edit  on courses for update using (is_lecturer(id));
create policy courses_del   on courses for delete using (is_owner(id));

create policy admins_read   on course_admins for select using (is_lecturer(course_id));
create policy admins_add    on course_admins for insert with check (is_owner(course_id) and email = lower(trim(email)));
create policy admins_del    on course_admins for delete using (is_owner(course_id) or email = lower(auth.email()));

create policy roster_read   on roster for select using (is_lecturer(course_id) or email = lower(auth.email()));
create policy roster_add    on roster for insert with check (is_lecturer(course_id));
create policy roster_edit   on roster for update using (is_lecturer(course_id));
create policy roster_del    on roster for delete using (is_lecturer(course_id));

create policy sessions_read on sessions for select using (is_member(course_id));
create policy sessions_del  on sessions for delete using (is_lecturer(course_id));

create policy att_read      on attendance for select using (is_lecturer(course_of_session(session_id)) or email = lower(auth.email()));
create policy blocked_read  on blocked for select using (is_lecturer(course_of_session(session_id)) or email = lower(auth.email()));
create policy frames_read   on frames_log for select using (is_lecturer(course_of_session(session_id)));

create policy polls_read    on polls for select using (is_member(course_id));
create policy polls_add     on polls for insert with check (is_lecturer(course_id));
create policy polls_edit    on polls for update using (is_lecturer(course_id));
create policy polls_del     on polls for delete using (is_lecturer(course_id));

create policy sum_read      on summaries for select using (is_lecturer(course_id) or (shared and is_member(course_id)));
create policy sum_add       on summaries for insert with check (is_lecturer(course_id));
create policy sum_edit      on summaries for update using (is_lecturer(course_id));
create policy sum_del       on summaries for delete using (is_lecturer(course_id));

create policy hw_read       on assignments for select using (is_member(course_id));
create policy hw_add        on assignments for insert with check (is_lecturer(course_id));
create policy hw_edit       on assignments for update using (is_lecturer(course_id));
create policy hw_del        on assignments for delete using (is_lecturer(course_id));

create policy sub_read      on submissions for select using (is_lecturer(course_of_assignment(assignment_id)) or email = lower(auth.email()));
create policy sub_add       on submissions for insert with check (is_lecturer(course_of_assignment(assignment_id))
                                                                   or (email = lower(auth.email()) and is_member(course_of_assignment(assignment_id))));

create policy mat_read      on materials for select using (is_member(course_id) or is_lecturer(course_id));
create policy mat_add       on materials for insert with check (is_lecturer(course_id));
create policy mat_del       on materials for delete using (is_lecturer(course_id));

create policy hws_read      on hw_students for select using (is_lecturer(course_of_assignment(assignment_id)) or email = lower(auth.email()));
create policy hws_add       on hw_students for insert with check (is_lecturer(course_of_assignment(assignment_id)));
create policy hws_edit      on hw_students for update using (is_lecturer(course_of_assignment(assignment_id)));
create policy hws_del       on hw_students for delete using (is_lecturer(course_of_assignment(assignment_id)));
create policy sub_edit      on submissions for update using (is_lecturer(course_of_assignment(assignment_id)) or email = lower(auth.email()));
create policy sub_del       on submissions for delete using (is_lecturer(course_of_assignment(assignment_id)) or email = lower(auth.email()));

-- =============================================================================
-- Lets the app reach the tables. The access rules above still decide which rows each
-- person sees.
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on courses, course_admins, roster, polls, summaries, assignments, submissions, hw_students, materials to anon, authenticated;
grant select, delete on sessions to anon, authenticated;
grant select on attendance, blocked, frames_log to anon, authenticated;

-- =============================================================================
-- A student joins a course with its code. On the list already: joined. Not on the
-- list: a join request for the lecturer.
-- =============================================================================
create or replace function join_course(p_code text, p_email text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare c courses; e text := me(p_email); st text;
begin
  if coalesce(e, '') = '' then return json_build_object('status', 'not_signed_in'); end if;
  select * into c from courses where code = upper(trim(p_code));
  if not found then return json_build_object('status', 'not_found'); end if;
  select status into st from roster where course_id = c.id and email = e;
  if st = 'joined' then return json_build_object('status', 'already', 'course', row_to_json(c)); end if;
  if st = 'request' then return json_build_object('status', 'already_requested', 'course', row_to_json(c)); end if;
  if st = 'listed' then
    update roster set status = 'joined' where course_id = c.id and email = e;
    return json_build_object('status', 'joined', 'course', row_to_json(c));
  end if;
  insert into roster (course_id, email, name, status, added_via) values (c.id, e, coalesce(nullif(trim(p_name), ''), e), 'request', 'join-code');
  return json_build_object('status', 'request', 'course', row_to_json(c));
end $$;

-- =============================================================================
-- The courses a student has joined.
-- =============================================================================
create or replace function my_courses(p_email text) returns setof courses
language sql stable security definer set search_path = public as $$
  select c.* from courses c join roster r on r.course_id = c.id
  where r.email = me(p_email) and r.status = 'joined' order by c.created_at $$;

-- =============================================================================
-- Plans a new lecture with its checks. Online lectures never use the Wi-Fi or location
-- check. Also makes the lecture's secret key.
-- =============================================================================
create or replace function create_session(p_course uuid, p_title text, p_when timestamptz, p_mode text,
                                          p_wifi boolean, p_location boolean, p_second boolean,
                                          p_recheck_mode text, p_recheck_after int, p_recheck_at timestamptz, p_window int) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions; online boolean := coalesce(p_mode, 'class') = 'online';
begin
  if not is_lecturer(p_course) then raise exception 'Only the lecturer can add sessions'; end if;
  insert into sessions (course_id, short, number, title, scheduled_at, mode, check_wifi, check_location, second_check,
                        recheck_mode, recheck_after_min, recheck_at, recheck_window)
  values (p_course, substr(md5(gen_random_uuid()::text), 1, 8),
          (select count(*) + 1 from sessions where course_id = p_course),
          coalesce(nullif(trim(p_title), ''), 'Lecture ' || (select count(*) + 1 from sessions where course_id = p_course)),
          coalesce(p_when, now()), case when online then 'online' else 'class' end,
          coalesce(p_wifi, true) and not online, coalesce(p_location, true) and not online, coalesce(p_second, true),
          case when p_recheck_mode in ('after', 'at') then p_recheck_mode else 'manual' end,
          greatest(1, coalesce(p_recheck_after, 30)), p_recheck_at, least(600, greatest(15, coalesce(p_window, 60))))
  returning * into s;
  insert into session_secrets values (s.id, encode(extensions.gen_random_bytes(24), 'hex'));
  return s;
end $$;

-- =============================================================================
-- Renames a lecture, moves its date, or switches a planned one between in class and
-- online.
-- =============================================================================
create or replace function update_session(p_session uuid, p_title text, p_when timestamptz, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Session not found'; end if;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can change a session'; end if;
  update sessions set
    title = coalesce(nullif(trim(p_title), ''), title),
    scheduled_at = coalesce(p_when, scheduled_at),
    mode = case when s.started_at is null and p_mode in ('class', 'online') then p_mode else mode end,
    check_wifi = case when s.started_at is null and p_mode = 'online' then false else check_wifi end,
    check_location = case when s.started_at is null and p_mode = 'online' then false else check_location end
  where id = p_session;
end $$;

-- =============================================================================
-- Starts a lecture. Any other live lecture of the course ends. Attendance stays closed
-- until the lecturer opens it.
-- =============================================================================
create or replace function start_session(p_session uuid) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'Session not found'; end if;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can start a session'; end if;
  if s.ended_at is not null then raise exception 'This session has ended'; end if;
  update sessions set ended_at = clock_timestamp()
  where course_id = s.course_id and id <> s.id and started_at is not null and ended_at is null;
  if s.started_at is null then
    update sessions set started_at = clock_timestamp(), checkin = 'closed',
      recheck_planned = case when second_check and recheck_mode = 'at' then recheck_at end
    where id = s.id returning * into s;
  end if;
  insert into session_secrets values (s.id, encode(extensions.gen_random_bytes(24), 'hex')) on conflict do nothing;
  return s;
end $$;

-- =============================================================================
-- Opens, pauses or closes attendance, as often as the lecturer likes. The first time
-- it opens, a second check planned "after N minutes" gets its time.
-- =============================================================================
create or replace function set_checkin(p_session uuid, p_state text) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  if p_state not in ('open', 'paused', 'closed') then raise exception 'Unknown state'; end if;
  update sessions set checkin = p_state,
    opened_at = case when p_state = 'open' and opened_at is null then clock_timestamp() else opened_at end,
    recheck_planned = case when p_state = 'open' and opened_at is null and second_check and recheck_mode = 'after'
                           then clock_timestamp() + make_interval(mins => coalesce(recheck_after_min, 30)) else recheck_planned end
  where id = p_session and started_at is not null and ended_at is null returning * into s;
  return s;
end $$;

-- =============================================================================
-- Sets when the second check happens (only before it has started).
-- =============================================================================
create or replace function set_recheck(p_session uuid, p_mode text, p_after int, p_at timestamptz, p_window int) returns sessions
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set second_check = true,
    recheck_mode = case when p_mode in ('after', 'at') then p_mode else 'manual' end,
    recheck_after_min = greatest(1, coalesce(p_after, recheck_after_min, 30)),
    recheck_at = p_at,
    recheck_window = least(600, greatest(15, coalesce(p_window, recheck_window, 60))),
    recheck_planned = case p_mode
      when 'after' then coalesce(opened_at, clock_timestamp()) + make_interval(mins => greatest(1, coalesce(p_after, 30)))
      when 'at' then p_at else null end
  where id = p_session and recheck_started is null and ended_at is null returning * into s;
  return s;
end $$;

-- =============================================================================
-- Saves the lecturer's network (read from the request) and location for the checks.
-- =============================================================================
create or replace function set_session_context(p_session uuid, p_lat float8, p_lng float8) returns json
language plpgsql security definer set search_path = public as $$
declare ip text := request_ip();
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set ctx_ip = coalesce(ip, ctx_ip), ctx_lat = p_lat, ctx_lng = p_lng where id = p_session;
  perform note_lecturer_ip(p_session);
  return json_build_object('ip', ip is not null, 'location', p_lat is not null);
end $$;

-- =============================================================================
-- Starts the second check now.
-- =============================================================================
create or replace function start_recheck(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set recheck_started = clock_timestamp(), checkin = 'open', second_check = true
  where id = p_session and started_at is not null and recheck_started is null and ended_at is null;
end $$;

-- =============================================================================
-- Ends a lecture.
-- =============================================================================
create or replace function end_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set ended_at = clock_timestamp(), deck = null where id = p_session and ended_at is null;
end $$;

-- =============================================================================
-- Makes signed frames on the server, for a projector that cannot sign them itself.
-- Each frame is also written to the frames log.
-- =============================================================================
create or replace function get_frames(p_session uuid, p_from int, p_count int) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions; sec text; base bigint := server_time(); arr jsonb := '[]'; body text; t bigint; rnd int;
begin
  select * into s from sessions where id = p_session;
  if not found or s.ended_at is not null then return json_build_object('ended', true); end if;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can show the code'; end if;
  perform note_lecturer_ip(p_session);
  if s.started_at is null or s.checkin <> 'open' then return json_build_object('closed', true, 'state', s.checkin, 'now', base, 'frames', '[]'::jsonb); end if;
  select secret into sec from session_secrets where session_id = p_session;
  for i in 0 .. least(greatest(p_count, 1), 30) - 1 loop
    t := base + i * 200;
    rnd := case when s.recheck_started is not null and t >= ms(s.recheck_started)
                 and t < ms(s.recheck_started) + s.recheck_window * 1000 then 2 else 1 end;
    body := 'CP1|' || s.short || '|' || rnd || '|' || (p_from + i) || '|' || t;
    arr := arr || jsonb_build_object('raw', body || '|' || sign_frame(sec, body), 't', t);
    insert into frames_log values (p_session, p_from + i, rnd, t, body || '|' || sign_frame(sec, body)) on conflict do nothing;
  end loop;
  return json_build_object('now', base, 'frames', arr);
end $$;

-- =============================================================================
-- Gives the lecture's signing key to the course's lecturers only, so the projector can
-- sign its own frames 5 times a second without any network. Students never see the
-- key, so they cannot make a frame.
-- =============================================================================
create or replace function frame_key(p_session uuid) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions; sec text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.ended_at is not null then return json_build_object('ended', true); end if;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can show the code'; end if;
  perform note_lecturer_ip(p_session);
  select secret into sec from session_secrets where session_id = p_session;
  return json_build_object('now', server_time(), 'short', s.short, 'secret', sec, 'state', s.checkin,
    'started', ms(coalesce(s.started_at, now())),
    'recheckStarted', case when s.recheck_started is null then null else ms(s.recheck_started) end, 'recheckWindow', s.recheck_window);
end $$;

-- =============================================================================
-- Saves the frames the projector showed (sent in small batches), for the frames log.
-- =============================================================================
create or replace function log_frames(p_session uuid, p_frames jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  perform note_lecturer_ip(p_session);
  insert into frames_log (session_id, n, round, t, raw)
  select p_session, (f->>'n')::int, (f->>'round')::int, (f->>'t')::bigint, f->>'raw' from jsonb_array_elements(p_frames) f
  limit 2000
  on conflict do nothing;
end $$;

-- =============================================================================
-- A phone starts a scan: checks that the lecture is live, attendance is open and the
-- student is on the list, then notes the start time (server clock) and a one-time code
-- for measuring the connection.
-- =============================================================================
create or replace function begin_scan(p_session uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions; e text := me(p_email); st text; nonce text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.ended_at is not null then return json_build_object('ok', false, 'error', 'This session has ended'); end if;
  if s.started_at is null or s.checkin = 'closed' then return json_build_object('ok', false, 'error', 'Attendance isn''t open right now'); end if;
  if s.checkin = 'paused' then return json_build_object('ok', false, 'error', 'Attendance is paused by the lecturer'); end if;
  select status into st from roster where course_id = s.course_id and email = e;
  if st is null or st = 'request' then return json_build_object('ok', false, 'error', 'You are not on the list for this course'); end if;
  nonce := encode(extensions.gen_random_bytes(8), 'hex');
  insert into scans (session_id, email, started_at, nonce, last_at, ping_ms)
  values (p_session, e, clock_timestamp(), nonce, clock_timestamp(), null)
  on conflict (session_id, email) do update
    set started_at = excluded.started_at, nonce = excluded.nonce, last_at = excluded.last_at, ping_ms = null;
  return json_build_object('ok', true, 'round', current_round(s), 'nonce', nonce);
end $$;

-- =============================================================================
-- Measures the phone's internet speed: the phone answers right away and the server
-- times the round trip. Called up to 3 times; the fastest counts. A phone can only
-- look slower, never faster, which is why the extra time it earns is capped in
-- submit_scan.
-- =============================================================================
create or replace function scan_ping(p_session uuid, p_email text, p_nonce text) returns json
language plpgsql security definer set search_path = public as $$
declare e text := me(p_email); sc scans; rtt int;
begin
  select * into sc from scans where session_id = p_session and email = e;
  if not found or sc.nonce is null or sc.nonce <> p_nonce then return json_build_object('ok', false); end if;
  rtt := round(extract(epoch from clock_timestamp() - sc.last_at) * 1000);
  update scans set last_at = clock_timestamp(), ping_ms = least(coalesce(ping_ms, rtt), rtt)
  where session_id = p_session and email = e;
  return json_build_object('ok', true, 'ping', least(coalesce(sc.ping_ms, rtt), rtt));
end $$;

-- =============================================================================
-- The check-in. It checks, in order: the student is on the course list; the frames are
-- genuine (signed with this lecture's secret), from the right round, at least 6, and
-- in order; the code is live (shown after the scan began, at most 3 seconds old, plus
-- a little for a slow connection); the frames came in real time (not a sped-up video);
-- the phone is on the lecturer's network (if this lecture checks Wi-Fi); and it is
-- within 300 m (if it checks location). Every check is returned so the phone can show
-- what passed. A success is saved in attendance, a failure in blocked. These numbers
-- must match API.RULES in the app.
-- =============================================================================
create or replace function submit_scan(p_session uuid, p_email text, p_frames text[], p_elapsed int,
                                       p_lat float8, p_lng float8, p_dry boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare
  s sessions; e text := me(p_email); sec text; rnd int; r_now bigint := server_time();
  checks jsonb := '[]'; st text; raw text; p text[];
  forged int := 0; wrong_round int := 0; prev int := -1; in_order boolean := true;
  ns int[] := '{}'; ts bigint[] := '{}'; n int;
  scan_start bigint; first_t bigint; last_t bigint; age bigint; span bigint; ratio float8;
  ip text := request_ip(); net text := 'skipped'; dist int; ok boolean; flags jsonb := '[]'; seen jsonb;
  ping int; extra int := 0; max_age int; my_net text; my_ip text := request_ip();
begin
  select * into s from sessions where id = p_session;
  if not found or s.ended_at is not null then
    return json_build_object('ok', false, 'checks', jsonb_build_array(chk('session', 'Live session', false, 'This session has ended')));
  end if;
  if s.started_at is null or s.checkin <> 'open' then
    return json_build_object('ok', false, 'checks', jsonb_build_array(chk('session', 'Attendance open', false,
      case when s.checkin = 'paused' then 'Attendance is paused by the lecturer' else 'Attendance isn''t open right now' end)));
  end if;
  rnd := current_round(s);
  select secret into sec from session_secrets where session_id = p_session;

  select status into st from roster where course_id = s.course_id and email = e;
  checks := checks || chk('roster', 'On the course list', st is not null and st <> 'request',
            case when st is null or st = 'request' then 'Your email is not on this course''s list' else e end);

  foreach raw in array coalesce(p_frames, '{}') loop
    p := string_to_array(raw, '|');
    if coalesce(array_length(p, 1), 0) <> 6 or p[1] <> 'CP1' or p[2] <> s.short
       or sign_frame(sec, array_to_string(p[1:5], '|')) <> p[6] then forged := forged + 1; continue; end if;
    if p[3]::int <> rnd then wrong_round := wrong_round + 1; continue; end if;
    if p[4]::int <= prev then in_order := false; continue; end if;
    prev := p[4]::int; ns := ns || p[4]::int; ts := ts || p[5]::bigint;
  end loop;
  n := coalesce(array_length(ns, 1), 0);
  select coalesce(jsonb_agg(jsonb_build_array(ns[i], ts[i]) order by i), '[]') into seen from generate_subscripts(ns, 1) i;
  checks := checks || chk('frames', 'Code frames', forged = 0 and n >= 6 and in_order,
    case when forged > 0 then forged || ' frame(s) are not genuine'
         when not in_order then 'Frames are out of order'
         when wrong_round > 0 and n < 6 then 'Frames from the wrong check round'
         else n || ' frames captured (need 6)' end);

  select ms(started_at), ping_ms into scan_start, ping from scans where session_id = p_session and email = e;

  extra := least(greatest(coalesce(ping, 0), 0) * 2, 5000);
  max_age := 3000 + extra;
  if scan_start is null or n = 0 then
    checks := checks || chk('time', 'Code is live', false, case when scan_start is null then 'Scan was not started properly' else 'No frames' end);
  else
    first_t := ts[1]; last_t := ts[n]; age := r_now - last_t; span := last_t - first_t;
    checks := checks || chk('time', 'Code is live',
      (select min(x) from unnest(ts) x) >= scan_start - 300 and last_t <= r_now + 500 and age <= max_age and r_now - scan_start <= 20000 + extra,
      case when (select min(x) from unnest(ts) x) < scan_start - 300 then 'These frames were shown before you started scanning (recorded video?)'
           when last_t > r_now + 500 then 'Frames from the future'
           when age > max_age then 'Your internet is slow — the code arrived ' || round(age / 1000.0, 1) || ' s late (limit '
                || round(max_age / 1000.0, 1) || ' s). Move closer to the Wi-Fi and try again'
           when r_now - scan_start > 20000 + extra then 'Scan took too long'
           else 'Code was ' || round(age / 1000.0, 1) || ' s old' || case when ping is not null then ' · internet ' || ping || ' ms' else '' end end);
    ratio := case when span > 0 then p_elapsed::float8 / span else 0 end;
    checks := checks || chk('speed', 'Scanned in real time', span >= 1000 and ratio between 0.6 and 1.6,
      case when span < 1000 then 'Hold the phone on the code a bit longer'
           when ratio < 0.6 then 'Frames arrived faster than real time (sped-up video?)'
           when ratio > 1.6 then 'Frames arrived slower than real time'
           else round(span / 1000.0, 1) || ' s of code' end);
  end if;

  if s.check_wifi then
    my_net := net_of(my_ip);
    if s.ctx_ip is not null then insert into session_ips values (p_session, s.ctx_ip, coalesce(s.started_at, now())) on conflict do nothing; end if;
    if ip is null or my_net is null or not exists (select 1 from session_ips where session_id = p_session) then
      net := 'unknown'; checks := checks || chk('wifi', 'Class Wi-Fi', true, 'Couldn''t check the network', true);
    elsif exists (select 1 from session_ips where session_id = p_session and (session_ips.ip = my_ip or net_of(session_ips.ip) = my_net)) then
      net := 'match'; checks := checks || chk('wifi', 'Class Wi-Fi', true, 'Same network as the lecturer');
    elsif not exists (select 1 from session_ips where session_id = p_session and right(net_of(session_ips.ip), 3) = right(my_net, 3)) then

      net := 'unknown'; checks := checks || chk('wifi', 'Class Wi-Fi', true, 'Couldn''t compare the network (IPv4/IPv6)', true);
    else
      net := 'different'; checks := checks || chk('wifi', 'Class Wi-Fi', false,
        'Different network — connect to the class Wi-Fi and turn off mobile data, VPN and iCloud Private Relay');
    end if;
  end if;
  if s.check_location then
    if s.ctx_lat is null or p_lat is null then
      checks := checks || chk('loc', 'Near the class', true, 'Location not available', true);
    else
      dist := round(2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - s.ctx_lat) / 2), 2)
              + cos(radians(s.ctx_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.ctx_lng) / 2), 2))));
      checks := checks || chk('loc', 'Near the class', dist <= 300, dist || ' m from the lecturer');
    end if;
  end if;

  ok := not exists (select 1 from jsonb_array_elements(checks) c where (c->>'ok')::boolean = false);
  if p_dry then return json_build_object('ok', ok, 'checks', checks, 'round', rnd, 'dryRun', true); end if;

  if exists (select 1 from attendance where session_id = p_session and email = e and round = rnd) then
    return json_build_object('ok', true, 'already', true, 'checks', checks, 'round', rnd);
  end if;
  if ok then
    select coalesce(jsonb_agg(c->>'detail'), '[]') into flags from jsonb_array_elements(checks) c where c->>'level' = 'warn';
    insert into attendance (session_id, email, round, time, code_age_ms, frames, network, distance, flags, frames_seen, ping_ms)
    values (p_session, e, rnd, clock_timestamp(), age, n, net, dist, flags, seen, ping);
  else
    insert into blocked (session_id, email, round, reasons, frames_seen, ping_ms)
    select p_session, e, rnd, coalesce(jsonb_agg(c->>'label'), '[]'), seen, ping from jsonb_array_elements(checks) c where (c->>'ok')::boolean = false;
  end if;
  delete from scans where session_id = p_session and email = e;
  return json_build_object('ok', ok, 'checks', checks, 'round', rnd);
end $$;

-- =============================================================================
-- The course's latest poll: its answers, the votes for each, whether it is still open,
-- and the caller's own vote.
-- =============================================================================
create or replace function poll_state(p_course uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare p polls; counts int[]; total int; mine int; e text := me(p_email); is_open boolean;
begin
  if not is_member(p_course) and not exists (select 1 from roster where course_id = p_course and email = e and status <> 'request') then return null; end if;
  select * into p from polls where course_id = p_course order by created_at desc limit 1;
  if not found then return null; end if;
  select array_agg(coalesce(v.cnt, 0)::int order by i) into counts
  from generate_series(0, jsonb_array_length(p.options) - 1) i
  left join (select choice, count(*) cnt from votes where poll_id = p.id group by choice) v on v.choice = i;
  select count(*) into total from votes where poll_id = p.id;
  select choice into mine from votes where poll_id = p.id and email = e;
  is_open := not p.closed and (p.closes_at is null or clock_timestamp() < p.closes_at);
  return json_build_object('id', p.id, 'question', p.question, 'options', p.options, 'createdAt', ms(p.created_at),
    'open', is_open, 'counts', counts, 'total', total, 'myVote', mine,
    'secondsLeft', case when is_open and p.closes_at is not null then greatest(0, ceil(extract(epoch from p.closes_at - clock_timestamp())))::int end);
end $$;

-- =============================================================================
-- A student on the list votes, or changes their vote, while the poll is open.
-- =============================================================================
create or replace function vote(p_poll uuid, p_email text, p_choice int) returns json
language plpgsql security definer set search_path = public as $$
declare p polls; e text := me(p_email);
begin
  select * into p from polls where id = p_poll;
  if not found or p.closed or (p.closes_at is not null and clock_timestamp() >= p.closes_at) then return json_build_object('ok', false, 'error', 'This poll is closed'); end if;
  if not exists (select 1 from roster where course_id = p.course_id and email = e and status <> 'request') then
    return json_build_object('ok', false, 'error', 'You are not on the list for this course'); end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then return json_build_object('ok', false, 'error', 'Unknown answer'); end if;
  insert into votes values (p_poll, e, p_choice) on conflict (poll_id, email) do update set choice = excluded.choice;
  return json_build_object('ok', true);
end $$;

-- =============================================================================
-- The course's questions, open ones first and most upvoted first. The name of an
-- anonymous asker never leaves the database.
-- =============================================================================
create or replace function list_comments(p_course uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare e text := me(p_email);
begin
  if not is_member(p_course) and not exists (select 1 from roster where course_id = p_course and email = e and status <> 'request') then return '[]'; end if;
  return (select coalesce(json_agg(x order by x.answered, x.votes desc, x."createdAt" desc), '[]') from (
    select c.id, c.text, ms(c.created_at) as "createdAt", c.answered, jsonb_array_length(c.upvotes) as votes,
           c.email = e as mine, c.upvotes ? e as "upvotedByMe", c.reply, ms(c.replied_at) as "repliedAt",
           case when c.anonymous then 'Anonymous' else coalesce(r.name, c.email) end as author
    from comments c left join roster r on r.course_id = c.course_id and r.email = c.email
    where c.course_id = p_course and not c.hidden) x);
end $$;

-- =============================================================================
-- A student on the list asks a question (up to 300 characters). At most one message
-- every 5 seconds, except for questions written offline and sent later.
-- =============================================================================
create or replace function add_comment(p_course uuid, p_email text, p_text text, p_anon boolean, p_created bigint, p_queued boolean)
returns json language plpgsql security definer set search_path = public as $$
declare e text := me(p_email); t text := left(trim(coalesce(p_text, '')), 300); last_at timestamptz;
begin
  if t = '' then return json_build_object('ok', false, 'error', 'Write something first'); end if;
  if not exists (select 1 from roster where course_id = p_course and email = e and status <> 'request') then
    return json_build_object('ok', false, 'error', 'You are not on the list for this course'); end if;
  select max(created_at) into last_at from comments where course_id = p_course and email = e;
  if not coalesce(p_queued, false) and last_at > clock_timestamp() - interval '5 seconds' then
    return json_build_object('ok', false, 'error', 'Wait a few seconds between messages'); end if;
  insert into comments (course_id, email, anonymous, text, created_at)
  values (p_course, e, coalesce(p_anon, true), t, case when p_created is not null then to_timestamp(p_created / 1000.0) else now() end);
  return json_build_object('ok', true);
end $$;

-- =============================================================================
-- A student upvotes a question, or takes the upvote back.
-- =============================================================================
create or replace function toggle_upvote(p_comment uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := me(p_email); c comments;
begin
  select * into c from comments where id = p_comment;
  if not found or not exists (select 1 from roster where course_id = c.course_id and email = e and status <> 'request') then return; end if;
  update comments set upvotes = case when upvotes ? e then upvotes - e else upvotes || to_jsonb(e) end where id = p_comment;
end $$;

-- =============================================================================
-- The lecturer marks a question answered, or hides it.
-- =============================================================================
create or replace function set_comment_state(p_comment uuid, p_answered boolean, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer((select course_id from comments where id = p_comment)) then raise exception 'Only the lecturer can do this'; end if;
  update comments set answered = coalesce(p_answered, answered), hidden = coalesce(p_hidden, hidden) where id = p_comment;
end $$;

-- =============================================================================
-- The lecturer answers a question in writing (or removes the answer).
-- =============================================================================
create or replace function reply_comment(p_comment uuid, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := nullif(left(trim(coalesce(p_reply, '')), 1000), '');
begin
  if not is_lecturer((select course_id from comments where id = p_comment)) then raise exception 'Only the lecturer can do this'; end if;
  update comments set reply = t, replied_at = case when t is null then null else clock_timestamp() end,
                      answered = case when t is null then answered else true end
  where id = p_comment;
end $$;

-- =============================================================================
-- A student on the list who could not check in asks to be marked present, with a
-- reason.
-- =============================================================================
create or replace function request_attendance(p_session uuid, p_email text, p_reason text) returns json
language plpgsql security definer set search_path = public as $$
declare e text := me(p_email); s sessions; t text := nullif(left(trim(coalesce(p_reason, '')), 300), ''); prev text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.started_at is null then return json_build_object('ok', false, 'error', 'This lecture hasn''t started'); end if;
  if not exists (select 1 from roster where course_id = s.course_id and email = e and status <> 'request') then
    return json_build_object('ok', false, 'error', 'You are not on the list for this course'); end if;
  if t is null then return json_build_object('ok', false, 'error', 'Write why you couldn''t check in'); end if;
  if exists (select 1 from attendance where session_id = p_session and email = e and round = 1)
     and (s.recheck_started is null or exists (select 1 from attendance where session_id = p_session and email = e and round = 2)) then
    return json_build_object('ok', false, 'error', 'You''re already marked present'); end if;
  select status into prev from attendance_requests where session_id = p_session and email = e;
  if prev = 'approved' then return json_build_object('ok', false, 'error', 'Your lecturer already approved this'); end if;
  insert into attendance_requests (session_id, email, reason) values (p_session, e, t)
  on conflict (session_id, email) do update set reason = excluded.reason, status = 'pending', created_at = now(), decided_at = null;
  return json_build_object('ok', true);
end $$;

-- =============================================================================
-- The requests of a course, waiting ones first (lecturers only).
-- =============================================================================
create or replace function list_attendance_requests(p_course uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(p_course) then return '[]'; end if;
  return (select coalesce(json_agg(x order by x.status <> 'pending', x."createdAt" desc), '[]') from (
    select q.id, q.session_id as "sessionId", s.number, s.title, ms(s.started_at) as "startedAt",
           q.email, coalesce(r.name, q.email) as name, r.group_no as "group", q.reason, q.status,
           ms(q.created_at) as "createdAt", ms(q.decided_at) as "decidedAt"
    from attendance_requests q join sessions s on s.id = q.session_id
    left join roster r on r.course_id = s.course_id and r.email = q.email
    where s.course_id = p_course
    limit 300) x);
end $$;

-- =============================================================================
-- The lecturer approves a request (the student is marked present) or refuses it.
-- =============================================================================
create or replace function decide_attendance_request(p_id uuid, p_approve boolean) returns json
language plpgsql security definer set search_path = public as $$
declare q attendance_requests; s sessions;
begin
  select * into q from attendance_requests where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'This request is gone'); end if;
  select * into s from sessions where id = q.session_id;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can do this'; end if;
  if p_approve then
    insert into attendance (session_id, email, round, time, network, flags)
    values (s.id, q.email, 1, clock_timestamp(), 'manual', '["Approved by the lecturer"]') on conflict do nothing;
    if s.recheck_started is not null then
      insert into attendance (session_id, email, round, time, network, flags)
      values (s.id, q.email, 2, clock_timestamp(), 'manual', '["Approved by the lecturer"]') on conflict do nothing;
    end if;
  end if;
  update attendance_requests set status = case when p_approve then 'approved' else 'declined' end, decided_at = clock_timestamp() where id = p_id;
  return json_build_object('ok', true);
end $$;

-- =============================================================================
-- The lecturer sets a student's mark by hand: P (present), H (partial, only when there
-- was a second check) or A (absent).
-- =============================================================================
create or replace function set_attendance(p_session uuid, p_email text, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions; e text := lower(trim(p_email));
begin
  select * into s from sessions where id = p_session;
  if not found then return json_build_object('ok', false, 'error', 'This lecture is gone'); end if;
  if not is_lecturer(s.course_id) then raise exception 'Only the lecturer can do this'; end if;
  if p_status not in ('P', 'H', 'A') then return json_build_object('ok', false, 'error', 'Unknown status'); end if;
  if p_status = 'H' and s.recheck_started is null then return json_build_object('ok', false, 'error', 'Partial needs a second check, and this lecture had none'); end if;
  if p_status = 'A' then
    delete from attendance where session_id = s.id and email = e;
  else
    insert into attendance (session_id, email, round, time, network, flags)
    values (s.id, e, 1, clock_timestamp(), 'manual', '["Set by the lecturer"]') on conflict do nothing;
    if p_status = 'P' and s.recheck_started is not null then
      insert into attendance (session_id, email, round, time, network, flags)
      values (s.id, e, 2, clock_timestamp(), 'manual', '["Set by the lecturer"]') on conflict do nothing;
    elsif p_status = 'H' then
      delete from attendance where session_id = s.id and email = e and round = 2;
    end if;
  end if;
  return json_build_object('ok', true);
end $$;

-- =============================================================================
-- A student's own attendance in a course, lecture by lecture. The marks follow the
-- lecturer's sheet: with a second check, both checks are needed for P.
-- =============================================================================
create or replace function my_attendance(p_course uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare e text := me(p_email);
begin
  if not exists (select 1 from roster where course_id = p_course and email = e and status <> 'request') then return '[]'; end if;
  return (select coalesce(json_agg(x order by x.number), '[]') from (
    select s.id, s.number, s.title, ms(s.started_at) as "startedAt", ms(s.ended_at) as "endedAt", s.mode,
           c1.time is not null as check1, c2.time is not null as check2,
           ms(c1.time) as "check1At", ms(c2.time) as "check2At",
           s.recheck_started is not null as "secondCheckHappened", rq.status as request,
           case
             when c1.time is null and c2.time is null then 'A'
             when s.recheck_started is null then 'P'
             when clock_timestamp() < s.recheck_started + make_interval(secs => s.recheck_window) then case when c1.time is not null then 'P' else 'H' end
             when c1.time is not null and c2.time is not null then 'P'
             else 'H' end as status
    from sessions s
    left join attendance c1 on c1.session_id = s.id and c1.email = e and c1.round = 1
    left join attendance c2 on c2.session_id = s.id and c2.email = e and c2.round = 2
    left join attendance_requests rq on rq.session_id = s.id and rq.email = e
    where s.course_id = p_course and s.started_at is not null and s.opened_at is not null) x);
end $$;

-- =============================================================================
-- The class's scores for an assignment: how many were reviewed, the full marks, every
-- total, the average, and the average of each part. No names.
-- =============================================================================
create or replace function class_stats(p_assignment uuid) returns json
language plpgsql security definer set search_path = public as $$
declare a assignments; tot numeric[]; maxp int; per json;
begin
  select * into a from assignments where id = p_assignment;
  if not found then return null; end if;
  select coalesce(sum((r->>'points')::int), 0) into maxp from jsonb_array_elements(a.rubric) r;
  select array_agg(t) into tot from (
    select (select sum((c->>'score')::numeric) from jsonb_array_elements(s.review->'criteria') c) t
    from submissions s where s.assignment_id = a.id and s.review is not null) q;
  select json_object_agg(r->>'name', (
    select avg((c->>'score')::numeric) from submissions s, jsonb_array_elements(s.review->'criteria') c
    where s.assignment_id = a.id and s.review is not null and c->>'name' = r->>'name')) into per
  from jsonb_array_elements(a.rubric) r;
  return json_build_object('n', coalesce(array_length(tot, 1), 0), 'max', maxp, 'totals', coalesce(to_json(tot), '[]'),
                           'avg', (select avg(x) from unnest(tot) x), 'perCriterion', per);
end $$;

-- =============================================================================
-- The lecturer shows slides in a live lecture (or removes them). Only a pointer to the
-- file is kept.
-- =============================================================================
create or replace function set_deck(p_session uuid, p_deck jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set deck = case when p_deck is null or p_deck = 'null'::jsonb then null
    else jsonb_build_object('path', p_deck->>'path', 'name', left(coalesce(p_deck->>'name', ''), 120),
                            'pages', greatest(1, coalesce((p_deck->>'pages')::int, 1)), 'slide', 1,
                            'kind', case when p_deck->>'kind' = 'office' then 'office' else 'pdf' end) end
  where id = p_session and ended_at is null;
end $$;

-- =============================================================================
-- The lecturer moves to slide n; the students' phones follow.
-- =============================================================================
create or replace function set_slide(p_session uuid, p_slide int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lecturer(course_of_session(p_session)) then raise exception 'Only the lecturer can do this'; end if;
  update sessions set deck = jsonb_set(deck, '{slide}', to_jsonb(least(greatest(1, p_slide), coalesce((deck->>'pages')::int, 1))))
  where id = p_session and deck is not null and ended_at is null;
end $$;

-- =============================================================================
-- Text as an id, or null when it is not one (for the storage rules).
-- =============================================================================
create or replace function safe_uuid(p text) returns uuid language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

-- =============================================================================
-- The private storage folders: decks (slides during a lecture, up to 50 MB), homework
-- (assignment PDFs and handed-in files, up to 25 MB) and materials (kept slides and
-- whiteboards, up to 50 MB).
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('decks', 'decks', false, 52428800), ('homework', 'homework', false, 26214400), ('materials', 'materials', false, 52428800)
on conflict (id) do nothing;

-- =============================================================================
-- Slides: the course's members can read them; only its lecturers can add, change or
-- delete them. Files are stored as <course id>/<lecture id>/...
-- =============================================================================
drop policy if exists cp_decks_read on storage.objects;
drop policy if exists cp_decks_write on storage.objects;
drop policy if exists cp_decks_edit on storage.objects;
drop policy if exists cp_decks_del on storage.objects;
create policy cp_decks_read on storage.objects for select
  using (bucket_id = 'decks' and is_member(safe_uuid((storage.foldername(name))[1])));
create policy cp_decks_write on storage.objects for insert
  with check (bucket_id = 'decks' and is_lecturer(safe_uuid((storage.foldername(name))[1])));
create policy cp_decks_edit on storage.objects for update
  using (bucket_id = 'decks' and is_lecturer(safe_uuid((storage.foldername(name))[1])));
create policy cp_decks_del on storage.objects for delete
  using (bucket_id = 'decks' and is_lecturer(safe_uuid((storage.foldername(name))[1])));

-- =============================================================================
-- Homework files: lecturers see everything in their course. A student sees the
-- assignment's PDF (the "brief" folder) and only their own handed-in files, which they
-- can add, change and delete. Files are stored as <course id>/<assignment
-- id>/brief/... or .../subs/<email>/...
-- =============================================================================
drop policy if exists cp_hw_read on storage.objects;
drop policy if exists cp_hw_write on storage.objects;
drop policy if exists cp_hw_edit on storage.objects;
drop policy if exists cp_hw_del on storage.objects;
create policy cp_hw_read on storage.objects for select
  using (bucket_id = 'homework' and (is_lecturer(safe_uuid((storage.foldername(name))[1]))
         or (is_member(safe_uuid((storage.foldername(name))[1]))
             and ((storage.foldername(name))[3] = 'brief' or (storage.foldername(name))[4] = lower(auth.email())))));
create policy cp_hw_write on storage.objects for insert
  with check (bucket_id = 'homework' and (is_lecturer(safe_uuid((storage.foldername(name))[1]))
         or (is_member(safe_uuid((storage.foldername(name))[1])) and (storage.foldername(name))[3] = 'subs'
             and (storage.foldername(name))[4] = lower(auth.email()))));
create policy cp_hw_edit on storage.objects for update
  using (bucket_id = 'homework' and (is_lecturer(safe_uuid((storage.foldername(name))[1]))
         or ((storage.foldername(name))[3] = 'subs' and (storage.foldername(name))[4] = lower(auth.email()))));
create policy cp_hw_del on storage.objects for delete
  using (bucket_id = 'homework' and (is_lecturer(safe_uuid((storage.foldername(name))[1]))
         or ((storage.foldername(name))[3] = 'subs' and (storage.foldername(name))[4] = lower(auth.email()))));

-- =============================================================================
-- Kept materials: the course's members can read them; only its lecturers can add or
-- delete them.
-- =============================================================================
drop policy if exists cp_mat_read on storage.objects;
drop policy if exists cp_mat_write on storage.objects;
drop policy if exists cp_mat_del on storage.objects;
create policy cp_mat_read on storage.objects for select
  using (bucket_id = 'materials' and is_member(safe_uuid((storage.foldername(name))[1])));
create policy cp_mat_write on storage.objects for insert
  with check (bucket_id = 'materials' and is_lecturer(safe_uuid((storage.foldername(name))[1])));
create policy cp_mat_del on storage.objects for delete
  using (bucket_id = 'materials' and is_lecturer(safe_uuid((storage.foldername(name))[1])));

-- =============================================================================
-- Lets the app call the functions above. Each function checks for itself who may do
-- what.
-- =============================================================================
grant execute on all functions in schema public to anon, authenticated;
