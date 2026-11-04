# Bytepet — product

## What it is

Bytepet is a desktop virtual pet for macOS, inspired by the 1990s LCD handheld pets. The pet lives on top of your desktop as a floating, always-on-top window and is cared for by your real work habits. Finishing tasks feeds it, focus sessions give it XP, git commits are small snacks, screen breaks put it to sleep, and pending Mac updates make it sick. Neglect it and it becomes a ghost — then your work resurrects it.

Built for the Kiro hackathon, Resurrection category: the 1990s LCD handheld pet, reborn as a desktop companion.

## Who it's for

Developers, students and knowledge workers who spend their day at a Mac and want a playful, low-stakes companion that quietly ties into their productivity. The pet rewards real work (commits, finished tasks, focused time) and gently nudges you away from distractions. It never blocks your work or steals keyboard focus.

## The five meters

All meters run 0–100. Food is counted in units: 1 unit = 20 points, so 5 units = full. Meters are in `src/pet-state.js` as pure functions; the constants are in `BALANCE`.

### 🍙 Food (hunger)

- Goes down over time: about 1 unit an hour at the computer, slower while working in a work app.
- Goes up from finishing tasks: small = 1 unit, medium = 2, large = 3. Commits give 0.5 units. Working in a work app keeps hunger steady.
- At 0, the pet is starving and health starts draining.

### 💗 Joy (happiness)

- Goes down over time. Drops faster when the pet is sleepy, worn out (energy < 15), or sad from distraction.
- Goes up from tasks, verified focus sessions, mini-games, music, cleaning up digital mess, pats (limited by a daily pat budget), and landing in the basket.

### ⚡ Energy

- Goes up while the Mac is charging; goes down on battery. Drops faster when the pet is hungry or sleepy. Playing costs energy.
- Sleep (napping while you're away, or a night's sleep) refills it. A pet with no energy is too tired to play.

### 🎖️ Discipline

- Goes down on distracting apps and sites. Going back to a work app gives a refocus bonus.
- Below 20, health starts hurting. High discipline (90+) unlocks an achievement and helps the pet grow into a Zen Master.

### 💚 Health

- Drops when anything is wrong: starving, sick (pending updates), dirty (worse with flies), joyless (happiness < 20), undisciplined (discipline < 20), sulking (distracted), or a missed deadline (−20 in one hit).
- Heals only when nothing is wrong and hunger > 40 and happiness > 30. Installing updates (medicine) gives +30 in one shot.
- At 0, the pet dies and becomes a ghost. It can't die while the Mac is closed or asleep.

## How the meters affect each other

The meters form an interlocking system, like a classic handheld pet:

- **Food → Joy & Energy:** A hungry pet (hunger < 1 unit) loses joy faster and drains energy faster. You can't keep a pet happy or energetic by patting alone — it needs real food from real work.
- **Joy → Health:** A joyless pet (happiness < 20) slowly loses health. Health only regenerates when the pet is both fed (hunger > 40) and happy (happiness > 30).
- **Discipline → Health:** Low discipline (below 20) drains health. Staying focused keeps discipline and health up.
- **Energy → Joy:** A worn-out pet (energy < 15) loses joy faster, and is too tired to play. Sleep (locking the screen, stepping away) refills energy.
- **Distraction → Joy, Discipline & Health:** Being on distracting apps drops discipline, drains joy, and eventually hurts health. Going back to work gives a discipline bonus and clears the sadness.
- **Sickness → Joy & Health:** Pending Mac updates make the pet sick: joy drops slowly and health drains until you install the updates (medicine +30).
- **Mess → Health:** Digital mess (cluttered Desktop, Downloads, Trash, too many tabs) creates poop. Poop left for an hour attracts flies; after two hours the pet gets sick. Cleaning up cures it.
- **Missed deadline → Health & Joy:** A missed deadline is a care mistake, costs −20 health and −15 joy in one hit.

## Life stages and adult forms

The pet grows through egg → baby → child → adult based on XP. How you work while it's a child decides its adult form (chosen by `adultForm()` in `src/pet-state.js`):

| Form | How |
|---|---|
| 🦉 Night Owl | lots of work after 10 PM |
| </> Coder | code editors, terminals and commits |
| ✍️ Writer | Docs, Word, Notion, Pages… |
| 🎨 Artist | Figma, Photoshop, Procreate, Blender… |
| ✨ Zen Master | regular breaks and high discipline |
| 🎓 Scholar | big tasks and focus sessions |
| 🎮 Gamer | more distraction than work |
| 😤 Grumpy | more than 5 care mistakes |

With 3 or fewer care mistakes and discipline 40+, it grows into a Zen Master (star). Otherwise it grows up grumpy. Discovered forms are kept in `profile.petdex`.

## Death and revival

At 0 health the pet becomes a ghost with a gravestone on your desktop. Finish tasks (S +20%, M +35%, L +60%) or a focus session (+20%) within 3 days to revive it. Otherwise it moves on to the cemetery and a new egg hatches (Byte II, Byte III…). Achievements, streaks and postcards survive across generations.

## Age, streaks and unlocks

One good day (2 tasks, or 1 task + 1 focus session, or 2 focus sessions) = one year of age. Good days in a row build a streak. Streaks unlock accessories: Bow (3 days), Cap (7), Sunglasses (14), Wizard hat (30). Vacation days pause the streak without breaking it.
