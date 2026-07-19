/**
 * MCP-facing documentation strings.
 *
 * Two channels, deliberately split by cost and audience:
 *
 *  - `MCP_INSTRUCTIONS` is returned in the `initialize` handshake (mcp.ts) and is therefore
 *    GLOBAL — identical for every authenticated user and re-sent on every connection. It must
 *    hold only the irreducible, user-agnostic frame + the handful of tool caveats agents get
 *    wrong without being told. Keep it tight; it is paid on every handshake.
 *  - `WORKOUT_GUIDE` is the long-form conventions reference, surfaced on demand via the
 *    zero-argument `workout.guide` tool. Depth that the always-on instructions shouldn't carry.
 *
 * Everything here is stable, platform-wide knowledge. Per-user state (active program, sessions,
 * body metrics) and per-user policy are NOT encoded here — they are pulled live from the data
 * tools or read from the user's own settings.
 */

export const MCP_INSTRUCTIONS = `Macromaxxing is a nutrition + strength-training tracker. It manages recipes, ingredients, and meal plans (per-portion macro tracking), and workout exercises, templates, programs, and logged sessions (hypertrophy/strength training with MEV/MAV/MRV weekly volume landmarks). Every tool operates on the authenticated user's own data; pull live state from the data tools rather than assuming it.

When designing or modifying TRAINING programs, these are non-negotiable:

1. Use muscle-load data, not intuition. Check each muscle against its MEV/MAV/MRV zone before adding or cutting volume — below MEV, add volume in any productive form; at or above MAV, justify the marginal set.
2. The three muscle-load tools are distinct and not interchangeable: workout_workoutMuscleLoad (one template's weekly load), workout_programMuscleLoad (the whole program cycle, and the ONLY reliable source for balance ratios — push/pull, biceps/triceps, anterior/posterior), workout_sessionMuscleLoad (a single logged session, working sets only). Never hand-aggregate per-session loads to estimate ratios.
3. workout_createExercise: fill every field. On isolations, pass explicit null for the strength rep range — never omit it. Pass the technique guide (description, cues, pitfalls) inline in the same call, not as a separate workout_upsertGuide follow-up.
4. One row per exercise per template. Warmup ramps are logged ad hoc during a session, never as separate template rows. setMode "full" means the row covers the warmup ramp plus working sets; its target sets/reps/weight describe the working sets only.
5. Verify after building: a template with workout_workoutMuscleLoad, a program with workout_programMuscleLoad.
6. Bodyweight exercises (bwMultiplier > 0): workout_addSet / workout_updateSet take added kg only (belt/vest); the server stores effective load (bodyWeight × multiplier + added). Template targetWeight is also added kg. Logged weightKg in history is the collapsed effective total — never pass it back as added kg. User must have weightKg in settings.

Call workout_guide (no arguments) for the full conventions reference: fatigue tiers, rep ranges, muscle-intensity scale, the volume-landmark table, movement-family classification, home/gym programming, bodyweight exercise semantics, and tool gotchas.`

export const WORKOUT_GUIDE = `# Macromaxxing — Training & Program Design Guide

Stable conventions for designing exercises, templates, and programs. Live training state (current program, sessions, body metrics) must be pulled from the data tools and from the user's settings — never assumed from this document.

## Conventions

- Templates carry an optional \`locationId\` (first-class training location — see Locations & equipment below). Legacy templates may instead be tagged \`@ <location>\` in their name (e.g. "Bench @ MyGym"); prefer the structured field. Templates without a location are location-flexible.
- Preserve a user's existing naming style when creating related exercises — names often encode bench angles (e.g. "Incline DB Press 30°", "Shoulder Press 80°").
- Warmup / working / backoff sets are logged separately during a session; rep targets are meaningful and should be respected.
- Source of truth for exercise patterns is the seed catalog (\`seed-exercises.ts\`). Match its conventions when creating new custom exercises.

## Exercise fields

**Fatigue tier** (1 = highest systemic load, 4 = lowest):
- Tier 1 — Heavy barbell compounds: Bench Press, Squat, Deadlift
- Tier 2 — Secondary compounds: Incline Bench, OHP, Barbell Row, Pullup, RDL, most DB press variants
- Tier 3 — Moderate isolations with real systemic cost: Face Pull, Cable Fly, Hammer Curl
- Tier 4 — Low-fatigue isolations: Lateral Raise, Bicep Curl, Tricep Extension, Leg Curl, Leg Extension, Rear Delt Fly, Calf Raise

**Rep ranges** (fill on every new exercise; legacy user exercises may carry nulls for historical reasons):
- Compound presses: strength 3-5, hypertrophy 8-12 — use strength 5-8 for DB press variants (sub-5-rep DB pressing is a stability problem, not a strength stimulus)
- Row-family compounds: strength 5-8, hypertrophy 8-15
- Standard isolations: strength null, hypertrophy 10-15
- Very-low-load isolations (lateral raise, rear delt fly, calf raise): hypertrophy 12-20
- Stretched-position tricep isolations (skullcrushers): hypertrophy 8-12 — heavier than a typical isolation because the stretch position rewards mechanical tension

**Muscle intensity** (0-1 scale): 1.0 primary driver, 0.5-0.8 secondary, 0.3 incidental. Match seed patterns — e.g. a flat press is chest 1.0 / triceps 0.5 / front_delts 0.3.

**Bodyweight multiplier (\`bwMultiplier\`)** — on every exercise; default 0:
- \`0\` — barbell/dumbbell/cable: all weight fields are absolute kg on the bar or stack.
- \`> 0\` — bodyweight exercise: weight fields are **added load only** (weight belt, vest, dip belt). The server expands to effective kg at log time: \`userWeightKg × bwMultiplier + addedKg\`, using the user's current \`weightKg\` from settings (settings_get / saveProfile). Stored \`workout_logs.weight_kg\` is always this collapsed effective total.
- Common values: pull-up / chin-up / dip → \`1.0\`; push-up → \`0.65\`. System Pull-Up is seeded at \`1.0\`.
- Template \`targetWeight\` follows the same rule: \`0\` = unweighted, \`20\` = +20 kg belt. Warmup/backoff auto-generation and template volume previews expand bodyweight from the user's \`weightKg\` in settings.
- When reading history (\`workout_exerciseHistory\`, \`workout_lastSessionForExercise\`, session logs): \`weightKg\` is effective. Do **not** pass historical \`weightKg\` back into \`workout_addSet\` for a BW exercise — that would double-count bodyweight.
- \`workout_importSets\` treats imported weights as added kg and expands to effective load for bodyweight exercises (user must have \`weightKg\` set in settings).

## Locations & equipment

Users can define training locations (gym, home, hotel) with an equipment checklist, and exercises can declare required equipment. Both sides use the same fixed vocabulary: barbell, ez_bar, trap_bar, dumbbell, kettlebell, squat_rack, bench_flat, bench_adjustable, smith_machine, cable_station, lat_pulldown, leg_press, leg_curl_machine, leg_extension_machine, calf_machine, preacher_bench, pullup_bar, dip_station, resistance_band.

- Requirements are AND semantics: an exercise is available at a location iff every required item is present. Barbell-vs-dumbbell variants are separate exercises, not alternatives on one exercise.
- No equipment rows = bodyweight = available everywhere. A location with an empty checklist only satisfies bodyweight exercises.
- Tools: workout_listLocations / createLocation / updateLocation / deleteLocation (equipment passed as a replace-all array). Set a template's location via workout_createWorkout / updateWorkout \`locationId\`.
- Sessions snapshot the template's \`locationId\` at workout_createSession; workout_updateSessionLocation changes where a session is trained without touching the template (e.g. traveling).
- When creating custom exercises, fill \`equipment\` alongside muscles — missing equipment rows silently exempt the exercise from availability warnings.
- When programming for a specific location, check each exercise's required equipment against the location's list and substitute unavailable movements (see Home training gaps below for common substitutions).

## Set modes

- \`working\` — standard working set
- \`warmup\` — ramp-up set
- \`backoff\` — reduced-weight high-rep set after the working sets
- \`full\` — the row represents the full scheme (warmup ramp + working sets logged together); targetSets/Reps/Weight describe the working sets only. Apply to the first heavy compound loading a cold muscle group.

One row per exercise per template — warmup ramps are NOT separate template rows; they are logged ad hoc during the session.

## Volume landmarks (MEV / MAV / MRV, working sets per week)

| Muscle | MEV | MAV | MRV |
|---|---|---|---|
| Chest | 8 | 16 | 22 |
| Upper back | 8 | 18 | 25 |
| Lats | 8 | 18 | 25 |
| Side delts | 8 | 18 | 26 |
| Rear delts | 6 | 14 | 24 |
| Biceps | 8 | 16 | 26 |
| Triceps | 6 | 12 | 18 |
| Quads | 8 | 14 | 20 |
| Hamstrings | 6 | 12 | 20 |

(The app tracks mev/mav/mrv for every muscle group automatically; these are the ones worth remembering when planning.)

## Programming principles

**Use muscle-load data, not vibes.** Before finalizing a template, run workout_workoutMuscleLoad. Overlap intuitions are wrong in both directions: two DB presses at similar weights can leave chest below MEV (6 sets when the threshold is 8) while the session looks productive; two stretched-position tricep isolations (skullcrusher + overhead extension) can look redundant but sit comfortably in MAV (9 sets when MAV is 12) while providing different stretch angles. The question is never "do these overlap?" — it is "what zone is each muscle in?" Below MEV, add volume in any productive form. At MAV and adding more, justify the marginal set.

**Movement family classification.**
- Press family: shoulder flexion and/or horizontal adduction — includes flyes. Chest works on presses AND flyes; the pattern is horizontal adduction, not "pulling."
- Pull family: moving a weight toward the body with the back — rows, pulldowns, pullovers.
Don't mis-label flyes as pulls just because the arc looks inward.

**Home training gaps (bench + adjustable dumbbells).** Muscles hardest to load well with only a bench and adjustable DBs:
- Lats — a DB pullover is a weak substitute for a pulldown; a door-frame pull-up bar solves it instantly.
- Heavy quads — Bulgarian split squats cap on balance/stamina before strength; the DB load ceiling limits absolute intensity.
- Hamstring knee-flexion — no DB equivalent of a leg curl; RDLs only cover the hip-hinge pattern.
- Heavy upper back — DB rows are limited by the DB weight ceiling.
Well-covered at home: chest, triceps, front/side/rear delts, biceps, forearms, core, glutes.

**Week planning.** When splitting a constrained week between home and gym, put the home-impossible work at the gym (lats, heavy quads, hamstrings, heavy upper back, side delts via cable lateral) and use home sessions for home-friendly gap fills (chest, triceps, front/rear delts, core).

**Rear delts.** MEV is 6. A single 3-set rear delt exercise plus incidental face pulls usually lands below MEV. Budget at least one 4-5 set rear delt exercise per week if rear delts are a priority — they recover fast and their fatigue cost is tier 4.

## Working with the tools

- Fill ALL fields when creating exercises. Half-populated exercises (null rep ranges, missing muscle intensities) degrade downstream muscle-load math. On isolations, pass explicit null for the strength rep range — never omit the field. Set \`bwMultiplier\` explicitly (0 for loaded lifts; >0 for bodyweight — see above). Fill \`equipment\` (see Locations & equipment). Pass the technique guide (description, cues, pitfalls) inline in the same workout_createExercise call.
- workout_workoutMuscleLoad (one template's weekly load) vs workout_programMuscleLoad (the whole program cycle + balance ratios) vs workout_sessionMuscleLoad (a logged session, working sets only) are distinct — don't substitute one for another. workout_sessionMuscleLoad counts working sets only, so old-vs-new comparisons stay apples-to-apples.
- workout_programMuscleLoad is the only reliable source for balance ratios (push/pull, biceps/triceps, anterior/posterior). Never hand-aggregate per-session loads to estimate them. If it fails, fall back to per-template workout_workoutMuscleLoad and aggregate manually, but flag that ratio calculations may be missing.
- A 4-week window is sufficient for workout_exerciseHistory.
- workout_listSessions returns a large payload ordered most-recent-first.
- workout_updateWorkout can fail silently when a session derived from that template is currently active. If an update does not take, present the intended final state and retry after the session ends.`
