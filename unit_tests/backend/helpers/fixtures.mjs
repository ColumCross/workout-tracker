let sequence = 1;

export function workoutId(userId, { timestamp = Date.now() - 1_000, serial } = {}) {
  const value = serial ?? sequence++;
  return `${timestamp}-${String(value).padStart(16, "0")}-${userId}`;
}

export function workoutPayload(id, { machineId = null, prefix = "Fixture", timezone = "Etc/UTC" } = {}) {
  return {
    workoutID: id,
    local_timezone: timezone,
    exercises: [
      {
        exercise_name: `  ${prefix} press  `,
        machine_id: machineId,
        sets: [
          { reps: 10, weight_g: 80_000, set_number: 1 },
          { reps: 8, weight_g: 85_000, set_number: 2 },
        ],
      },
      { exercise_name: `${prefix} row`, sets: [{ reps: 12, weight_g: 0, set_number: 3 }] },
    ],
  };
}

export function clone(value) {
  return structuredClone(value);
}
