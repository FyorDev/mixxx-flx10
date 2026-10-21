# Pioneer DDJ-FLX10 in this Mixxx fork

This branch of Mixxx (based on 2.6) adds full support for the Pioneer
DDJ-FLX10: every control of the unit, the jog screens, and the Linux setup the
controller needs. It merges the work of several people, see
[CREDITS.md](CREDITS.md).

## What is included

| Part | Files | Status |
| --- | --- | --- |
| MIDI mapping | `res/controllers/Pioneer-DDJ-FLX10.midi.xml`, `Pioneer-DDJ-FLX10-scripts.js` | Mixer, decks, jog, tempo, sync, loops, Beat FX, Sound Color FX, STEMS, channel 16 jog display |
| Pads | `res/controllers/Pioneer-DDJ-FLX10-pads.js` | All 8 pad modes, both pages, sampler banks, colours; memory cues (CUE/LOOP CALL) |
| Jog screens (HID) | `res/controllers/PioneerDDJFLX10-screen.hid.xml`, `PioneerDDJFLX10-screen.js`, `Pioneer-DDJ-FLX10-screen-sysex.js` | Serato protocol: waveform, artwork, time, BPM. rekordbox protocol: experimental |
| Script API | `src/controllers/scripting/legacy/controllerscriptinterfacelegacy.*` | `engine.getWaveformSummary()`, `engine.getBeatInfo()`, `engine.getCoverArt()`, faster timers for the FLX10 |
| Linux setup | `res/controllers/flx10-autounlock/` | settings/unlock (`flx10_setup.py`), DJ logo upload, udev + systemd |
| Nix | `flake.nix` | `packages.mixxx-flx10`, `packages.flx10-setup`, `nixosModules.flx10` |

Coverage: 1479 of the 1571 MIDI-IN messages in Pioneer's DDJ-FLX10 MIDI
message list are mapped.

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

## Controls that differ from rekordbox

- STEMS: needs stem files (`.stem.mp4`); Mixxx does not separate tracks in
  real time. Without stems the ACTIVE PART buttons are LOW/MID/HIGH EQ
  kills. FX PART SELECT is still a master EQ kill (Mixxx cannot route an
  effect unit to one stem).
- PAD FX uses effect units 3 and 4 and loop rolls; Pioneer's own effect
  algorithms are not available.
- Memory cues are stored as hot cues 17-36.
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
