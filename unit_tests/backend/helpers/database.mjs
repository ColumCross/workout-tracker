import { execFileSync } from "node:child_process";

const container = "supabase_db_workout-tracker";

export function sqlLiteral(value) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function databaseCommand(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

export function databaseRows(query) {
  const normalized = query.trim().replace(/;$/, "");
  const output = databaseCommand(
    `select coalesce(json_agg(row_to_json(result)), '[]'::json)::text from (${normalized}) as result`,
  );
  return JSON.parse(output || "[]");
}

export function aggregateSnapshot(workoutId) {
  return databaseRows(`
    select to_jsonb(w) as workout,
      (select coalesce(jsonb_agg(to_jsonb(e) order by e.exercise_number), '[]')
       from public.exercises e where e."workoutID" = w."workoutID") as exercises,
      (select coalesce(jsonb_agg(to_jsonb(s) order by e.exercise_number, s.set_number), '[]')
       from public.sets s join public.exercises e on e."ID" = s."exerciseID"
       where e."workoutID" = w."workoutID") as sets
    from public.workouts w where w."workoutID" = ${sqlLiteral(workoutId)}
  `);
}

export function hierarchyCounts(userId) {
  return databaseRows(`select
    (select count(*)::integer from public.workouts where "user" = ${sqlLiteral(userId)}::uuid) as workouts,
    (select count(*)::integer from public.exercises where "user" = ${sqlLiteral(userId)}::uuid) as exercises,
    (select count(*)::integer from public.sets where "user" = ${sqlLiteral(userId)}::uuid) as sets`)[0];
}
