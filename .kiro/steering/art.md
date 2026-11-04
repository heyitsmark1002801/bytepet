# Bytepet — art

## Style

Original monochrome LCD pixel art, like a 1990s handheld pet screen. The pet itself is always drawn in the LCD palette. Colour is only for small indicators, props and UI — never on the pet's body.

## Grid

All character art is on a **24×24 grid**, defined in `renderer/sprites.js`. Each sprite is a string grid where each character is one pixel:

- `.` — empty (transparent)
- `o` — ink (outline, eyes, dark details)
- `w` — body fill (the lightest LCD tone)
- `s` — shade (a mid tone, used for shadows and cheeks)
- `x` — highlight (the palest tone, used on the top of the head)

Older art may use other letters (`r y g b p n N k K`) — these all map onto the same few LCD tones through the `tones()` palette function.

## LCD palettes

Four greens, like an old handheld screen:

| Tone | Meaning | LCD hex |
|---|---|---|
| ink (`o`) | outlines, eyes | `#1f2a1a` |
| fill (`w`) | body | `#cfddaf` |
| shade (`s`) | shadows | `#a2b383` |
| highlight (`x`) | top of head | `#e8f0d2` |

Palettes: `lcd` (normal), `sick` (paler, greenish), `ghost` (grey/white), `egg` (same as lcd). The Pet tab in the Hub shows an original "BYTE·PET" handheld with 4 round buttons (FEED/PLAY/CLEAN/REST).

## What's monochrome

The pet, the egg, the ghost, adult forms, and all their faces, poses and accessories are LCD monochrome. The body, headgear (owl ears, coder glasses, scholar cap, etc.), expressions, feet and arms are all layers of string art stamped onto the 24×24 grid in `build()`.

## Where colour is allowed

Colour is only for small indicators, props and UI elements — never the pet itself:

- **Need icons:** food (amber), medicine (red cross), sad/distraction (purple), battery (red), bulb/tired (yellow), bell (amber), attention (red), health (green), etc.
- **Props:** poop (brown), gravestones (grey with green grass), basket (orange/brown), flies (dark), germs (green).
- **Games:** brick colours are candy colours, snack-catch items use simple colours, memory pads use four distinct colours.
- **Postcard scenes:** original pixel-art landscapes (beach, city, mountains, snow, desert, forest, temple, tower, pyramids, canals, tropical, home). The pet waving in the corner is still monochrome LCD.
- **UI:** meter bars, buttons, toasts, the focus chart — standard web CSS.

Icon colours are defined in `ICON_TINTS` in `sprites.js`. Each icon gets a small `tint()` palette with 2–3 colours.

## No copying

- **No real characters or device designs.** The pet and all its forms are original. Do not copy Tamagotchi, Pokémon, Digimon or any other commercial character or creature design.
- **No real brand logos or trademarks.** Accessories, the handheld frame in the Pet tab, and all icons are original. Do not reproduce real brand logos, app icons or product designs.
- **Postcard scenes are stylised, not traced.** The Eiffel Tower, pyramids, canals, temples, etc. are simple original pixel-art impressions, not faithful reproductions.
- **Keep it cute and simple.** The 24×24 grid is small — every pixel counts. Faces are built from a few dots (eyes, brows, mouth) stamped as coordinate lists. Expressions (happy, sad, angry, cry, dizzy, look-left/right, closed, half, yawn) are reusable across all forms.

## How to add or change art

1. Edit the string grid in `renderer/sprites.js` (the `BODY`, `EGG`, `GHOST`, `ICONS`, face parts, or `FORMS` entries).
2. Faces and props are coordinate arrays or small string-art pieces stamped at `[x, y]` offsets in `build()`.
3. New adult forms go in the `FORMS` object with `head`, `face`, `extra` (props), `eyes` and `mouth` overrides.
4. New icons go in `ICONS` with a colour tint in `ICON_TINTS`.
5. The `icon()` function caches rendered icons as data URLs; `build()` + `draw()` render the pet to a canvas.
6. Art changes don't need a test, but run `npm test` afterward to make sure nothing else broke.
