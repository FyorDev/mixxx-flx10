# Pioneer DDJ-FLX10 in this Mixxx fork

This branch of Mixxx (based on 2.6) adds full support for the Pioneer
DDJ-FLX10: every control of the unit, the jog screens, and the Linux setup the
controller needs. It merges the work of several people, see
[CREDITS.md](CREDITS.md).

## What is included

| Part | Files | Status |
| --- | --- | --- |
| MIDI mapping | `res/controllers/Pioneer-DDJ-FLX10.midi.xml`, `Pioneer-DDJ-FLX10-scripts.js` | Mixer, decks, jog, tempo, sync, loops, STEMS, channel 16 jog display |
| FX section | `res/controllers/Pioneer-DDJ-FLX10-fx.js` | All 14 Beat FX and 6 Sound Color FX (see below) |
| Pads | `res/controllers/Pioneer-DDJ-FLX10-pads.js` | All 8 pad modes, both pages, sampler banks, colours; memory cues (CUE/LOOP CALL) |
| Jog screens (HID) | `res/controllers/PioneerDDJFLX10-screen.hid.xml`, `PioneerDDJFLX10-screen.js`, `Pioneer-DDJ-FLX10-screen-sysex.js` | Serato protocol: waveform, artwork, time, BPM. rekordbox protocol: experimental |
| Script API | `src/controllers/scripting/legacy/controllerscriptinterfacelegacy.*` | `engine.getWaveformSummary()`, `engine.getBeatInfo()`, `engine.getCoverArt()`, `engine.loadEffect()`, `engine.setEffectParameter()`, faster timers for the FLX10 |
| Effects | `src/effects/backends/builtin/` | Beat Delay, Shepard Tone, Barberpole Flanger, Stretch, Filtered Noise; effects on the master bus follow the playing deck's tempo |
| Linux setup | `res/controllers/flx10-autounlock/` | settings/unlock (`flx10_setup.py`), DJ logo upload, udev + systemd |
| Nix | `flake.nix` | `packages.mixxx-flx10`, `packages.flx10-setup`, `nixosModules.flx10` |

Coverage: 1434 of the 1571 MIDI-IN messages in Pioneer's DDJ-FLX10 MIDI
message list are mapped; most of the rest are handled by the unit itself
(SHIFT + PAGE jog display switching, input selectors, mic section, master
cue, booth level).

## Install

### NixOS

```nix
# flake.nix of your system
inputs.mixxx-flx10.url = "github:FyorDev/mixxx-flx10?ref=flx10/integration";

# configuration.nix
imports = [ inputs.mixxx-flx10.nixosModules.flx10 ];
hardware.ddj-flx10 = {
  enable = true;
  settings = { jog-ring-color = "1"; time-mode = "remaining"; };
};
```

This installs Mixxx from this tree, the udev rules, and a service that
writes the controller settings each time the FLX10 is plugged in.

### Other Linux

Build Mixxx as usual, then once per plug-in (or with the udev rule and
service in `res/controllers/flx10-autounlock/`):

```sh
sudo res/controllers/flx10-autounlock/flx10_setup.py settings
```

Without this the FLX10's audio interface reports no sample rates and the
jog screens ignore the computer. If the controller stops responding after
many unlock cycles, power it off completely (USB and mains) for 10 s.

### Windows / macOS

Install Pioneer's driver; it does the unlock. The mappings work the same.

## Mixxx settings

1. Preferences > Sound Hardware: the FLX10 as output (Main: channels 1-2,
   Headphones: 3-4).
2. Preferences > Controllers > `DDJ-FLX10`: load "Pioneer DDJ-FLX10".
   Option "Jog screen mode": `MIDI` (text only, default) or `Serato HID`
   (waveforms).
3. For waveforms also enable the `DDJ-FLX10 Screen` HID controller with the
   same protocol in its "Jog screen protocol" option.
4. Other options of the MIDI mapping: "ACTIVE PART buttons" (mute or solo),
   "Level knobs work in the unit" (on by default: MASTER LEVEL, HEADPHONES
   LEVEL and HEADPHONES MIX stay analogue and Mixxx's headphone mix is set
   to cue only), "MIX POINT LINK button" (Mix Point Link or Key Lock).

## Beat FX and Sound Color FX

The FX section builds each effect from Mixxx effects, loaded by id with
`engine.loadEffect()` into effect unit 1 (Beat FX) and the decks' Quick
Effect chains (Sound Color FX), so it does not depend on the preset lists.
They are recreations of what the Operating Instructions describe, not
Pioneer's algorithms.

| Beat FX | Built from | BEAT < / > |
| --- | --- | --- |
| LOW CUT ECHO, ECHO | Beat Delay (low cut on the repeats for LOW CUT ECHO) | 1/16 - 16 beats |
| MT DELAY | Beat Delay with 7 taps | 1/16 - 16 beats |
| SPIRAL | Beat Delay with pitch glide into Reverb | 1/16 - 16 beats |
| REVERB | Reverb | size 1 - 100 % |
| TRANS | Tremolo, square wave; LEVEL also lengthens the cut | 1/16 - 16 beats (Mixxx limits it to 1/8 - 4) |
| ENIGMA JET | Barberpole Flanger | -64 .. +64 beats, sign = falling / rising |
| FLANGER | Flanger | 1/16 - 64 beats (1/4 - 32 in Mixxx) |
| PHASER | Phaser | 1/16 - 64 beats (up to 4 in Mixxx) |
| STRETCH | Stretch; LEVEL is the stretch factor 1 - 4 | retrigger 1/16 - 16 beats |
| SLIP ROLL, ROLL | loop roll / beat loop on the selected deck (MST: every playing deck) | 1/16 - 16 beats |
| MOBIUS SAW, TRI | Shepard Tone | -64 .. +64 beats |

LEVEL/DEPTH is the dry/wet of the effect unit. CH SELECT routes it to a
deck, the master, all microphones (MIC) or all samplers (SP). The ON
button flashes while the effect runs. SHIFT + ON is Release FX: delays
stop taking input and ring out for four beats, other effects stop at
once. SHIFT + BEAT < / > select AUTO (the effects follow the tempo of
what they process) and TAP (tap the tempo on BEAT >).

| Sound Color FX | Left of centre | Right of centre |
| --- | --- | --- |
| SPACE | reverb on lows and mids | reverb on mids and highs |
| D.ECHO | dub echo on the mids | dub echo on the highs (echoes keep going at the centre) |
| CRUSH | bit crusher | bit crusher and rising high-pass |
| PITCH | pitch down | pitch up |
| NOISE | white noise, closing low-pass | white noise, rising high-pass |
| FILTER | low-pass | high-pass |

At the centre the effect is off. With no Sound Color FX button lit the
COLOR knobs do nothing, as in rekordbox, and Mixxx's own Quick Effect is
left alone. On a stock Mixxx without `engine.loadEffect()` the Sound Color
FX fall back to the stock quick effect presets and the Beat FX section
only switches, routes and mixes whatever chain is loaded in effect unit 1.

## Controls that differ from rekordbox

- STEMS: needs stem files (`.stem.mp4`); Mixxx does not separate tracks in
  real time. Without stems the ACTIVE PART buttons are LOW/MID/HIGH EQ
  kills. FX PART SELECT is still a master EQ kill (Mixxx cannot route an
  effect unit to one stem).
- PAD FX uses effect units 3 and 4 and loop rolls; Pioneer's own effect
  algorithms are not available.
- Memory cues are stored as hot cues 17-36.
- VIEW held adds the track to Auto DJ (rekordbox: Tag List).
- Fader Start messages are only sent when Fader Start is enabled in the
  unit's settings (`flx10_setup.py settings --fader-start on`).
- FX PART SELECT applies the Sound Color FX knob to the selected stem parts
  (through each stem's Quick Effect). Beat FX always acts on the whole deck.
- MIX POINT LINK works as in rekordbox (setting "MIX POINT LINK button");
  choose "Key Lock (Serato)" there if you want the button as key lock, the
  FLX10 has no other key lock button. The jog screens do not show the mix
  point yet.
- Not mapped yet: mic EQ and sampler volume/cue messages (analogue on the
  unit), DMX.

## Testing without hardware

The mapping passes Mixxx's `MappingTestFixture` validation and load tests.
[checklist-tests-marco-zis.md](checklist-tests-marco-zis.md) is the manual
hardware checklist by Marc Zischka; note numbers in it refer to his earlier
version.

## Protocol reference

[PROTOCOL.md](PROTOCOL.md) collects what is known about the FLX10's USB
interfaces, MIDI, SysEx, settings and jog screen packets.
