# Test Checklist — DDJ-FLX10 Prod A / Prod v1.0.4

Merged document based on:
- `check-list-tests-fr.md`
- `check list tests gb.md`

## Prerequisites / setup
- [ ] Mixxx 2.3.6+ started
- [ ] DDJ-FLX10 mapping loaded (`Pioneer-DDJ-FLX10.midi.xml` / PROD v1.0)
- [ ] DDJ-FLX10 controller connected, powered, and recognized
- [ ] No other MIDI output routed to the controller (to avoid noise/pollution)
- [ ] No errors in the console / MIDI log at load time
- [ ] Neutral gain/trim, volume faders at minimum, crossfader centered

## Mixer section
- [ ] Crossfader working correctly
- [ ] Master gain adjustable
- [ ] 3-band EQ working correctly (LOW / MID / HIGH)
- [ ] Headphone PFL / Cue working on all 4 channels
- [ ] HeadMix / Split working correctly
- [ ] Vertical VU meters: LEDs correctly follow the audio level on CH1–CH4

## Deck section (x4)

### Playback
- [ ] Play / Pause works on CH1–CH4 (0x0B)
- [ ] Simple Cue works on CH1–CH4 (0x0C)
- [ ] CUE + SHIFT sets the cue point
- [ ] Track loading works
- [ ] Time display change works (0x3E)
- [ ] Play/Cue LEDs remain silent if outputs are disabled in this version (no pollution on 0x0B / 0x0C)

### Jog wheels
- [ ] Jog Touch detected (scratch) (0x36)
- [ ] Normal pitch bend works (0x21)
- [ ] Scratch mode is active and accurate (0x22)
- [ ] No latency, no jumps, no erratic behavior

### Tempo
- [ ] 14-bit tempo fader works across the full range (MSB 0x00 + LSB 0x20)
- [ ] Direction is correct and feedback is stable in Mixxx
- [ ] Tempo range selector works (0x60)
- [ ] Tempo reset works (0x41)
- [ ] Beat Sync works (0x66)
- [ ] Rate range adjustment via SHIFT + Tempo Reset works if implemented on the controller side

### Key / Sync / advanced transport
- [ ] Key reset works (0x64)
- [ ] Native Key Sync works (0x65)
- [ ] Keylock toggle works
- [ ] The Key Sync button has no effect when SHIFT is held, if this JS protection is enabled
- [ ] Reverse toggle works (0x15)
- [ ] Reverse / Slip Reverse works according to the design (momentary hold or brief toggle)
- [ ] Slip toggle works (0x40)
- [ ] Quantize toggle works

### Hotcues
- [ ] Hotcue 1–8: trigger works
- [ ] Hotcue 1–8: clear works with SHIFT
- [ ] Hotcue LEDs are responsive and stable

### Loop
- [ ] Loop In / Out works (0x10 / 0x11)
- [ ] Reloop / Exit works
- [ ] Loop Halve works
- [ ] Loop Double works
- [ ] Loop commands remain responsive with or without SHIFT depending on the mapping

### Beatjump
- [ ] Beatjump backward works (0x19)
- [ ] Beatjump forward works (0x1A)
- [ ] Jump size is configurable
- [ ] No duplicate triggers or unintended actions

### Modes / pads / sampler
- [ ] No pad mode conflicts
- [ ] Sampler 1–8: Play / Stop works
- [ ] Sampler load works
- [ ] Sampler PFL works
- [ ] Sampler sync works
- [ ] Sampler / FX pads operate without conflicts in this version

## Effects section
- [ ] FX1–3 Enable / Disable works (0x50–0x52)
- [ ] FX assignment per deck works
- [ ] Wet / Dry mix works correctly
- [ ] BeatFX selector works

## Browse section
- [ ] Browser knob navigation works (0x40)
- [ ] Loading the selected track works
- [ ] Focus navigation works (0x65 / 0x7A)

## SHIFT section
- [ ] Master Shift works (0x4B)
- [ ] Per-deck Shift works (0x3F)
- [ ] SHIFT modifier is reliable (no stuck state)
- [ ] SHIFT + sensitive button combos work correctly
  - [ ] CUE + SHIFT
  - [ ] Loop Halve / Double
  - [ ] Tempo Reset / Range
  - [ ] Quantize and other defined shortcuts

## LEDs, feedback, and MIDI noise
- [ ] LED feedback for Keylock / Quantize / Reverse / Sync Key is present and stable
- [ ] No stray blinking
- [ ] No MIDI spam on 0x5B, 0x10 / 0x11, 0x0B / 0x0C
- [ ] MIDI messages are consistent overall

## Technical validation
- [ ] 0 MIDI collisions detected at load time
- [ ] 14-bit tempo handled natively in XML (no JS handler), if expected
- [ ] Key Sync handled natively in XML (no JS handler), if expected
- [ ] Clean XML / JS linting
- [ ] No errors when the script starts

## Performance and stability
- [ ] Acceptable latency (< 10 ms)
- [ ] Jog wheel responsiveness is satisfactory
- [ ] No audible dropouts during jog / tempo / loop actions
- [ ] Stable over long sessions
- [ ] Reasonable CPU usage

## If a test fails
- [ ] Note the affected deck
- [ ] Note the affected button / LED
- [ ] Note the observed MIDI code (status / midino)
- [ ] Specify the context (SHIFT yes / no)
- [ ] State whether the issue is functional (control) or visual (LED / MIDI noise)

## Test report
Date: ____________

Time: ____________

Tester: __________

Mixxx version: __________

**Overall status**: [ ] PASS  [ ] FAIL

**Issues identified**:
1. _________________________
2. _________________________
3. _________________________

**Recommendations**:
__________________________________________________

**Signature**: ____________
