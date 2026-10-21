# DDJ-FLX10 protocol notes

Collected from the sources in [CREDITS.md](CREDITS.md) and our own checks.
"Unverified" means decoded from captures but not yet confirmed on hardware
from Mixxx.

## USB layout (2B73:0041)

| Interface | Use |
| --- | --- |
| 0-2 | USB audio: 4 channels out, 10 channels in, 24-bit, 44.1 kHz |
| 3 | vendor, unused |
| 4 | USB-MIDI (EP2 in, EP3 out) |
| 5 | vendor HID, usage page 0xFFA0: EP5 out 128-byte reports, EP4 in 64-byte reports |

Writes to `/dev/hidrawN` need a leading 0x00 report id byte; Mixxx's HID
output adds it.

## Settings ("unlock")

Vendor control requests `bmRequestType 0x40, bRequest 3, wValue = value << 8,
wIndex = selector, wLength 0`:

| Selector | Setting | rekordbox sends |
| --- | --- | --- |
| C028 | slip mode flashing | 1 |
| C029 | slip button LED | 0 |
| C013 | fader start sync | 2 (off) |
| C02B | jog ring colour | 0 |
| C026 | time mode | 1 (remaining) |
| C01D | REC OUT | 0 |
| C027 | virtual deck mode | 1 |

On Linux the audio interface and the jog screens only work after these.
The state does not survive a rebind of snd-usb-audio. Repeated claim/unlock
cycles can wedge the unit until it is power-cycled.

## MIDI

Channels 1-4: decks. 5: Beat FX. 7: mixer, browser, master section.
8-15: pads (two per deck, the second with SHIFT). 16: jog display output.

Pads: note = mode * 16 + (page - 1) * 8 + pad. Modes 0-7: HOT CUE, PAD FX 1,
BEAT JUMP, SAMPLER, KEYBOARD, PAD FX 2, BEAT LOOP, KEY SHIFT. Mode buttons
0x1B, 0x1E, 0x20, 0x22 (SHIFT: 0x69, 0x6B, 0x6D, 0x6F). PAGE < 0x24-0x2B,
PAGE > 0x2C-0x33, one note per mode. Pad LED value = colour number 1-127 on a
hue wheel. Same as the DDJ-1000.

Channel 16 jog display (CC 0xBF, note 0x9F), deck N = index N-1:

| Item | Message |
| --- | --- |
| position marker | CC 0x10-0x13 / 0x30-0x33, 0-359 degrees, 14-bit |
| cue point | CC 0x1C-0x1F / 0x3C-0x3F, 0-359, 7F/7F hides |
| BPM | CC 0x14-0x17 / 0x34-0x37, BPM x 10 |
| playing speed | CC 0x18-0x1B / 0x38-0x3B |
| time minutes / seconds | CC 0x42/0x43 (deck 1), 0x44/0x45, 0x46/0x47, 0x48/0x49 |
| time mode | note 0x14-0x17, 0x00 elapsed, 0x7F remaining |
| MASTER, SYNC, master tempo | note 0x18-0x1B, 0x1C-0x1F, 0x20-0x23 |
| jog ring | CC 0x09-0x0C, 0 off, 1 white |
| show/hide info | note 0x5D-0x60 |
| key / key change | deck channel CC 0x49 (0x00-0x18), CC 0x4A (0x0D = 0) |

SHIFT + TEMPO sends CC 0x05/0x25 instead of 0x00/0x20.

## SysEx

Prefix `F0 00 40 05 00 00 04 01`. rekordbox keepalive `00 50 00` every
~200 ms; Serato uses `00 50 31`. rekordbox connect sequence (26 messages,
in `Pioneer-DDJ-FLX10-screen-sysex.js`): keepalive, `00 00 0B 31 ...`,
`00 00 0C 00 00 02 0E 0E 00 00 00`, a long `00 00 0A ...` block,
`00 03 01`, per deck `00 11..14 0F 0F 0F 0F 0F 0F`.

## Jog screen HID packets

128 bytes, byte 0 = deck (0x10/0x20/0x30/0x40, 0x00 broadcast), byte 1 =
type.

| Type | Protocol | Meaning |
| --- | --- | --- |
| 0x27 | Serato | deck state at 40-200 Hz: time min/sec/ms (ms capped at 999), position counters, key, loop flags |
| 0x30 | both | track length |
| 0x33 | Serato | 240x240 JPEG artwork |
| 0x35 | Serato | waveform entry count |
| 0x36 | Serato | PWV5 waveform, LE16 `(R<<13) + (G<<10) + (B<<7) + (H<<2)`, 150 entries/s |
| 0x39 | both | pad mode label text |
| 0x2F | both | beat grid / cues |
| 0x21 | rekordbox | deck state ~50 Hz (partly decoded) |
| 0x3D | rekordbox | broadcast heartbeat, byte 2 cycles 1-5 |
| 0x37 | rekordbox | overview: `[deck][37][seq LE16][total LE16]`, sub-header `80 01 01 00`, 3-byte columns `[HIGH, LOW, MID]` (unverified) |
| 0x38 | rekordbox | full waveform, same framing, 150 columns/s, max ~24500 columns (unverified) |
| 0xD0/D1/D7 | logo | DJ logo upload/delete; replies D8 ready, DC/DD transfer ack/nak, DE/DF delete ack/nak |
