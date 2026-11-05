# Bugfix Requirements Document

## Introduction

Property-based testing uncovered that a sleeping pet can still lose health from low joy and low discipline, which lets a pet drain to 0 health and turn into a ghost ("died in its sleep"). While asleep, only starvation, sickness (pending updates), and mess-related problems (dirty / flies / mess-sickness) should be able to hurt health. Low joy, low discipline, and distraction should not apply damage while the pet is asleep.

In `tickMinute` (src/pet-state.js), the distraction and ignored-sleepy penalties are already correctly guarded with `&& !pet.asleep`, but the joyless (`happiness < 20`) and undisciplined (`discipline < 20`) penalties are applied unconditionally. The fix guards those two penalties with `&& !pet.asleep`.

A property test, "a pet cannot die while asleep with the computer away" (test/pet-state.test.js), was previously weakened to work around this bug: it restricts `happiness` to a minimum of 20 and `discipline` to a minimum of 20 so the joyless/undisciplined damage never triggers, with an explanatory comment describing the workaround. Once the fix lands, that property test must be tightened back to its full form — any pet that is not starving or sick survives sleep regardless of joy or discipline level.

## Bug Analysis

### Current Behavior (Defect)

When a pet is asleep, mood- and behavior-based health penalties still apply, so a healthy-but-unhappy pet can die in its sleep.

1.1 WHEN `tickMinute` runs AND `pet.asleep === true` AND `pet.happiness < 20` THEN the system SHALL add `BALANCE.healthJoyless` to the per-minute health damage total, reducing `pet.health` by that amount during the minute tick
1.2 WHEN `tickMinute` runs AND `pet.asleep === true` AND `pet.discipline < 20` THEN the system SHALL add `BALANCE.healthUndisciplined` to the per-minute health damage total, reducing `pet.health` by that amount during the minute tick
1.3 WHILE `pet.asleep === true` AND `pet.hunger > 0` (not starving) AND `pet.needsMedicine === false` (not sick) AND (`pet.happiness < 20` OR `pet.discipline < 20`), THE system SHALL continue draining `pet.health` by `BALANCE.healthJoyless` and/or `BALANCE.healthUndisciplined` each minute tick until `pet.health <= 0`, at which point `tickMinute` sets `pet.ghost = true` and emits the `died` event

### Expected Behavior (Correct)

While asleep, only starvation, sickness, and mess-related problems should hurt health.

2.1 WHILE `pet.asleep === true`, IF `pet.happiness < 20` THEN the system SHALL NOT add `BALANCE.healthJoyless` to the per-minute health damage total
2.2 WHILE `pet.asleep === true`, IF `pet.discipline < 20` THEN the system SHALL NOT add `BALANCE.healthUndisciplined` to the per-minute health damage total
2.3 WHEN `tickMinute` runs AND `pet.asleep === true` AND `pet.hunger > 0` (not starving) AND `pet.needsMedicine === false` (not sick) AND the pet has no mess (`pet.poop` empty, `pet.flies` false, `pet.messSick` false) THEN the system SHALL leave `pet.health` after the tick equal to `pet.health` before the tick, so low joy or low discipline cannot drive it toward 0
2.4 WHEN guarding the joyless and undisciplined penalties THEN the system SHALL apply the same `&& !pet.asleep` condition already used for the distraction penalty (`pet.distracted && !pet.asleep`)

### Unchanged Behavior (Regression Prevention)

The fix must be narrowly scoped to the asleep case; for every input that is not an asleep pet with low joy or low discipline, the health block must behave identically before and after the fix (F(X) == F'(X)).

3.1 WHEN the pet is awake (`pet.asleep === false`) AND `pet.happiness < 20` THEN the system SHALL CONTINUE TO add `BALANCE.healthJoyless` to the per-minute health damage total
3.2 WHEN the pet is awake (`pet.asleep === false`) AND `pet.discipline < 20` THEN the system SHALL CONTINUE TO add `BALANCE.healthUndisciplined` to the per-minute health damage total
3.3 WHEN the pet is asleep AND `pet.hunger <= 0` (starving) THEN the system SHALL CONTINUE TO add `BALANCE.healthStarving` to the per-minute health damage total
3.4 WHEN the pet is asleep AND `pet.needsMedicine === true` (sick) THEN the system SHALL CONTINUE TO add `BALANCE.healthSick` to the per-minute health damage total
3.5 WHEN the pet is asleep AND it has uncleaned mess THEN the system SHALL CONTINUE TO add `BALANCE.healthDirty` (dirty), `BALANCE.healthFlies` (`pet.flies`), and `BALANCE.healthMessSick` (`pet.messSick`) as applicable
3.6 WHILE `pet.asleep === true`, THE system SHALL CONTINUE TO withhold `BALANCE.healthDistracted` and `BALANCE.healthIgnoredSleepy` exactly as the existing `!pet.asleep` guards already do

### Fix Verification (Tightened Property Test)

The weakened property test must be restored to its full, bug-catching form.

4.1 WHEN the "a pet cannot die while asleep with the computer away" property test runs THEN its happiness generator and its discipline generator SHALL each cover the full inclusive range from a minimum of 0 to a maximum of 100
4.2 WHEN any generated asleep pet has a hunger value of at least 80 and is neither sick nor dirty THEN the test SHALL assert the pet's ghost flag remains false at every simulated minute of the away stretch (from 1 up to a maximum of 16 hours) for all generated happiness and discipline values in the 0 to 100 range
4.3 WHEN the test file is updated THEN the explanatory comment describing the minimum-20 happiness/discipline workaround SHALL be removed and replaced with comment text that states the generators now span the full 0 to 100 range and describes the restored sleep-safety behavior

## Deriving the Bug Condition

**F**: the original `tickMinute` health block, which pushes `healthJoyless` whenever `happiness < 20` and `healthUndisciplined` whenever `discipline < 20`, unguarded by sleep state.

**F'**: the fixed `tickMinute` health block, where both penalties are guarded with `&& !pet.asleep`.

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PetState (as seen by tickMinute)
  OUTPUT: boolean

  // Asleep pet taking mood/behavior damage it shouldn't
  RETURN X.asleep = true
     AND (X.happiness < 20 OR X.discipline < 20)
END FUNCTION
```

### Fix Checking

```pascal
// Property: Fix Checking - asleep pets take no joyless/undisciplined damage
FOR ALL X WHERE isBugCondition(X) DO
  healthBefore ← X.health
  result ← tickMinute'(X)   // F'
  // The joyless and undisciplined penalties contribute nothing while asleep.
  // (Health may still change from starving / sick / mess damage, which are
  //  handled by the Preservation property below.)
  ASSERT joylessDamageApplied(result) = false
     AND undisciplinedDamageApplied(result) = false
END FOR
```

Concrete counterexample the fix must resolve: an asleep baby pet with `hunger = 90`, `happiness = 0`, `discipline = 0`, `needsMedicine = false`, no mess, and modest starting health drains to 0 health over a long away sleep and becomes a ghost under F, but survives under F'.

### Preservation Checking

```pascal
// Property: Preservation Checking - every non-buggy input behaves identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

`NOT isBugCondition(X)` covers every awake pet (so awake joyless/undisciplined damage is untouched, 3.1–3.2) and every asleep pet whose happiness and discipline are both at or above 20 (where the two penalties never contributed anyway). Starving, sick, and mess damage while asleep are driven by other predicates (`hunger <= 0`, `needsMedicine`, `dirty`/`flies`/`messSick`) that the fix does not touch, so they are preserved (3.3–3.5), as are the already-guarded distraction and ignored-sleepy penalties (3.6).
