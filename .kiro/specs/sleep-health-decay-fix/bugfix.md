# Bugfix Requirements Document

## Introduction

Property-based testing uncovered that a sleeping pet still loses health from low joy (happiness < 20) and low discipline (discipline < 20). Because these two health penalties are applied every tick regardless of whether the pet is asleep, a pet can silently lose all its health and die in its sleep while the computer is away.

The health decay logic in `src/pet-state.js` (the `hurts` block inside `tickMinute`) already guards two of the "soft" penalties — distraction (`healthDistracted`) and ignored sleepiness (`healthIgnoredSleepy`) — with `!pet.asleep`, but the joyless and undisciplined penalties are missing that guard. The intended design (per product steering and the surrounding code) is that while asleep, only "hard" problems hurt health: starving, sickness from pending Mac updates, and dirtiness/flies/mess. Low joy, low discipline, and distraction should not hurt a sleeping pet.

This fix makes the joyless and undisciplined penalties skip while asleep, so a sleeping pet that is neither starving nor sick nor dirty always survives. After the fix, the existing property test "a pet cannot die while asleep with the computer away" is tightened back to its full form (joy and discipline allowed down to 0), so the stronger invariant is actually exercised.

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PetTickState
  OUTPUT: boolean

  // The pet is asleep, is NOT in a hard health-draining state
  // (not starving, not sick, not dirty, no flies, not mess-sick),
  // but IS joyless or undisciplined — which currently drains health.
  RETURN X.asleep = TRUE
     AND X.hunger > 0
     AND X.needsMedicine = FALSE
     AND X.dirty = FALSE
     AND X.flies = FALSE
     AND X.messSick = FALSE
     AND (X.happiness < 20 OR X.discipline < 20)
END FUNCTION
```

### Property — Fix Checking

```pascal
// Property: a sleeping pet with no hard problem loses no health from
// low joy or low discipline.
FOR ALL X WHERE isBugCondition(X) DO
  result ← tickMinute'(X)
  ASSERT result.health >= X.health   // health does not drop from joyless/undisciplined while asleep
  ASSERT result.ghost = FALSE        // and it never dies in its sleep
END FOR
```

### Property — Preservation Checking

```pascal
// Property: for every input that does NOT trigger the bug, the fixed
// function behaves exactly like the original.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT tickMinute(X) = tickMinute'(X)
END FOR
```

Preservation covers awake pets (where joyless/undisciplined penalties must still apply) and sleeping pets that are already in a hard health-draining state (starving, sick, dirty, flies, mess-sick), where health damage from those hard causes continues unchanged.

## Bug Analysis

### Current Behavior (Defect)

While asleep, the health decay block in `tickMinute` still applies the joyless and undisciplined penalties, so a pet with low joy or low discipline keeps losing health and can die in its sleep.

1.1 WHEN the pet is asleep AND happiness is below 20 THEN the system applies the joyless health penalty (`healthJoyless`) each tick, draining health even though the pet is asleep
1.2 WHEN the pet is asleep AND discipline is below 20 THEN the system applies the undisciplined health penalty (`healthUndisciplined`) each tick, draining health even though the pet is asleep
1.3 WHEN the pet is asleep with the computer away AND it is joyless or undisciplined but not starving or sick THEN the system can drain health to 0 and turn the pet into a ghost (it dies in its sleep)

### Expected Behavior (Correct)

While asleep, only hard problems (starving, sickness from pending updates, dirtiness, flies, mess-sickness) hurt health. Soft penalties — joyless, undisciplined, distraction — do not apply while asleep.

2.1 WHEN the pet is asleep AND happiness is below 20 THEN the system SHALL NOT apply the joyless health penalty
2.2 WHEN the pet is asleep AND discipline is below 20 THEN the system SHALL NOT apply the undisciplined health penalty
2.3 WHEN the pet is asleep with the computer away AND it is neither starving nor sick nor dirty THEN the system SHALL keep the pet alive for the entire away stretch (it never becomes a ghost from low joy or low discipline)

### Unchanged Behavior (Regression Prevention)

Awake pets must still be penalized for low joy and low discipline, and sleeping pets must still lose health from hard problems. The already-guarded distraction and ignored-sleepiness penalties stay as they are.

3.1 WHEN the pet is awake AND happiness is below 20 THEN the system SHALL CONTINUE TO apply the joyless health penalty
3.2 WHEN the pet is awake AND discipline is below 20 THEN the system SHALL CONTINUE TO apply the undisciplined health penalty
3.3 WHEN the pet is asleep AND hunger has reached 0 (starving) THEN the system SHALL CONTINUE TO apply the starving health penalty
3.4 WHEN the pet is asleep AND it needs medicine (pending updates) THEN the system SHALL CONTINUE TO apply the sick health penalty
3.5 WHEN the pet is asleep AND it is dirty, has flies, or is mess-sick THEN the system SHALL CONTINUE TO apply the dirty, flies, and mess-sick health penalties
3.6 WHEN the pet is asleep AND it is distracted or has ignored sleepiness THEN the system SHALL CONTINUE TO skip the distraction and ignored-sleepiness health penalties (unchanged, already guarded by `!pet.asleep`)
3.7 WHEN nothing is wrong AND hunger is above 40 AND happiness is above 30 THEN the system SHALL CONTINUE TO regenerate health at the normal rate
