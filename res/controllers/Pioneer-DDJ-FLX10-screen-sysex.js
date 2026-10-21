// SysEx handshake that puts the DDJ-FLX10 jog screens into HID mode.
// Loaded after Pioneer-DDJ-FLX10-scripts.js. Used together with the
// "DDJ-FLX10 Screen" HID mapping (PioneerDDJFLX10-screen.hid.xml).
// Extracted from Pioneer-DDJ-FLX10-scripts.js in mixxxdj/mixxx#16533.


// ===== HID screen SysEx handshake ===========================================
// These two SysEx messages on MIDI OUT are the gate that unlocks the FLX10's
// HID screen rendering. Without them, our screen.js writes to interface 5
// are silently rejected by the firmware. Decoded from the Serato capture
// (2026-05-23). See FLX10-SCREEN-PROTOCOL-FINDINGS.md for the full story.
PioneerDDJFLX10._SYSEX_ENTER_HID = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x03, 0x01, 0xF7
];
PioneerDDJFLX10._SYSEX_KEEPALIVE = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x50, 0x31, 0xF7
];
// Per-deck init SysEx — Serato sends these after handshake, at track-load
// time. Hypothesis: one of them puts the firmware into "Serato mode" where
// time is computed internally (from BPM + position) instead of being driven
// by the HID xx 27 [9..12] bytes, decoupling wave-scroll from time-display.
// Decoded 2026-05-24 from flx10-driverrutil-then-serato.pcapng.
//
// Pattern: F0 00 40 05 00 00 04 01 <deck-id> 00 00 <state-bytes> F7
//   deck-id: 0x11 deck1, 0x12 deck2, 0x13 deck3, 0x14 deck4
//   state-bytes: 02 0e 0e 05 initially; later replaced with track-specific bytes
PioneerDDJFLX10._SYSEX_DECK_INIT = {
    1: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x11, 0x00, 0x00, 0x02, 0x0e, 0x0e, 0x05, 0xF7],
    2: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x12, 0x00, 0x00, 0x02, 0x0e, 0x0e, 0x05, 0xF7],
    3: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x13, 0x00, 0x00, 0x02, 0x0e, 0x0e, 0x05, 0xF7],
    4: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x14, 0x00, 0x00, 0x02, 0x0e, 0x0e, 0x05, 0xF7],
};
// Two more globals Serato sends at the same time. Not yet sure what they
// do — try them together with the per-deck init.
PioneerDDJFLX10._SYSEX_GLOBAL_B = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x0b, 0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7
];
PioneerDDJFLX10._SYSEX_GLOBAL_C = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x0c, 0x00, 0x00, 0x02, 0x0e, 0x0e, 0x05, 0x00, 0x01, 0xF7
];
// Outer session-start SysEx — uses AlphaTheta's '00 20 7F' vendor ID
// (different from the '00 40 05' ID our other SysEx use). Serato sends
// this ONCE at app launch, before any other SysEx. Captured in
// flx10-driverrutil-then-serato.pcapng at t=25.242 (BEFORE the ENTER_HID
// handshake at t=26.482). Likely the firmware-mode-enable signal that
// makes the firmware honor xx 27 [9..12] time bytes even when [5..7]
// position bytes are non-zero. Experimental — added 2026-05-24.
PioneerDDJFLX10._SYSEX_SESSION_START = [
    0xF0, 0x00, 0x20, 0x7F, 0x01, 0x02, 0x01, 0x01,
    0x22, 0x0F, 0x0C, 0x06, 0x08, 0x04, 0x0A, 0x02,
    0x02, 0x05, 0x00, 0x00, 0x0E, 0x0A, 0x0E, 0x03,
    0x04, 0xF7
];
// ===== Rekordbox-mode SysEx (captured 2026-05-24 from flx10-rekordbox-opening.pcapng).
// Phase 1A pivot: rekordbox uses a DIFFERENT firmware mode (xx 21 deck state
// instead of Serato xx 27) which gives ACCURATE TIME + scrolling waveform
// (confirmed by user). Pivoting our screen.js to use this mode.
// Set PioneerDDJFLX10._SCREEN_MODE = 'rekordbox' to send these instead of
// the Serato sequence at init.
// 'serato' | 'rekordbox' | 'vdj'. Default 'serato' = working baseline.
// 2026-05-24: tried pivots to rekordbox AND vdj protocols. Both failed
// with the SAME wall — firmware exposes only 2 of 5 display modes despite
// us sending every visible byte from packet captures (vendor unlock,
// SysEx init, xx 21 deck state, waveform placeholders). The Pioneer
// Driver Setting Utility runs continuously on Windows during real use,
// and there's likely a kernel-level / firmware-level handshake we
// can't see in USBPcap captures. All 3 protocol implementations are
// kept in code (gated by this flag) for future use if the wall ever
// gets cracked.
PioneerDDJFLX10._SCREEN_MODE = 'serato';
// 1) Variant keepalive (50 00 instead of Serato's 50 31).
PioneerDDJFLX10._SYSEX_RKBOX_KEEPALIVE = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x50, 0x00, 0xF7
];
// 2..5) Per-deck init (six 0x0F bytes, vs Serato's 02 0E 0E 05).
PioneerDDJFLX10._SYSEX_RKBOX_DECK_INIT = {
    1: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x11, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0xF7],
    2: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x12, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0xF7],
    3: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x13, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0xF7],
    4: [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
        0x00, 0x14, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0xF7],
};
// 6) Same Global B as Serato.
PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_B = PioneerDDJFLX10._SYSEX_GLOBAL_B;
// 7) Variant Global C (ends 00 00 00 instead of Serato's 05 00 01).
PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_C = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x00, 0x0C, 0x00, 0x00, 0x02, 0x0E, 0x0E, 0x00, 0x00, 0x00, 0xF7
];
// 8) The long rekordbox-mode config — verbatim from capture. Bytes after
// the standard 00 00 0A prefix appear to encode display/mode settings.
// Same bytes sent twice at session start in the capture.
PioneerDDJFLX10._SYSEX_RKBOX_MODE_CONFIG = [
    0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
    0x00, 0x00, 0x0A, 0x00, 0x28, 0x00, 0x26, 0x00,
    0x18, 0x3D, 0x3A, 0x05, 0x64, 0x50, 0x2A, 0x54,
    0x40, 0x14, 0x1A, 0x04, 0x69, 0x13,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7
];
// 9) ENTER_HID — same as Serato.

// ===== VirtualDJ-mode SysEx (captured 2026-05-24 from flx10-vdj-init.pcapng).
// VDJ uses xx 21 deck state (same as rekordbox) but with DIFFERENT play
// value (04 = playing instead of rekordbox's 00) and a DIFFERENT long
// mode-config SysEx. VDJ also sends fewer SysEx (7) than rekordbox (9),
// no per-deck 00 11/12/13/14 commands, and all in 0.3s (no 20s pause).
PioneerDDJFLX10._SYSEX_VDJ_INIT = [
    // 1. ENTER_HID
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01, 0x00, 0x03, 0x01, 0xF7],
    // 2. Keepalive variant
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01, 0x00, 0x50, 0x00, 0xF7],
    // 3. Global C v1
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
     0x00, 0x00, 0x0C, 0x00, 0x00, 0x02, 0x0E, 0x0E, 0x00, 0x00, 0x00, 0xF7],
    // 4. Global B empty
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
     0x00, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7],
    // 5. Global B with data
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
     0x00, 0x00, 0x0B, 0x31, 0x5E, 0x50, 0x01, 0x00, 0x00, 0xF7],
    // 6. LONG mode-config (VDJ-specific bytes; differs from rekordbox).
    //    This is hypothesized to be the firmware "enter VDJ mode" command.
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
     0x00, 0x00, 0x0A, 0x00, 0x28, 0x00, 0x26, 0x00,
     0x1A, 0x51, 0x02, 0x42, 0x28, 0x11, 0x26, 0x41,
     0x32, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
     0x00, 0x00, 0x00, 0xF7],
    // 7. Global C v2 (different ending bytes)
    [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
     0x00, 0x00, 0x0C, 0x00, 0x00, 0x02, 0x09, 0x04, 0x00, 0x00, 0x00, 0xF7],
];
// Same keepalive used for the 200ms timer.
PioneerDDJFLX10._SYSEX_VDJ_KEEPALIVE = PioneerDDJFLX10._SYSEX_VDJ_INIT[1];

// Per-deck beat-grid burst: verbatim copy of the 7 02 0F XX YY messages
// Serato sent for deck 1 at track-load in flx10-serato-smoothplaying.pcapng
// (t=11.762..11.877, 7 messages in 115ms). XX correlates with BPM (climbs
// as BPM climbs); YY appears to be a fine adjustment or jitter. We don't
// yet understand the precise encoding, but sending Serato's actual bytes
// is the minimum-effort test of whether these messages affect firmware
// time-computation behavior. Same payload for all 4 decks (we just swap
// the deck-id byte at offset [9]: 0x11/0x12/0x13/0x14).
PioneerDDJFLX10._SYSEX_BEATGRID_BURST_PAYLOAD = [
    // [XX, YY] pairs captured from Serato deck-1 track-load
    [0x0a, 0x09],
    [0x0b, 0x0a],
    [0x0c, 0x06],
    [0x0c, 0x0c],
    [0x0d, 0x00],
    [0x0d, 0x05],
    [0x0d, 0x0b],
];
PioneerDDJFLX10._buildBeatgridSysex = function(deck, xx, yy) {
    var deckId = 0x10 + deck;   // 0x11 deck1, 0x12 deck2, 0x13 deck3, 0x14 deck4
    return [0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x01,
            0x00, deckId, 0x00, 0x00, 0x02, 0x0F, xx, yy, 0xF7];
};
PioneerDDJFLX10._sendBeatgridBurst = function(deck) {
    var pairs = PioneerDDJFLX10._SYSEX_BEATGRID_BURST_PAYLOAD;
    for (var i = 0; i < pairs.length; i++) {
        var msg = PioneerDDJFLX10._buildBeatgridSysex(deck, pairs[i][0], pairs[i][1]);
        midi.sendSysexMsg(msg, msg.length);
    }
};

PioneerDDJFLX10.startScreenHandshake = function(mode) {
    PioneerDDJFLX10._SCREEN_MODE = mode;
    try {
        if (PioneerDDJFLX10._SCREEN_MODE === 'vdj') {
            // VDJ MODE INIT — order from flx10-vdj-init capture (t=6.367-6.629).
            // All 7 SysEx commands in ~0.3 seconds, no per-deck SysEx.
            console.log("FLX10: initializing in VDJ mode (xx 21 + RGB-waveform)");
            for (var vi = 0; vi < PioneerDDJFLX10._SYSEX_VDJ_INIT.length; vi++) {
                var msg = PioneerDDJFLX10._SYSEX_VDJ_INIT[vi];
                midi.sendSysexMsg(msg, msg.length);
            }
            // 200ms keepalive timer (same VDJ keepalive 50 00)
            PioneerDDJFLX10._sysexKeepaliveTimer = engine.beginTimer(200, function() {
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_VDJ_KEEPALIVE,
                                  PioneerDDJFLX10._SYSEX_VDJ_KEEPALIVE.length);
            });
            console.log("FLX10: VDJ-mode init complete (" +
                        PioneerDDJFLX10._SYSEX_VDJ_INIT.length + " SysEx sent)");
        } else if (PioneerDDJFLX10._SCREEN_MODE === 'rekordbox') {
            // REKORDBOX MODE INIT — order verified from flx10-rekordbox-opening.
            // Rekordbox sends in two phases:
            //   EARLY (t≈28s in capture): keepalive variant + 4 per-deck init
            //   LATE  (t≈52s in capture, ~20s after init packets): Global B,
            //         Global C, long mode-config, ENTER_HID
            // We split here too. Daemon's HID init packets (xx 30/39/2d/3e/2c/2e/2f)
            // fire when daemon starts; the LATE SysEx is deferred so the firmware
            // sees init-packets BEFORE the final mode-enable handshake.
            console.log("FLX10: initializing in REKORDBOX mode (xx 21 + xx 3D)");
            midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_KEEPALIVE,
                              PioneerDDJFLX10._SYSEX_RKBOX_KEEPALIVE.length);
            for (var rd = 1; rd <= 4; rd++) {
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_DECK_INIT[rd],
                                  PioneerDDJFLX10._SYSEX_RKBOX_DECK_INIT[rd].length);
            }
            console.log("FLX10: rekordbox EARLY SysEx sent; LATE SysEx deferred 5s");
            // Use the rekordbox-variant keepalive (50 00) every 200ms.
            PioneerDDJFLX10._sysexKeepaliveTimer = engine.beginTimer(200, function() {
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_KEEPALIVE,
                                  PioneerDDJFLX10._SYSEX_RKBOX_KEEPALIVE.length);
            });
            // Defer LATE SysEx by 5s so daemon's init packets land first.
            engine.beginTimer(5000, function() {
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_B,
                                  PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_B.length);
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_C,
                                  PioneerDDJFLX10._SYSEX_RKBOX_GLOBAL_C.length);
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_RKBOX_MODE_CONFIG,
                                  PioneerDDJFLX10._SYSEX_RKBOX_MODE_CONFIG.length);
                midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_ENTER_HID,
                                  PioneerDDJFLX10._SYSEX_ENTER_HID.length);
                console.log("FLX10: rekordbox LATE SysEx sent (mode-enable handshake)");
            }, true);   // one-shot
        } else {
        // SESSION_START fires FIRST (before ENTER_HID), mirroring Serato's
        // captured order at t=25.242 (session-start) vs t=26.482 (ENTER_HID).
        midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_SESSION_START,
                          PioneerDDJFLX10._SYSEX_SESSION_START.length);
        midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_ENTER_HID,
                          PioneerDDJFLX10._SYSEX_ENTER_HID.length);
        // 2026-05-25 TEST: keepalive rate 200ms → 340ms (matching Serato's
        // measured ~3 Hz / 340ms interval from smoothplaying capture).
        // Hypothesis: too-fast keepalive might confuse firmware into a slow
        // refresh mode. Serato sends f0 00 40 04 05 00 00 04 04 01 00 07 50 31 f7
        // at exactly this rate during steady play.
        PioneerDDJFLX10._sysexKeepaliveTimer = engine.beginTimer(340, function() {
            midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_KEEPALIVE,
                              PioneerDDJFLX10._SYSEX_KEEPALIVE.length);
        });
        console.log("FLX10: HID screen SysEx handshake started");
    
        // EXPERIMENT 2026-05-24: send per-deck init SysEx that Serato sends.
        // Hypothesis: this puts firmware into "Serato mode" where time is
        // computed internally → would let us scroll the wave AND have
        // accurate time. (Without these, the firmware uses HID xx 27 [5..7]
        // position bytes for both wave scroll AND time computation, which
        // means we have to pick one.)
        for (var sd = 1; sd <= 4; sd++) {
            midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_DECK_INIT[sd],
                              PioneerDDJFLX10._SYSEX_DECK_INIT[sd].length);
        }
        midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_GLOBAL_B,
                          PioneerDDJFLX10._SYSEX_GLOBAL_B.length);
        midi.sendSysexMsg(PioneerDDJFLX10._SYSEX_GLOBAL_C,
                          PioneerDDJFLX10._SYSEX_GLOBAL_C.length);
        console.log("FLX10: Serato-mode per-deck SysEx sent (experimental)");
    
        // Send the beat-grid burst (7 02 0F messages from Serato capture)
        // for each loaded deck. Experiment 2026-05-24: tests whether these
        // are the trigger that makes firmware honor [9..12] time bytes when
        // [5..7] position is also non-zero.
        for (var bd = 1; bd <= 4; bd++) {
            PioneerDDJFLX10._sendBeatgridBurst(bd);
        }
        console.log("FLX10: beat-grid burst sent for all decks (experimental)");
        }   // end else (Serato mode)
    } catch (e) {
        console.log("FLX10: SysEx handshake failed (screen waveform won't render): " + e);
    }
};

PioneerDDJFLX10.stopScreenHandshake = function() {
    if (PioneerDDJFLX10._sysexKeepaliveTimer !== null) {
        engine.stopTimer(PioneerDDJFLX10._sysexKeepaliveTimer);
        PioneerDDJFLX10._sysexKeepaliveTimer = null;
    }
};
