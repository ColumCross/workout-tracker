import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card, Divider, List, Text, useTheme } from "react-native-paper";

import { GhostButton } from "../components/GhostButton";
import { Screen } from "../components/Screen";
import { copy } from "../copy";
import { getWorkouts, type WorkoutReport } from "../workoutGateway";
import { formatWeight } from "../viewModel";

export function ReportsScreen({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [workouts, setWorkouts] = useState<WorkoutReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      setWorkouts(await getWorkouts());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load reports.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <Screen>
      <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>Reports</Text>
      {loading ? <Text>Loading workouts...</Text> : null}
      {!loading && !error && workouts.length === 0 ? <Text>No saved workouts yet.</Text> : null}
      {!loading && !error ? workouts.map((workout) => (
        <View key={`${workout.start_time}-${workout.local_timezone}`} style={styles.workout}>
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>
            Workout on {formatWorkoutDate(workout.start_time, workout.local_timezone)}
          </Text>
          {workout.exercises.map((exercise) => (
            <Card key={exercise.exercise_number} mode="outlined">
              <Card.Title title={exercise.exercise_name} />
              <Card.Content>
                {exercise.sets.map((set) => (
                  <View key={set.set_number}>
                    <List.Item title={`Set ${set.set_number} · ${set.reps} reps · ${formatWeight(set.weight_g / 1000)} ${copy.unit}`} />
                    <Divider />
                  </View>
                ))}
              </Card.Content>
            </Card>
          ))}
        </View>
      )) : null}
      {error ? <Text style={{ color: theme.colors.error }}>{error}</Text> : null}
      <View style={styles.actions}>
        {error ? <GhostButton disabled={loading} onPress={load}>Retry</GhostButton> : null}
        <GhostButton onPress={onBack}>Back</GhostButton>
      </View>
    </Screen>
  );
}

function formatWorkoutDate(startTime: string, timeZone: string) {
  const date = new Date(startTime);
  const parts = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", timeZone }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return `${month} ${day}${ordinalSuffix(day)}`;
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}

const styles = StyleSheet.create({
  workout: { gap: 12 },
  actions: { gap: 12, marginTop: "auto" },
});
