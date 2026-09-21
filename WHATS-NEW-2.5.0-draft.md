# What's new in 2.5.0

- This updater and configurator app, right here in your browser. The timer
  for starting a new piece is now yours to set — it was fixed at 40.
- The Music Box can now tell this app which firmware it's running.

## Owner customizations

- An adjustable timer (1–240 minutes) for how long it plays before starting a new piece.
- Set how loud the volume knob is allowed to reach.
- Adjust how bright the breathing LED glows, even brighter than the
  original default.
- Set the range of tempos the Music Box picks from on its own.
- One button to put the timer, volume cap, LED brightness, and tempo range
  all back to how it shipped.

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

- New Blossom patch: a plucky, string-like "guitar" timbre using
  Karplus-Strong synthesis, with its own dedicated reverb send for a more
  spacious pluck.
- New Blossom patch: "Crazy Diamond," an analog-style lead with a proper
  filter sweep, pitch glide, vibrato, and legato. Inspired by Pink Floyd.
- Added a limiter that watches the Blossom voice so louder passages don't
  clip or distort.
- Leaf Blossom gained a proper bird-chirp voice — 12 different call shapes
  with natural-sounding variation. Toned down one call that came out too
  loud and a little startling.
- Blossom's melody-movement patterns now include four new "walk" styles it
  can wander through, on top of the existing ones, for more variety from
  one piece to the next.

## Reverb

- Replaced the old mono reverb with a lush stereo plate reverb: wider, smoother
  tails that respond to the light sensor.
- The ambient pad and the guitar Blossom patch now bloom into the reverb too.
- Fixed a crackle in the reverb tail and tamed a few loud peaks in the wet
  signal.

## Balance & shaping

- New "Conductor" keeps the voices balanced against each other and cues them
  in and out over the course of a piece, with a smooth build and fade toward
  the end.
- Light-sensor gestures that were being overwritten every moment now actually
  come through.

## Light & CHAOS

- CHAOS mode got more dramatic: the pad holds its chord, the bass drones the
  tonic, chorus/flange and voices open wide, Radial alternates between solar
  sounds, and Mountain's percussion goes full-tilt.

## Regeneration button

- Pressing the button now gives a soft beep, and releasing it plays a small
  bell-like gong.
- The button also hints at the next piece's key before it starts.
- Each new piece now rolls the dice on more things: the chord engine and
  Conductor are on for about three in four pieces, and the reverb amount
  varies from piece to piece, so no two feel quite alike.

## Bass

- Added a sub-oscillator so thin-sounding bass patches have real low end.
- Softened overly bright bass tones on the pattern grid and fixed a couple
  of specific patterns that weren't playing correctly in triple meter.
- Added back an original drone mode: the bass can lock onto a single steady low note (the
  key's tonic) instead of following the chord changes, for a more static,
  droney feel.

## Percussion (Mountain Blossom)

- Drums now stay locked to the same shared musical clock as every other
  voice.
- Percussion patterns are sparser and softer — less busy.

## Texture

- New "Solar Wind" sound for Radial Blossom, now its default: a cosmic texture
  of radio-burst sweeps, whistlers, flares and ticks.

- Added chorus/flanger movement to the harmony, strings, and Blossom voices
  for more depth and shimmer.

## Scales

- Added two new scales: Hamsadhwani, a bright Indian pentatonic raga, and
  Ryukyu, an Okinawan scale.
- Removed the Prometheus scale for now — paired with the new chord engine
  it came out sounding more cinematic than calming, which isn't the mood
  this box is going for. May return later as an optional mode.

## MIDI

- MIDI output over USB got a repair pass — several bugs fixed, including
  notes getting stuck on after a regeneration and repeated notes at the
  same pitch not retriggering.
- The ambient pad voice now sends its own MIDI notes on their own channel,
  so it shows up separately in a DAW.
- The Music Box can sync its tempo to an incoming MIDI clock from a DAW
  (for gear, like Logic Pro, that sends clock but won't follow one), or
  send its own clock out to other gear. If the connection drops it keeps
  playing on its own rather than going silent.

## Reliability

- Fixed an audio glitch that could happen while connected over USB.
- Fixed a bug where manually starting a new piece could silently do nothing
  after certain settings had been touched.
- Fixed crackling/zipper noise during volume fades, most noticeable over
  USB.
- Fixed the button-triggered regeneration fade jumping straight to full
  volume instead of fading in smoothly.
- Fixed a bug where telling Blossom to rest didn't always actually make it
  go quiet.
- Fixed a bug where Blossom's rest state could get stuck after leaving
  pattern mode, and where overlapping CHAOS triggers could leave the settings
  stuck at the wrong values afterward.
- Fixed a volume-smoothing double-filter bug that made the Wave and Mountain
  light responses sluggish.
