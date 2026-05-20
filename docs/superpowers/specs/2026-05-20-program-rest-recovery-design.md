# Program Rest Recovery Visualization

Replace the existing "cycle gap" rest indicator in the Program Editor with a stimulus-derived recovery-hours signal.

## Problem

The current chips between workout rows show "workouts skipped" (gap in cycle slots) and a 0/1/2/∞ number. Two issues:

- The unit is opaque — "1" doesn't tell you how long to rest.
- It ignores stimulus magnitude — 12 sets of heavy bench and 3 sets of cable fly produce the same chip even though their recovery demand is very different.

Users train by feel (no fixed schedule), so they need an actionable number: **how many hours to rest before the next workout**.

## Solution

For each transition between two consecutive workouts in the cycle (with wrap), compute per-muscle required recovery hours from the *prior* workout's stimulus on that muscle. Surface a single bottleneck number ("≥48h, chest") with per-muscle chips for the constraint muscles.

### Formula

For each muscle M that appears in **both** `W_prev` and `W_next`:

```
fatigueUnits(M, W_prev) = Σ over exercises in W_prev hitting M:
    targetSets × muscleIntensity × FATIGUE_TIER_WEIGHTS[exercise.fatigueTier]

recoveryHours(M) = clamp(24 + 6 × fatigueUnits(M, W_prev), 24, 96)
```

- `FATIGUE_TIER_WEIGHTS` already exists in `@macromaxxing/db/muscle-load`: `{1: 1.0, 2: 0.75, 3: 0.5, 4: 0.25}`.
- `targetSets` falls back to the existing default if null: `5` for strength goals, `3` for hypertrophy (matching `programLoad.ts`).
- Muscle is counted only if exercise→muscle `intensity ≥ 0.3` (existing `REST_INTENSITY_THRESHOLD` — incidental hits don't drive recovery).
- Calibration constant `6` is heuristic-derived (4 sets heavy bench → 48h; 8 sets → 72h). User may want to tune later.

Bottleneck for the transition = max of `recoveryHours(M)` across constraint muscles.

### What changes in the UI

- **Between-row band** continues to render between every adjacent pair, including the cycle wrap (last → first, dashed connector).
- Band content becomes:
  - If no muscle overlap between W_prev and W_next: `fresh — no overlap` (neutral / success tone).
  - Otherwise: `≥{bottleneck}h ({muscle name})` headline + per-muscle constraint chips.
- Each chip: `{muscle short label} {hours}h`, colored by hours:
  - green: ≤ 24h
  - amber: 25–48h
  - red: > 48h

### What stays the same

- In-row content (exercise names · separated, muscle volume chips sorted by effective sets).
- Cycle wrap rendering (dashed line, "cycles →" label remains, retoned for the new content).
- Program-level totals and sidebar muscle load — untouched.

## Scope decisions

- **Prior-workout-only.** Cumulative fatigue across multiple cycle positions is ignored in v1. A muscle hit hard in W₀, lightly in W₁, then again in W₂ uses only W₁'s stimulus to size the W₁→W₂ rest. Predictable, local math; revisit if it bites in real use.
- **No user knobs.** No "extra recovery multiplier," no schedule input, no per-muscle override. Pure derivation.
- **No deep-history chip.** Only show chips for constraint muscles (muscles in both W_prev and W_next). Non-overlapping muscles in W_next aren't chipped.

## Files affected

- `src/lib/workouts/programRest.ts` — replace `RestMuscle.gap` with `recoveryHours`; rewrite `computeProgramRest` to use stimulus formula; remove `classifyRest`/`RestQuality` (replaced by hour-bucket function).
- `src/lib/workouts/programRest.test.ts` — rewrite tests for hours-based output: known stimulus → expected hours, no-overlap → fresh, cycle wrap, intensity threshold floor.
- `src/features/workouts/components/MuscleChip.tsx` — `MuscleRestChip` shows `{label} {hours}h`, color by hour bucket. `MuscleVolumeChip` unchanged.
- `src/features/workouts/components/ProgramRestTransition.tsx` — replace "rest →" headline with "≥{X}h ({muscle})" or "fresh — no overlap"; drop overworked count (subsumed by headline).

## Testing

Unit tests in `programRest.test.ts`:

- Single overlapping muscle, known stimulus → expected hours within tolerance.
- No overlap between W_prev and W_next → empty constraint list, bottleneck = 0.
- Cycle wrap: last → first computed correctly with full cycle visibility.
- Intensity below 0.3 threshold → not counted toward stimulus.
- Stimulus saturates at the 96h cap.
- targetSets null fallback uses correct default per training goal.

Visual verification on the live program editor at `/plans/programs/wpr_01ks2w9x4fesjvbfn91hzrb2f3` with prod data already copied locally.

## Out of scope (deferred)

- Per-user recovery-rate calibration knob.
- Schedule-aware "should I do this today?" indicator on the dashboard.
- Cumulative fatigue across multiple prior workouts.
- Backing this with actual session-log timestamps (vs cycle-position).
