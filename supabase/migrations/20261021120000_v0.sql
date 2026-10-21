-- Initial Application Schema

create table public.users (
  "user" uuid primary key references auth.users (id) on delete restrict,
  name text check (name is null or btrim(name) <> ''),
  weight_g integer check (weight_g is null or weight_g > 0),
  height_cm integer check (height_cm is null or height_cm > 0)
);

create table public.machines (
  "ID" uuid primary key default gen_random_uuid(),
  "user" uuid not null references public.users ("user") on delete restrict,
  unique ("ID", "user")
);

create table public.workouts (
  "workoutID" text primary key,
  "user" uuid not null references public.users ("user") on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  unique ("workoutID", "user")
);

create table public.exercises (
  "ID" uuid primary key default gen_random_uuid(),
  "user" uuid not null references public.users ("user") on delete restrict,
  "workoutID" text not null,
  exercise uuid,
  exercise_name text not null check (btrim(exercise_name) <> ''),
  exercise_number integer not null check (exercise_number > 0),
  unique ("ID", "user"),
  unique ("workoutID", "user", exercise_number),
  foreign key ("workoutID", "user")
    references public.workouts ("workoutID", "user") on delete restrict,
  foreign key (exercise, "user")
    references public.machines ("ID", "user") on delete restrict
);

create table public.sets (
  "ID" uuid primary key default gen_random_uuid(),
  "user" uuid not null references public.users ("user") on delete restrict,
  "exerciseID" uuid not null,
  reps integer not null check (reps > 0),
  weight_g integer not null check (weight_g >= 0),
  set_number integer not null check (set_number > 0),
  unique ("exerciseID", "user", set_number),
  foreign key ("exerciseID", "user")
    references public.exercises ("ID", "user") on delete restrict
);

create index machines_user_idx on public.machines ("user");
create index workouts_user_start_time_idx on public.workouts ("user", start_time desc);
create index exercises_workout_user_idx on public.exercises ("workoutID", "user");
create index exercises_machine_user_idx on public.exercises (exercise, "user");
create index sets_exercise_user_idx on public.sets ("exerciseID", "user");

alter table public.users enable row level security;
alter table public.machines enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.sets enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.machines from anon, authenticated;
revoke all on table public.workouts from anon, authenticated;
revoke all on table public.exercises from anon, authenticated;
revoke all on table public.sets from anon, authenticated;

create or replace function public."saveWorkout"(payload jsonb)
returns table (success boolean, "workoutID" text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_stored_user uuid;
  v_workout_id text;
  v_id_parts text[];
  v_timestamp_ms bigint;
  v_start_time timestamptz;
  v_exercises jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_index bigint;
  v_exercise_id uuid;
  v_machine_id uuid;
  v_reps integer;
  v_weight_g integer;
  v_set_number integer;
  v_max_payload_bytes constant integer := 1048576;
  v_max_exercises constant integer := 100;
  v_max_sets_per_exercise constant integer := 100;
begin
  if v_user is null then
    raise exception 'Unauthorized' using errcode = 'PT403';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'workoutID') is distinct from 'string' then
    raise exception 'workoutID must be a string' using errcode = '22023';
  end if;

  v_workout_id := payload ->> 'workoutID';
  v_id_parts := regexp_match(
    v_workout_id,
    '^([0-9]{1,16})-([0-9]{16})-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
  );

  if v_id_parts is null then
    raise exception 'workoutID must use timestamp-random-user format' using errcode = '22023';
  end if;

  if v_id_parts[3]::uuid is distinct from v_user then
    raise exception 'Unauthorized' using errcode = 'PT403';
  end if;

  v_timestamp_ms := v_id_parts[1]::bigint;
  if v_timestamp_ms > 253402300799999 then
    raise exception 'workoutID timestamp is outside the supported range' using errcode = '22023';
  end if;

  v_start_time := to_timestamp(v_timestamp_ms::double precision / 1000);
  if v_start_time > clock_timestamp() + interval '5 minutes' then
    raise exception 'workoutID timestamp is too far in the future' using errcode = '22023';
  end if;

  -- Serialize duplicate submissions before the existence check.
  perform pg_advisory_xact_lock(hashtextextended(v_workout_id, 0));

  select w."user" into v_stored_user
  from public.workouts as w
  where w."workoutID" = v_workout_id;

  if found then
    -- Neither the ID suffix nor a matching ID alone establishes ownership.
    if v_stored_user is distinct from v_user
      or v_stored_user is distinct from v_id_parts[3]::uuid then
      raise exception 'Unauthorized' using errcode = 'PT403';
    end if;

    return query select true, v_workout_id;
    return;
  end if;

  if octet_length(payload::text) > v_max_payload_bytes then
    raise exception 'payload exceeds the maximum size' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(payload) as key(name)
    where name not in ('workoutID', 'exercises')
  ) then
    raise exception 'payload contains unsupported fields' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.users
    where "user" = v_user
  ) then
    raise exception 'The authenticated user is not provisioned' using errcode = '42501';
  end if;

  if jsonb_typeof(payload -> 'exercises') is distinct from 'array'
    or jsonb_array_length(payload -> 'exercises') = 0 then
    raise exception 'exercises must be a nonempty array' using errcode = '22023';
  end if;

  if jsonb_array_length(payload -> 'exercises') > v_max_exercises then
    raise exception 'exercises exceeds the maximum count' using errcode = '22023';
  end if;

  v_exercises := payload -> 'exercises';

  insert into public.workouts ("workoutID", "user", start_time, end_time)
  values (v_workout_id, v_user, v_start_time, clock_timestamp());

  for v_exercise, v_exercise_index in
    select value, ordinality
    from jsonb_array_elements(v_exercises) with ordinality as exercise(value, ordinality)
  loop
    if jsonb_typeof(v_exercise) is distinct from 'object' then
      raise exception 'Each exercise must be a JSON object' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_exercise) as key(name)
      where name not in ('exercise_name', 'machine_id', 'sets')
    ) then
      raise exception 'exercise contains unsupported fields' using errcode = '22023';
    end if;

    if jsonb_typeof(v_exercise -> 'exercise_name') is distinct from 'string'
      or btrim(v_exercise ->> 'exercise_name') = '' then
      raise exception 'exercise_name must be a nonblank string' using errcode = '22023';
    end if;

    if jsonb_typeof(v_exercise -> 'sets') is distinct from 'array'
      or jsonb_array_length(v_exercise -> 'sets') = 0 then
      raise exception 'sets must be a nonempty array' using errcode = '22023';
    end if;

    if jsonb_array_length(v_exercise -> 'sets') > v_max_sets_per_exercise then
      raise exception 'sets exceeds the maximum count' using errcode = '22023';
    end if;

    v_machine_id := null;
    if v_exercise ? 'machine_id' and jsonb_typeof(v_exercise -> 'machine_id') <> 'null' then
      if jsonb_typeof(v_exercise -> 'machine_id') <> 'string' then
        raise exception 'machine_id must be a UUID or null' using errcode = '22023';
      end if;

      begin
        v_machine_id := (v_exercise ->> 'machine_id')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'machine_id must be a UUID or null' using errcode = '22023';
      end;

      if not exists (
        select 1
        from public.machines
        where "ID" = v_machine_id
          and "user" = v_user
      ) then
        raise exception 'machine_id is unavailable' using errcode = '23503';
      end if;
    end if;

    insert into public.exercises (
      "user", "workoutID", exercise, exercise_name, exercise_number
    )
    values (
      v_user,
      v_workout_id,
      v_machine_id,
      btrim(v_exercise ->> 'exercise_name'),
      v_exercise_index::integer
    )
    returning "ID" into v_exercise_id;

    for v_set in
      select value
      from jsonb_array_elements(v_exercise -> 'sets') as set_entry(value)
    loop
      if jsonb_typeof(v_set) is distinct from 'object' then
        raise exception 'Each set must be a JSON object' using errcode = '22023';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(v_set) as key(name)
        where name not in ('reps', 'weight_g', 'set_number')
      ) then
        raise exception 'set contains unsupported fields' using errcode = '22023';
      end if;

      if jsonb_typeof(v_set -> 'reps') is distinct from 'number'
        or (v_set ->> 'reps') !~ '^[0-9]+$' then
        raise exception 'reps must be a positive integer' using errcode = '22023';
      end if;

      if jsonb_typeof(v_set -> 'weight_g') is distinct from 'number'
        or (v_set ->> 'weight_g') !~ '^[0-9]+$' then
        raise exception 'weight_g must be a nonnegative integer' using errcode = '22023';
      end if;

      if jsonb_typeof(v_set -> 'set_number') is distinct from 'number'
        or (v_set ->> 'set_number') !~ '^[0-9]+$' then
        raise exception 'set_number must be a positive integer' using errcode = '22023';
      end if;

      v_reps := (v_set ->> 'reps')::integer;
      v_weight_g := (v_set ->> 'weight_g')::integer;
      v_set_number := (v_set ->> 'set_number')::integer;

      insert into public.sets ("user", "exerciseID", reps, weight_g, set_number)
      values (v_user, v_exercise_id, v_reps, v_weight_g, v_set_number);
    end loop;
  end loop;

  return query select true, v_workout_id;
end;
$$;

revoke all on function public."saveWorkout"(jsonb) from public, anon;
grant execute on function public."saveWorkout"(jsonb) to authenticated;
