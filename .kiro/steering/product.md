# Bytepet — project steering

## What it is
A desktop virtual pet for macOS, inspired by 1990s handheld virtual pets (Resurrection category).
The pet lives on top of the desktop and is fed by the user's real work:
git commits, focus time in work apps, focus sessions, and finished tasks.
If neglected it becomes a ghost, and the user's work resurrects it.

## Care system
- Food (units, 5 = full): small/medium/large tasks give 1/2/3 units and 10/20/40 XP; commits 0.5 unit, 5 XP
- Verified 25-min focus session: +10 XP if 80%+ of samples were active and not distracted
- Lights: too much screen time or bedtime → pet goes to bed; locking/sleeping the Mac turns the lights off
- Medicine: pending macOS updates make it sick; installing them cures it
- Discipline: 15-second sampling (`src/distraction.js`): apps, App Store categories (games/entertainment/social), sites, titles; learning keywords and a never-list don't count; breaks and work-hours mode pause it; escalates notice → restless → sad → sulk
- Attention: meetings (calendar .ics), deadlines, PR reviews, uncommitted work → alerts + notifications
- Care mistakes: ignored needs and missed deadlines; they decide star vs grumpy adult
- Mess: Desktop/Downloads/Trash/tab counts over limits → poop; 2h uncleaned → sick
- Age & streaks: good day = 1 year; streaks unlock accessories; vacation pauses everything and returns a postcard
- Graveyard: retired or faded pets become gravestones; next generation hatches
- Achievements: 50, in `src/achievements.js`, evaluated against lifetime totals in the profile
- Mini-games: Brick Breaker, Snack Catch, Left or Right, Memory Beeps, Stretch Break (`renderer/games.js`)
- Task sources: manual, Apple Reminders (JXA), Todoist (API v1), calendar VTODO, GitHub issues — synced by `src/sync.js`

## Look
Original monochrome LCD pixel art: 4 greens (ink, mid, shade, fill) like an old handheld screen, white halo outside
the character (24x24 grid, `renderer/sprites.js`). The Pet tab shows an original "BYTE·PET" handheld with 4 round
buttons (FEED/PLAY/CLEAN/REST). Do not copy existing commercial characters or device designs.

## Adult forms
Picked by `adultForm()` in `src/pet-state.js` from the child's work style: nightowl, coder, writer, artist, zen,
scholar, gamer (too much distraction), grumpy (>5 care mistakes). Discovered forms are kept in `profile.petdex`.

## Colour
The pet itself is monochrome LCD. Colour is only for small indicators (needs, distraction, tiredness, updates,
battery), poop, gravestones, the basket and the UI.

## Death and revival
Ghost + gravestone on the desktop; work fills the revive meter (3 days). Faded or laid-to-rest pets leave a desktop
gravestone (`profile.desktopGraves`) the user moves to the cemetery.

## Strict focus
During focus sessions: hide distracting apps (NSRunningApplication.hide via JXA) and close distracting tabs,
saving them to `profile.savedTabs`. Never delete anything that can't be reopened.

## Stack
- Electron, plain JavaScript, HTML and CSS. No frameworks, no build step.
- `src/pet-state.js` holds all game logic as pure functions. Keep Electron out of it so it stays testable.
- `main.js` owns state, the window, the menu bar, the feed server (127.0.0.1:47777) and focus tracking.
- `renderer/` draws the pet (inline SVG) and handles movement and mouse input.

## Rules
- Keep code simple and readable; comment the "why", not the "what".
- All tracking stays on-device. Never send activity data anywhere.
- New stats or foods go into `pet-state.js` first, with a test in `test/pet-state.test.js`.
- The pet must never steal keyboard focus or block clicks outside its own body.
- Speech lines live in `src/lines.js`; keep them short (under 60 characters).
