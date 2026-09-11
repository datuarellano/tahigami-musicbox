# What's new in 2.1.0 — draft

Pulled from every commit between the `v2.0.0` tag and this branch's tip in the
D1-40 repo. Written for an owner, not a developer — anything purely internal
(soundlab dev-tool changes, refactors with no audible effect, build tooling)
is left out. Commit hashes are in the D1-40 repo, in `()` at the end of each
line, so you can double-check or dig deeper before editing.

Edit freely — reorder, cut, rewrite, whatever reads best. Once you're happy,
the final wording goes into `public/firmware/manifest.json`'s `2.1.0` release
`notes` (and/or the "What's new" popover in the updater).

## Already in the current 2.1.0 notes (for reference, not re-deriving these)

- This updater and configurator app, right here in your browser.
- An adjustable timer (1–240 minutes) for how long it plays before starting a
  new piece — was fixed at 40.
- The Music Box can now tell this app which firmware it's running.

## Timing & rhythm

- Every voice — chords, bass, harmony lines, drums, and Blossom's own
  patterns — now locks to one shared musical clock (real bars and beats)
  instead of each running its own loose timer. Things that were supposed to
  change together now actually land together.
- The time signature can vary now instead of always being 4/4, and pattern
  choice adapts to whatever meter is playing.
- Blossom's phrase structure (A/A/B/FILL) and its algorithm/mode/melody
  "rerolls" now happen on a real musical bar boundary instead of an
  arbitrary moment.

## New voice: ambient pad

- Added a whole new instrument: a soft, sustained pad that follows the chord
  progression underneath everything else, with wide stereo warmth and subtle
  pitch glide on some scales.

## Blossom lead voice

- New Blossom patch: "Crazy Diamond," an analog-style lead with a proper
  filter sweep, pitch glide, vibrato, and legato. Inspired by Pink Floyd.
- Added a limiter that watches the Blossom voice so louder passages don't
  clip or distort.
- Leaf Blossom gained a proper bird-chirp voice — 12 different call shapes
  with natural-sounding variation.

## Regeneration button

- Pressing the button now gives a soft beep, and releasing it plays a small
  bell-like gong.
- The button also hints at the next piece's key before it starts.

## Bass

- Added a sub-oscillator so thin-sounding bass patches have real low end.
- Softened overly bright bass tones on the pattern grid and fixed a couple
  of specific patterns that weren't playing correctly in triple meter.

## Percussion (Mountain Blossom)

- Drums now stay locked to the same shared musical clock as every other
  voice.
- Percussion patterns are sparser and softer — less busy.

## Texture

- Added chorus/flanger movement to the harmony, strings, and Blossom voices
  for more depth and shimmer.

## Reliability

- Fixed an audio glitch that could happen while connected over USB.
- Fixed a bug where manually starting a new piece could silently do nothing
  after certain settings had been touched.
