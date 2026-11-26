-- =============================================================================
-- Database tests TC-01 to TC-39 (see docs/STD.md). They run the real supabase/schema.sql
-- on plain PostgreSQL, with supabase_stubs.sql loaded first. Each test calls the same
-- functions the app calls, signed in as a lecturer or a student.
-- =============================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- =============================================================================
-- The results table, and ok(): records one test's name, pass or fail, and a detail.
-- =============================================================================
create temp table results (n serial, name text, pass boolean, detail text);
grant all on results to public; grant all on sequence results_n_seq to public;
create or replace function pg_temp.ok(p_name text, p_pass boolean, p_detail text default '') returns void language sql as
$$ insert into results (name, pass, detail) values (p_name, coalesce(p_pass, false), p_detail) $$;

-- =============================================================================
-- as_user(): acts as the person signed in with this email (stands in for Google sign-in).
-- =============================================================================
create or replace function pg_temp.as_user(e text) returns void language sql as $$ select set_config('test.email', e, false) $$;
select pg_temp.as_user('lect@uni.ac.il');

-- =============================================================================
-- Test data: a course, two students on the list, and one student who only asked to join.
-- =============================================================================
insert into courses (id, code, name, lecturer_email) values ('00000000-0000-0000-0000-00000000c001', 'ABC123', 'Test course', 'lect@uni.ac.il');
insert into roster (course_id, email, name, status) values
  ('00000000-0000-0000-0000-00000000c001', 'emma@uni.ac.il', 'Emma Clarke', 'listed'),
  ('00000000-0000-0000-0000-00000000c001', 'oliver@uni.ac.il', 'Oliver Grant', 'joined'),
  ('00000000-0000-0000-0000-00000000c001', 'req@uni.ac.il', 'Pending Student', 'request');

-- =============================================================================
-- A live lecture with attendance open. The core tests use no Wi-Fi or location check.
-- =============================================================================
create temp table ctx as select (create_session('00000000-0000-0000-0000-00000000c001', 'L1', now(), 'class', false, false, true, 'manual', null, null, 60)).id as sid;
select start_session((select sid from ctx));
select set_checkin((select sid from ctx), 'open');

-- =============================================================================
-- frames(): k frames signed exactly like the projector signs them, numbered from n0, starting at time t0, 200 ms apart. failed(): the keys of the checks that failed.
-- =============================================================================
create or replace function pg_temp.frames(p_sid uuid, n0 int, k int, t0 bigint, p_round int default 1, p_bad_sig boolean default false) returns text[] language sql as $$
  select array_agg(b || '|' || case when p_bad_sig then 'deadbeef0000' else sign_frame(sec.secret, b) end order by i)
  from generate_series(0, k - 1) i,
       lateral (select 'CP1|' || s.short || '|' || p_round || '|' || (n0 + i) || '|' || (t0 + i * 200) as b from sessions s where s.id = p_sid) x,
       session_secrets sec where sec.session_id = p_sid $$;
create or replace function pg_temp.failed(j json) returns text language sql as
$$ select coalesce(string_agg(c->>'key', ',' order by c->>'key'), '') from json_array_elements(j->'checks') c where not (c->>'ok')::boolean $$;

-- =============================================================================
-- TC-01 to TC-03: a real scan: 7 frames over 1.2 s, submitted right after
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('emma@uni.ac.il'); perform begin_scan(sid, 'emma@uni.ac.il'); t0 := server_time() + 50;
  perform pg_sleep(1.35);
  r := submit_scan(sid, 'emma@uni.ac.il', pg_temp.frames(sid, 10, 7, t0), 1200, null, null);
  perform pg_temp.ok('TC-01 genuine live scan is accepted', (r->>'ok')::boolean, pg_temp.failed(r));
  perform pg_temp.ok('TC-02 attendance row written', exists (select 1 from attendance where session_id = sid and email = 'emma@uni.ac.il' and round = 1));
  r := submit_scan(sid, 'emma@uni.ac.il', pg_temp.frames(sid, 10, 7, t0), 1200, null, null);
  perform pg_temp.ok('TC-03 second submit in the same round says already', (r->>'already')::boolean);
end $$;

-- =============================================================================
-- TC-04: forged signature
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0, 1, true), 1200, null, null, true);
  perform pg_temp.ok('TC-04 forged frames are rejected (frames)', not (r->>'ok')::boolean and pg_temp.failed(r) like '%frames%', pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-05: frames out of order
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; f text[]; begin
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  f := pg_temp.frames(sid, 10, 7, t0); f := array[f[1], f[3], f[2], f[4], f[5], f[6], f[7]];
  r := submit_scan(sid, 'oliver@uni.ac.il', f, 1200, null, null, true);
  perform pg_temp.ok('TC-05 out-of-order frames are rejected', pg_temp.failed(r) like '%frames%', pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-06: too few frames (a single photo of the code)
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(0.3);
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 1, t0), 200, null, null, true);
  perform pg_temp.ok('TC-06 one frame (a photo) is rejected', not (r->>'ok')::boolean, pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-07: recorded video: frames shown before the phone started scanning
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  t0 := server_time(); perform pg_sleep(1.4);
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il');
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0), 1200, null, null, true);
  perform pg_temp.ok('TC-07 frames older than the scan (recording) are rejected (time)', pg_temp.failed(r) like '%time%', pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-08: sped-up video: 1.2 s of code arrived in 0.3 s
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0), 300, null, null, true);
  perform pg_temp.ok('TC-08 faster than real time is rejected (speed)', pg_temp.failed(r) like '%speed%', pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-09 and TC-10: not on the list / pending request
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); r json; begin
  perform pg_temp.as_user('stranger@uni.ac.il'); r := begin_scan(sid, 'stranger@uni.ac.il');
  perform pg_temp.ok('TC-09 outsider cannot start a scan', not (r->>'ok')::boolean, r->>'error');
  perform pg_temp.as_user('req@uni.ac.il'); r := begin_scan(sid, 'req@uni.ac.il');
  perform pg_temp.ok('TC-10 pending join request cannot start a scan', not (r->>'ok')::boolean, r->>'error');
end $$;

-- =============================================================================
-- TC-11: paused attendance
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  perform pg_temp.as_user('lect@uni.ac.il'); perform set_checkin(sid, 'paused');
  perform pg_temp.as_user('oliver@uni.ac.il'); r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0), 1200, null, null, true);
  perform pg_temp.ok('TC-11 paused attendance rejects scans', not (r->>'ok')::boolean, pg_temp.failed(r));
  perform pg_temp.as_user('lect@uni.ac.il'); perform set_checkin(sid, 'open');
end $$;

-- =============================================================================
-- TC-12 and TC-13: second check: round-1 frames are refused while round 2 runs
-- =============================================================================
do $$ declare sid uuid := (select sid from ctx); t0 bigint; r json; begin
  perform pg_temp.as_user('lect@uni.ac.il'); perform start_recheck(sid);
  perform pg_temp.as_user('oliver@uni.ac.il'); perform begin_scan(sid, 'oliver@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0, 1), 1200, null, null, true);
  perform pg_temp.ok('TC-12 old-round frames fail during the second check', pg_temp.failed(r) like '%frames%', pg_temp.failed(r));
  r := submit_scan(sid, 'oliver@uni.ac.il', pg_temp.frames(sid, 10, 7, t0, 2), 1200, null, null, true);
  perform pg_temp.ok('TC-13 round-2 frames pass during the second check', (r->>'ok')::boolean, pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-14 to TC-16: Wi-Fi and distance (a second session that checks both)
-- =============================================================================
do $$ declare s2 uuid; t0 bigint; r json; begin
  perform pg_temp.as_user('lect@uni.ac.il'); s2 := (create_session('00000000-0000-0000-0000-00000000c001', 'L2', now(), 'class', true, true, false, 'manual', null, null, 60)).id;
  perform pg_temp.as_user('lect@uni.ac.il'); perform start_session(s2); perform set_checkin(s2, 'open');
  perform set_config('request.headers', '{"x-forwarded-for":"132.70.5.10"}', false);
  perform pg_temp.as_user('lect@uni.ac.il'); perform set_session_context(s2, 32.1036, 35.2073);                    -- lecturer at Ariel
  perform set_config('request.headers', '{"x-forwarded-for":"132.70.5.77"}', false);   -- same /24
  perform pg_temp.as_user('emma@uni.ac.il'); perform begin_scan(s2, 'emma@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(s2, 'emma@uni.ac.il', pg_temp.frames(s2, 10, 7, t0), 1200, 32.1037, 35.2075, true);
  perform pg_temp.ok('TC-14 same Wi-Fi and 20 m away passes', (r->>'ok')::boolean, pg_temp.failed(r));
  perform set_config('request.headers', '{"x-forwarded-for":"84.229.1.9"}', false);    -- home network
  perform pg_temp.as_user('emma@uni.ac.il'); perform begin_scan(s2, 'emma@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(s2, 'emma@uni.ac.il', pg_temp.frames(s2, 10, 7, t0), 1200, 32.1037, 35.2075, true);
  perform pg_temp.ok('TC-15 other network fails (wifi)', pg_temp.failed(r) = 'wifi', pg_temp.failed(r));
  perform set_config('request.headers', '{"x-forwarded-for":"132.70.5.77"}', false);
  perform pg_temp.as_user('emma@uni.ac.il'); perform begin_scan(s2, 'emma@uni.ac.il'); t0 := server_time() + 50; perform pg_sleep(1.35);
  r := submit_scan(s2, 'emma@uni.ac.il', pg_temp.frames(s2, 10, 7, t0), 1200, 32.0853, 34.7818, true);   -- Tel Aviv
  perform pg_temp.ok('TC-16 40 km away fails (loc)', pg_temp.failed(r) = 'loc', pg_temp.failed(r));
end $$;

-- =============================================================================
-- TC-17 to TC-23: polls and questions
-- =============================================================================
do $$ declare pid uuid; r json; begin
  insert into polls (course_id, question, options) values ('00000000-0000-0000-0000-00000000c001', 'Q?', '["A","B","C"]') returning id into pid;
  perform pg_temp.as_user('emma@uni.ac.il'); r := vote(pid, 'emma@uni.ac.il', 1);   perform pg_temp.ok('TC-17 listed student can vote', (r->>'ok')::boolean);
  perform pg_temp.as_user('emma@uni.ac.il'); r := vote(pid, 'emma@uni.ac.il', 2);   perform pg_temp.ok('TC-18 changing a vote keeps one vote', (select count(*) = 1 and max(choice) = 2 from votes where poll_id = pid));
  perform pg_temp.as_user('stranger@uni.ac.il'); r := vote(pid, 'stranger@uni.ac.il', 0); perform pg_temp.ok('TC-19 outsider cannot vote', not (r->>'ok')::boolean);
  perform pg_temp.as_user('emma@uni.ac.il'); r := vote(pid, 'emma@uni.ac.il', 9);   perform pg_temp.ok('TC-20 unknown option is refused', not (r->>'ok')::boolean);
  perform pg_temp.as_user('oliver@uni.ac.il'); r := add_comment('00000000-0000-0000-0000-00000000c001', 'oliver@uni.ac.il', 'Anonymous question', true, null, false);
  perform pg_temp.ok('TC-21 question is posted', (r->>'ok')::boolean);
  perform pg_temp.as_user('emma@uni.ac.il'); r := list_comments('00000000-0000-0000-0000-00000000c001', 'emma@uni.ac.il');
  perform pg_temp.ok('TC-22 anonymous author name never leaves the DB', (r->0->>'author') = 'Anonymous' and r::text not like '%oliver%', r->0->>'author');
  perform pg_temp.as_user('oliver@uni.ac.il'); r := add_comment('00000000-0000-0000-0000-00000000c001', 'oliver@uni.ac.il', 'Spam', true, null, false);
  perform pg_temp.ok('TC-23 second message within 5 s is refused', not (r->>'ok')::boolean, r->>'error');
end $$;


-- =============================================================================
-- TC-24 to TC-26: joining with the course code
-- =============================================================================
do $$ declare r json; begin
  perform pg_temp.as_user('ava@uni.ac.il');
  update roster set status = 'listed' where email = 'ava@uni.ac.il';
  insert into roster (course_id, email, name, status) values ('00000000-0000-0000-0000-00000000c001', 'ava@uni.ac.il', 'Ava Mitchell', 'listed') on conflict do nothing;
  r := join_course('abc123', 'ava@uni.ac.il', 'Ava Mitchell');
  perform pg_temp.ok('TC-24 a listed student who enters the code is joined', r->>'status' = 'joined', r->>'status');
  perform pg_temp.as_user('new@uni.ac.il');
  r := join_course('ABC123', 'new@uni.ac.il', 'New Student');
  perform pg_temp.ok('TC-25 a student not on the list becomes a join request', r->>'status' = 'request' and exists (select 1 from roster where email = 'new@uni.ac.il' and status = 'request'), r->>'status');
  r := join_course('ZZZ999', 'new@uni.ac.il', 'New Student');
  perform pg_temp.ok('TC-26 a wrong code is refused', r->>'status' = 'not_found', r->>'status');
end $$;

-- =============================================================================
-- TC-27 to TC-29: asking to be marked present, and the lecturer approving
-- =============================================================================
do $$ declare sid uuid := (select id from sessions where ended_at is null limit 1); r json; rid uuid; begin
  perform pg_temp.as_user('oliver@uni.ac.il');
  r := request_attendance(sid, 'oliver@uni.ac.il', 'My phone battery died');
  perform pg_temp.ok('TC-27 a listed student can ask to be marked present', (r->>'ok')::boolean, r->>'error');
  perform pg_temp.as_user('emma@uni.ac.il');
  select id into rid from attendance_requests where session_id = sid and email = 'oliver@uni.ac.il';
  begin perform decide_attendance_request(rid, true); perform pg_temp.ok('TC-28 a student cannot approve a request', false);
  exception when others then perform pg_temp.ok('TC-28 a student cannot approve a request', true, sqlerrm); end;
  perform pg_temp.as_user('lect@uni.ac.il');
  r := decide_attendance_request(rid, true);
  perform pg_temp.ok('TC-29 the lecturer approves: the student is marked present', exists (select 1 from attendance where session_id = sid and email = 'oliver@uni.ac.il' and network = 'manual'));
end $$;

-- =============================================================================
-- TC-30: online lectures never check Wi-Fi or location
-- =============================================================================
do $$ declare s sessions; begin
  perform pg_temp.as_user('lect@uni.ac.il');
  s := create_session('00000000-0000-0000-0000-00000000c001', 'Online', now(), 'online', true, true, false, 'manual', null, null, 60);
  perform pg_temp.ok('TC-30 an online lecture has no Wi-Fi or location check', s.mode = 'online' and not s.check_wifi and not s.check_location);
end $$;

-- =============================================================================
-- TC-31 to TC-33: a second lecturer added by the owner can run the course; a stranger cannot
-- =============================================================================
do $$ declare ok boolean; begin
  insert into course_admins (course_id, email) values ('00000000-0000-0000-0000-00000000c001', 'co@uni.ac.il');
  perform pg_temp.as_user('co@uni.ac.il');
  perform pg_temp.ok('TC-31 an added lecturer counts as a lecturer of the course', is_lecturer('00000000-0000-0000-0000-00000000c001'));
  perform pg_temp.ok('TC-32 ...but not as its owner (cannot add lecturers or delete the course)', not is_owner('00000000-0000-0000-0000-00000000c001'));
  perform pg_temp.as_user('stranger@uni.ac.il');
  begin perform create_session('00000000-0000-0000-0000-00000000c001', 'X', now(), 'class', false, false, false, 'manual', null, null, 60); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok('TC-33 a stranger cannot plan a lecture in the course', ok);
end $$;

-- =============================================================================
-- TC-34 to TC-39: row-level security as a signed-in student
-- =============================================================================
delete from scans;
grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;
set role authenticated; select set_config('test.email', 'emma@uni.ac.il', false);
select pg_temp.ok('TC-34 a student cannot read the signing secrets', (select count(*) from session_secrets) = 0);
select pg_temp.ok('TC-35 a student sees only their own roster row', (select count(*) = 1 from roster));
select pg_temp.ok('TC-36 a student sees only their own attendance', (select bool_and(email = 'emma@uni.ac.il') from attendance));
select pg_temp.ok('TC-37 a student cannot read the QR frames log', (select count(*) from frames_log) = 0);
select pg_temp.ok('TC-38 begin_scan claiming to be Oliver', (begin_scan((select id from sessions where ended_at is null limit 1), 'oliver@uni.ac.il')->>'ok')::boolean);
reset role;
select pg_temp.ok('TC-39 ...was recorded as the signed-in Emma, not Oliver', exists (select 1 from scans where email = 'emma@uni.ac.il' and session_id = (select id from sessions where ended_at is null limit 1)));

select format('%s %s - %s%s', case when pass then 'ok' else 'not ok' end, n, name, case when detail <> '' then '  [' || detail || ']' else '' end) from results order by n;
select format('# %s passed, %s failed', count(*) filter (where pass), count(*) filter (where not pass)) from results;
