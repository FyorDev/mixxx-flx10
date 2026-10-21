// Performance pads for the Pioneer DDJ-FLX10: all eight pad modes with both
// pages, pad colours and the PAGE buttons.
//
// The FLX10 encodes mode and page in the pad note (note = mode * 16 +
// (page - 1) * 8 + pad, SHIFT on the next MIDI channel) exactly like the
// DDJ-1000, and uses the same mode button, PAGE and colour numbers, so this is
// the pad engine of the DDJ-1000 mapping by Serhii O. Pashchenko (Sergio Alexo),
// mixxxdj/mixxx#17174, with the namespace renamed and a timer of its own.
// The pad colour palette was first charted for the FLX10 by Veezuhz.

// eslint-disable-next-line no-var
var PioneerDDJFLX10Pads = {};

PioneerDDJFLX10Pads.config = {
    samplerBanks: 8,
    blinkMs: 250,
    tickMs: 20,
};

PioneerDDJFLX10Pads.midiStatus = {
    deck: 0x90,
    pads: 0x97,
};
PioneerDDJFLX10Pads.ccOffset = 0x20;

PioneerDDJFLX10Pads.modeButtons = [0x1B, 0x1E, 0x20, 0x22, 0x69, 0x6B, 0x6D, 0x6F];
PioneerDDJFLX10Pads.pagePrevNotes = [0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B];
PioneerDDJFLX10Pads.pageNextNotes = [0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33];

PioneerDDJFLX10Pads.color = {
    off: 0, blue: 1, azure: 9, cyan: 17, green: 21, lime: 25, yellow: 29,
    amber: 33, orange: 37, red: 41, rose: 45, pink: 53, magenta: 57,
    purple: 61, white: 127,
};

// Hue of each palette step, used to build the ColorMapper for hot cue colours.
PioneerDDJFLX10Pads.paletteHues = [
    [1, 240], [5, 228], [9, 216], [13, 200], [17, 180], [21, 120], [25, 85],
    [29, 60], [33, 45], [37, 30], [41, 0], [45, 350], [49, 340], [53, 330],
    [57, 300], [61, 275],
];

PioneerDDJFLX10Pads.mode = {
    hotCue: 0, padFx1: 1, beatJump: 2, sampler: 3,
    keyboard: 4, padFx2: 5, beatLoop: 6, keyShift: 7,
};

// Hot cues on the pads (two pages of 8).
PioneerDDJFLX10Pads.padHotCues = 16;

// Pads 0-3 are the top row, 4-7 the bottom row.
PioneerDDJFLX10Pads.beatJumpBeats = [-1, 1, -2, 2, -4, 4, -8, 8];
PioneerDDJFLX10Pads.beatLoopBeats = [
    [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32],
    [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4],
];
PioneerDDJFLX10Pads.semitones = [
    [4, 5, 6, 7, 0, 1, 2, 3],
    [-4, -3, -2, -1, -8, -7, -6, -5],
];

// What each PAD FX pad does, per mode and page:
//   {unit, slot}  hold one effect of an effect unit on this deck
//   {unit}        hold the whole effect unit on this deck
//   {roll}        loop roll of that many beats (slip)
//   {brake}, {spinback}, {reverse}  deck tricks
// All of them act only while the pad is held; see padEffect().
PioneerDDJFLX10Pads.padFx = (function() {
    const c = PioneerDDJFLX10Pads.color;
    const unitRow = (unit, colour) => [
        {unit: unit, slot: 1, color: colour},
        {unit: unit, slot: 2, color: colour},
        {unit: unit, slot: 3, color: colour},
        {unit: unit, color: c.purple},
    ];
    const rolls = (beats) => beats.map((b) => ({roll: b, color: c.green}));
    const tricks = [
        {brake: true, color: c.amber},
        {spinback: true, color: c.amber},
        {reverse: true, color: c.orange},
    ];
    return {
        [PioneerDDJFLX10Pads.mode.padFx1]: [
            unitRow(3, c.blue).concat(rolls([1 / 16, 1 / 8, 1 / 4, 1 / 2])),
            unitRow(4, c.azure).concat(rolls([1 / 32, 1, 2, 4])),
        ],
        [PioneerDDJFLX10Pads.mode.padFx2]: [
            tricks.concat([{roll: 3 / 4, color: c.lime}], unitRow(4, c.azure)),
            tricks.concat([{roll: 3 / 2, color: c.lime}], unitRow(3, c.blue)),
        ],
    };
})();

PioneerDDJFLX10Pads.decks = [1, 2, 3, 4];
PioneerDDJFLX10Pads.deck = {};
// Connections that show Mixxx's state; refreshAll() replays them.
PioneerDDJFLX10Pads.connections = [];
// Connections that react to a change (a track load, a pad colour); they are
// never replayed.
PioneerDDJFLX10Pads.listeners = [];
PioneerDDJFLX10Pads.timer = 0;
PioneerDDJFLX10Pads.opened = false;
PioneerDDJFLX10Pads.blink = false;
PioneerDDJFLX10Pads.blinkAt = 0;
// Pad modes still to draw after a full refresh, one per timer tick, so the
// unit never receives a burst of pad messages.
PioneerDDJFLX10Pads.padQueue = [];
// Set while a pad colour is worked out if that colour blinks.
PioneerDDJFLX10Pads.padBlinks = false;
PioneerDDJFLX10Pads.sent = {};
PioneerDDJFLX10Pads.highRes = {};
PioneerDDJFLX10Pads.overrides = {};
PioneerDDJFLX10Pads.samplersConnected = 0;

PioneerDDJFLX10Pads.heldUnits = {};

PioneerDDJFLX10Pads.newDeckState = function() {
    return {
        vinyl: true,
        touched: false,
        freeSpin: false,
        spinTicks: [],
        mode: PioneerDDJFLX10Pads.mode.hotCue,
        page: [1, 1, 1, 1, 1, 1, 1, 1],
        jumpScale: 1,
        samplerBank: 0,
        keyboardCue: 1,
        pressed: {},
        // Pads whose colour blinks, by pad note: [mode, page, pad].
        blinking: {},
        loopAdjust: null,
        search: null,
        searchHeld: false,
        keySync: false,
        reverseTimer: 0,
        gridMode: null,
        gridRemainder: 0,
        // The deck's play and slip state from before a PAD FX brake or
        // backspin, put back when the pad is released.
        trickRestore: null,
        lastLoad: 0,
        loadTimer: 0,
    };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

PioneerDDJFLX10Pads.group = (deck) => `[Channel${deck}]`;

PioneerDDJFLX10Pads.deckFromGroup = (group) => script.deckFromGroup(group);

PioneerDDJFLX10Pads.deckStatus = (deck) => PioneerDDJFLX10Pads.midiStatus.deck + deck - 1;

PioneerDDJFLX10Pads.deckCcStatus = (deck) => PioneerDDJFLX10Pads.deckStatus(deck) + PioneerDDJFLX10Pads.ccOffset;

PioneerDDJFLX10Pads.padStatus = (deck, shifted) =>
    PioneerDDJFLX10Pads.midiStatus.pads + (deck - 1) * 2 + (shifted ? 1 : 0);

PioneerDDJFLX10Pads.clamp = (value, low, high) => Math.max(low, Math.min(high, value));


PioneerDDJFLX10Pads.override = function(group, key, value) {
    const id = `${group},${key}`;
    if (!(id in PioneerDDJFLX10Pads.overrides)) {
        PioneerDDJFLX10Pads.overrides[id] = {group: group, key: key, original: engine.getValue(group, key)};
    }
    PioneerDDJFLX10Pads.overrides[id].value = value;
    engine.setValue(group, key, value);
};

PioneerDDJFLX10Pads.restoreOverrides = function() {
    Object.keys(PioneerDDJFLX10Pads.overrides).forEach((id) => {
        const changed = PioneerDDJFLX10Pads.overrides[id];
        if (engine.getValue(changed.group, changed.key) === changed.value) {
            engine.setValue(changed.group, changed.key, changed.original);
        }
    });
    PioneerDDJFLX10Pads.overrides = {};
};

// Send a MIDI message unless the same value was the last one sent there.
PioneerDDJFLX10Pads.send = function(status, data1, data2, force) {
    const key = `${status}:${data1}`;
    const value = data2 & 0x7F;
    if (!force && PioneerDDJFLX10Pads.sent[key] === value) {
        return;
    }
    PioneerDDJFLX10Pads.sent[key] = value;
    if (PioneerDDJFLX10Pads.opened) {
        midi.sendShortMsg(status, data1, value);
    }
};

PioneerDDJFLX10Pads.led = function(status, data1, on) {
    PioneerDDJFLX10Pads.send(status, data1, on ? 0x7F : 0x00);
};

PioneerDDJFLX10Pads.deckLed = function(deck, note, on) {
    PioneerDDJFLX10Pads.led(PioneerDDJFLX10Pads.deckStatus(deck), note, on);
};


PioneerDDJFLX10Pads.connect = function(group, key, callback) {
    const connection = engine.makeConnection(group, key, callback);
    if (connection) {
        PioneerDDJFLX10Pads.connections.push(connection);
    }
    return connection;
};

PioneerDDJFLX10Pads.listen = function(group, key, callback) {
    const connection = engine.makeConnection(group, key, callback);
    if (connection) {
        PioneerDDJFLX10Pads.listeners.push(connection);
    }
    return connection;
};


PioneerDDJFLX10Pads.numSamplers = () => engine.getValue("[App]", "num_samplers");

PioneerDDJFLX10Pads.numberedGroups = function(count, name) {
    const groups = [];
    for (let i = 1; i <= count; i++) {
        groups.push(name(i));
    }
    return groups;
};

PioneerDDJFLX10Pads.samplerGroups = () =>
    PioneerDDJFLX10Pads.numberedGroups(PioneerDDJFLX10Pads.numSamplers(), (i) => `[Sampler${i}]`);

PioneerDDJFLX10Pads.microphoneGroups = () =>
    PioneerDDJFLX10Pads.numberedGroups(engine.getValue("[App]", "num_microphones"),
        (i) => (i === 1 ? "[Microphone]" : `[Microphone${i}]`));

// Every group an effect unit can be routed to.
PioneerDDJFLX10Pads.routingGroups = () =>
    PioneerDDJFLX10Pads.decks.map(PioneerDDJFLX10Pads.group)
        .concat(["[Master]", "[Headphone]"])
        .concat(PioneerDDJFLX10Pads.samplerGroups())
        .concat(PioneerDDJFLX10Pads.microphoneGroups())
        .concat(PioneerDDJFLX10Pads.numberedGroups(engine.getValue("[App]", "num_auxiliaries"),
            (i) => `[Auxiliary${i}]`))
        .concat(PioneerDDJFLX10Pads.numberedGroups(engine.getValue("[App]", "num_preview_decks"),
            (i) => `[PreviewDeck${i}]`));

PioneerDDJFLX10Pads.hueToRgb = function(hue) {
    const x = 1 - Math.abs((hue / 60) % 2 - 1);
    const sector = Math.floor(hue / 60) % 6;
    const rgb = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][sector];
    return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
};

PioneerDDJFLX10Pads.buildColorMapper = function() {
    const palette = {0xFFFFFF: PioneerDDJFLX10Pads.color.white};
    PioneerDDJFLX10Pads.paletteHues.forEach(([value, hue]) => {
        palette[PioneerDDJFLX10Pads.hueToRgb(hue)] = value;
    });
    return new ColorMapper(palette);
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------


PioneerDDJFLX10Pads.connectPads = function(deck) {
    const group = PioneerDDJFLX10Pads.group(deck);
    const m = PioneerDDJFLX10Pads.mode;
    for (let number = 1; number <= PioneerDDJFLX10Pads.padHotCues; number++) {
        const page = number > 8 ? 2 : 1;
        const pad = (number - 1) % 8;
        ["status", "color", "type"].forEach((property) => {
            PioneerDDJFLX10Pads.listen(group, `hotcue_${number}_${property}`, () => {
                PioneerDDJFLX10Pads.renderPad(deck, m.hotCue, page, pad);
            });
        });
    }
    PioneerDDJFLX10Pads.listen(group, "pitch_adjust", () => {
        PioneerDDJFLX10Pads.renderMode(deck, m.keyboard);
        PioneerDDJFLX10Pads.renderMode(deck, m.keyShift);
    });
    ["loop_enabled", "beatloop_size"].forEach((key) => {
        PioneerDDJFLX10Pads.listen(group, key, () => PioneerDDJFLX10Pads.renderMode(deck, m.beatLoop));
    });
};


PioneerDDJFLX10Pads.startRoll = function(deck, beats, slip) {
    const group = PioneerDDJFLX10Pads.group(deck);
    engine.setValue(group, "beatloop_size", beats);
    engine.setValue(group, slip ? "beatlooproll_activate" : "beatloop_activate", 1);
};

PioneerDDJFLX10Pads.stopRoll = function(deck, slip) {
    engine.setValue(PioneerDDJFLX10Pads.group(deck), slip ? "beatlooproll_activate" : "loop_enabled", 0);
};

// SHIFT + BEAT FX ON/OFF: RELEASE FX switches the Beat FX off. With CH SELECT
// on one deck (CH1-CH4) that deck also stops with a vinyl brake; MASTER, MIC
// and SAMPLER never stop a deck.

// Performance pads: modes and pages
// ---------------------------------------------------------------------------

PioneerDDJFLX10Pads.padMode = function(_channel, control, value, _status, group) {
    const mode = PioneerDDJFLX10Pads.modeButtons.indexOf(control);
    if (value && mode >= 0) {
        const deck = PioneerDDJFLX10Pads.deckFromGroup(group);
        PioneerDDJFLX10Pads.deck[deck].mode = mode;
        PioneerDDJFLX10Pads.updateModeLeds(deck);
    }
};

// PAGE < / >. In BEAT JUMP they halve / double the jump; in SAMPLER they
// change the bank.
PioneerDDJFLX10Pads.page = function(notes, direction) {
    return function(_channel, control, value, _status, group) {
        const mode = notes.indexOf(control);
        if (!value || mode < 0) {
            return;
        }
        const deck = PioneerDDJFLX10Pads.deckFromGroup(group);
        const state = PioneerDDJFLX10Pads.deck[deck];
        state.mode = mode;
        if (mode === PioneerDDJFLX10Pads.mode.beatJump) {
            state.jumpScale = PioneerDDJFLX10Pads.clamp(state.jumpScale * (direction > 0 ? 2 : 0.5), 1 / 8, 16);
        } else if (mode === PioneerDDJFLX10Pads.mode.sampler) {
            PioneerDDJFLX10Pads.stepSamplerBank(deck, direction);
        } else {
            state.page[mode] = direction > 0 ? 2 : 1;
        }
        PioneerDDJFLX10Pads.updateModeLeds(deck);
    };
};

PioneerDDJFLX10Pads.pagePrev = PioneerDDJFLX10Pads.page(PioneerDDJFLX10Pads.pagePrevNotes, -1);
PioneerDDJFLX10Pads.pageNext = PioneerDDJFLX10Pads.page(PioneerDDJFLX10Pads.pageNextNotes, 1);

// SHIFT + PAGE < / > changes the sampler bank in every mode.
PioneerDDJFLX10Pads.bankStep = function(direction) {
    return function(_channel, _control, value, _status, group) {
        if (value) {
            PioneerDDJFLX10Pads.stepSamplerBank(PioneerDDJFLX10Pads.deckFromGroup(group), direction);
        }
    };
};

PioneerDDJFLX10Pads.bankPrev = PioneerDDJFLX10Pads.bankStep(-1);
PioneerDDJFLX10Pads.bankNext = PioneerDDJFLX10Pads.bankStep(1);

// Banks of 8 samplers that exist in Mixxx.
PioneerDDJFLX10Pads.samplerBankCount = () =>
    PioneerDDJFLX10Pads.clamp(Math.ceil(PioneerDDJFLX10Pads.numSamplers() / 8), 1, PioneerDDJFLX10Pads.config.samplerBanks);

PioneerDDJFLX10Pads.stepSamplerBank = function(deck, direction) {
    const state = PioneerDDJFLX10Pads.deck[deck];
    state.samplerBank = PioneerDDJFLX10Pads.clamp(state.samplerBank + direction, 0, PioneerDDJFLX10Pads.samplerBankCount() - 1);
    PioneerDDJFLX10Pads.renderMode(deck, PioneerDDJFLX10Pads.mode.sampler);
};

PioneerDDJFLX10Pads.updateModeLeds = function(deck) {
    const state = PioneerDDJFLX10Pads.deck[deck];
    if (!state) {
        return;
    }
    // Lighting a mode button tells the unit to switch to that mode, so only
    // the active mode is lit, never blinked; PAGE lights are left to the unit.
    PioneerDDJFLX10Pads.modeButtons.forEach((note, mode) => {
        PioneerDDJFLX10Pads.deckLed(deck, note, mode === state.mode);
    });
};

// ---------------------------------------------------------------------------
// Performance pads: what a press does
// ---------------------------------------------------------------------------

// Pads: note = mode * 16 + (page - 1) * 8 + pad; SHIFT uses the next channel.
PioneerDDJFLX10Pads.pad = function(_channel, control, value, status) {
    const channelOffset = (status & 0x0F) - (PioneerDDJFLX10Pads.midiStatus.pads & 0x0F);
    const deck = (channelOffset >> 1) + 1;
    const shifted = (channelOffset & 1) === 1;
    const mode = control >> 4;
    const page = control & 0x08 ? 2 : 1;
    const pad = control & 0x07;
    const state = PioneerDDJFLX10Pads.deck[deck];

    // The unit changes mode by itself; a pad of another mode means it did.
    if (state.mode !== mode) {
        state.mode = mode;
        PioneerDDJFLX10Pads.updateModeLeds(deck);
    }
    state.pressed[mode] = state.pressed[mode] || {};
    state.pressed[mode][pad] = value > 0;
    PioneerDDJFLX10Pads.padActions[mode](deck, page, pad, value, shifted);
    PioneerDDJFLX10Pads.renderMode(deck, mode);
};

PioneerDDJFLX10Pads.padActions = {
    [PioneerDDJFLX10Pads.mode.hotCue]: (deck, page, pad, value, shifted) =>
        PioneerDDJFLX10Pads.padHotCue(deck, pad + 1 + (page - 1) * 8, value, shifted),
    [PioneerDDJFLX10Pads.mode.padFx1]: (deck, page, pad, value) =>
        PioneerDDJFLX10Pads.padEffect(deck, PioneerDDJFLX10Pads.padFx[PioneerDDJFLX10Pads.mode.padFx1][page - 1][pad], value),
    [PioneerDDJFLX10Pads.mode.padFx2]: (deck, page, pad, value) =>
        PioneerDDJFLX10Pads.padEffect(deck, PioneerDDJFLX10Pads.padFx[PioneerDDJFLX10Pads.mode.padFx2][page - 1][pad], value),
    [PioneerDDJFLX10Pads.mode.beatJump]: (deck, page, pad, value) =>
        PioneerDDJFLX10Pads.padBeatJump(deck, pad, value),
    [PioneerDDJFLX10Pads.mode.sampler]: (deck, page, pad, value, shifted) =>
        PioneerDDJFLX10Pads.padSampler(PioneerDDJFLX10Pads.deck[deck].samplerBank * 8 + pad + 1, value, shifted),
    [PioneerDDJFLX10Pads.mode.keyboard]: (deck, page, pad, value, shifted) =>
        PioneerDDJFLX10Pads.padKeyboard(deck, PioneerDDJFLX10Pads.semitones[page - 1][pad], pad, value, shifted),
    [PioneerDDJFLX10Pads.mode.beatLoop]: (deck, page, pad, value, shifted) =>
        PioneerDDJFLX10Pads.padBeatLoop(deck, PioneerDDJFLX10Pads.beatLoopBeats[page - 1][pad], value && !shifted),
    [PioneerDDJFLX10Pads.mode.keyShift]: (deck, page, pad, value) =>
        PioneerDDJFLX10Pads.padKeyShift(deck, PioneerDDJFLX10Pads.semitones[page - 1][pad], value),
};

PioneerDDJFLX10Pads.padHotCue = function(deck, number, value, shifted) {
    const group = PioneerDDJFLX10Pads.group(deck);
    if (shifted) {
        if (value) {
            engine.setValue(group, `hotcue_${number}_clear`, 1);
        }
        return;
    }
    // Sets the cue (or saves the running loop) when empty, otherwise jumps;
    // held while paused it previews.
    engine.setValue(group, `hotcue_${number}_activate`, value ? 1 : 0);
    if (value) {
        PioneerDDJFLX10Pads.deck[deck].keyboardCue = number;
    }
};

// PAD FX (see PioneerDDJFLX10Pads.padFx). Each acts only while its pad is held and
// leaves the deck or effect unit as it found it when the pad is released.
PioneerDDJFLX10Pads.padEffect = function(deck, entry, value) {
    if (entry.roll !== undefined) {
        PioneerDDJFLX10Pads.padRoll(deck, entry.roll, value);
    } else if (entry.brake || entry.spinback) {
        PioneerDDJFLX10Pads.padTrick(deck, entry.spinback, value);
    } else if (entry.reverse) {
        // Mixxx's slip reverse returns to where the track would have been.
        engine.setValue(PioneerDDJFLX10Pads.group(deck), "reverseroll", value ? 1 : 0);
    } else if (value) {
        PioneerDDJFLX10Pads.holdUnit(deck, entry.unit, entry.slot);
    } else {
        PioneerDDJFLX10Pads.releaseUnit(entry.unit);
    }
};

// A slip loop roll while held.
PioneerDDJFLX10Pads.padRoll = function(deck, beats, value) {
    if (value) {
        PioneerDDJFLX10Pads.startRoll(deck, beats, true);
    } else {
        PioneerDDJFLX10Pads.stopRoll(deck, true);
    }
};

// Vinyl brake or backspin while held. Slip keeps the track running
// underneath, so a deck that was playing carries on where it would have been;
// a deck that was paused stays paused, where it was.
PioneerDDJFLX10Pads.padTrick = function(deck, spinback, value) {
    const group = PioneerDDJFLX10Pads.group(deck);
    const state = PioneerDDJFLX10Pads.deck[deck];
    if (value) {
        // With two trick pads held, keep the state from before the first.
        if (!state.trickRestore) {
            state.trickRestore = {
                play: engine.getValue(group, "play"),
                slip: engine.getValue(group, "slip_enabled"),
            };
        }
        engine.setValue(group, "slip_enabled", 1);
    }
    if (spinback) {
        engine.spinback(deck, value > 0);
    } else {
        engine.brake(deck, value > 0);
    }
    if (!value && state.trickRestore) {
        // Play first: switching slip off then jumps to the slip position.
        if (state.trickRestore.play) {
            engine.setValue(group, "play", 1);
        }
        engine.setValue(group, "slip_enabled", state.trickRestore.slip);
        state.trickRestore = null;
    }
};

// Hold an effect unit, or one effect of it (slot), on this deck alone.
// Everything changed here is saved and put back by releaseUnit().
PioneerDDJFLX10Pads.holdUnit = function(deck, unitNumber, slot) {
    const unit = `[EffectRack1_EffectUnit${unitNumber}]`;
    const deckGroup = PioneerDDJFLX10Pads.group(deck);
    if (PioneerDDJFLX10Pads.heldUnits[unitNumber]) {
        PioneerDDJFLX10Pads.releaseUnit(unitNumber);
    }
    const saved = {enabled: engine.getValue(unit, "enabled"), routing: {}, slots: {}};
    // Every route, not just the decks': a unit also routed to Main or to the
    // samplers would otherwise still reach the whole mix.
    PioneerDDJFLX10Pads.routingGroups().forEach((group) => {
        const key = `group_${group}_enable`;
        saved.routing[key] = engine.getValue(unit, key);
        engine.setValue(unit, key, group === deckGroup ? 1 : 0);
    });
    if (slot) {
        for (let i = 1; i <= 3; i++) {
            const slotGroup = `[EffectRack1_EffectUnit${unitNumber}_Effect${i}]`;
            saved.slots[slotGroup] = engine.getValue(slotGroup, "enabled");
            engine.setValue(slotGroup, "enabled", i === slot ? 1 : 0);
        }
    }
    PioneerDDJFLX10Pads.heldUnits[unitNumber] = saved;
    engine.setValue(unit, "enabled", 1);
};

PioneerDDJFLX10Pads.releaseUnit = function(unitNumber) {
    const saved = PioneerDDJFLX10Pads.heldUnits[unitNumber];
    if (!saved) {
        return;
    }
    const unit = `[EffectRack1_EffectUnit${unitNumber}]`;
    engine.setValue(unit, "enabled", saved.enabled);
    Object.keys(saved.routing).forEach((key) => engine.setValue(unit, key, saved.routing[key]));
    Object.keys(saved.slots).forEach((slotGroup) => engine.setValue(slotGroup, "enabled", saved.slots[slotGroup]));
    delete PioneerDDJFLX10Pads.heldUnits[unitNumber];
};

PioneerDDJFLX10Pads.padBeatJump = function(deck, pad, value) {
    if (value) {
        engine.setValue(PioneerDDJFLX10Pads.group(deck), "beatjump",
            PioneerDDJFLX10Pads.beatJumpBeats[pad] * PioneerDDJFLX10Pads.deck[deck].jumpScale);
    }
};

// SAMPLER: play the slot from the start; SHIFT stops it; an empty slot loads
// the selected track. Pads past the last sampler do nothing.
PioneerDDJFLX10Pads.padSampler = function(number, value, shifted) {
    if (!value || number > PioneerDDJFLX10Pads.numSamplers()) {
        return;
    }
    const group = `[Sampler${number}]`;
    if (shifted) {
        engine.setValue(group, "cue_gotoandstop", 1);
    } else if (engine.getValue(group, "track_loaded")) {
        engine.setValue(group, "cue_gotoandplay", 1);
    } else {
        engine.setValue(group, "LoadSelectedTrack", 1);
    }
};

// KEYBOARD: play the chosen hot cue in another key; SHIFT + pad chooses the
// hot cue (1-8). Without that hot cue the CUE point is used.
PioneerDDJFLX10Pads.padKeyboard = function(deck, semitones, pad, value, shifted) {
    const group = PioneerDDJFLX10Pads.group(deck);
    const state = PioneerDDJFLX10Pads.deck[deck];
    if (shifted) {
        if (value) {
            state.keyboardCue = pad + 1;
        }
        return;
    }
    if (value) {
        engine.setValue(group, "pitch_adjust", semitones);
    }
    if (engine.getValue(group, `hotcue_${state.keyboardCue}_position`) >= 0) {
        engine.setValue(group, `hotcue_${state.keyboardCue}_activate`, value ? 1 : 0);
    } else if (value) {
        engine.setValue(group, "cue_gotoandplay", 1);
    }
};

// BEAT LOOP: a loop of that size; the lit pad again leaves it.
PioneerDDJFLX10Pads.padBeatLoop = function(deck, beats, pressed) {
    if (!pressed) {
        return;
    }
    const group = PioneerDDJFLX10Pads.group(deck);
    const sameSize = Math.abs(engine.getValue(group, "beatloop_size") - beats) < 1e-6;
    if (engine.getValue(group, "loop_enabled") && sameSize) {
        engine.setValue(group, "loop_enabled", 0);
    } else {
        engine.setValue(group, "beatloop_size", beats);
        engine.setValue(group, "beatloop_activate", 1);
    }
};

// KEY SHIFT: shift the key; the lit pad again returns to 0.
PioneerDDJFLX10Pads.padKeyShift = function(deck, semitones, value) {
    if (value) {
        const group = PioneerDDJFLX10Pads.group(deck);
        const current = Math.round(engine.getValue(group, "pitch_adjust"));
        engine.setValue(group, "pitch_adjust", current === semitones ? 0 : semitones);
    }
};

// ---------------------------------------------------------------------------
// Performance pads: colours
// ---------------------------------------------------------------------------

// Pad colours are sent when something they show changes (see connectPads()
// and connectSamplers()), when a pad is pressed, and on the blink for the
// pads that blink. send() skips colours the unit already has.

// Send one pad's colour on both its channels (with and without SHIFT).
PioneerDDJFLX10Pads.renderPad = function(deck, mode, page, pad) {
    const state = PioneerDDJFLX10Pads.deck[deck];
    if (!state || !PioneerDDJFLX10Pads.opened) {
        return;
    }
    const note = mode * 16 + (page - 1) * 8 + pad;
    PioneerDDJFLX10Pads.padBlinks = false;
    const colour = PioneerDDJFLX10Pads.padColors[mode](deck, page, pad);
    if (PioneerDDJFLX10Pads.padBlinks) {
        state.blinking[note] = [mode, page, pad];
    } else {
        delete state.blinking[note];
    }
    PioneerDDJFLX10Pads.send(PioneerDDJFLX10Pads.padStatus(deck, false), note, colour);
    PioneerDDJFLX10Pads.send(PioneerDDJFLX10Pads.padStatus(deck, true), note, colour);
};

PioneerDDJFLX10Pads.renderMode = function(deck, mode) {
    for (let page = 1; page <= 2; page++) {
        for (let pad = 0; pad < 8; pad++) {
            PioneerDDJFLX10Pads.renderPad(deck, mode, page, pad);
        }
    }
};

PioneerDDJFLX10Pads.renderBlinkingPads = function(deck) {
    const blinking = PioneerDDJFLX10Pads.deck[deck].blinking;
    Object.keys(blinking).forEach((note) => {
        const [mode, page, pad] = blinking[note];
        PioneerDDJFLX10Pads.renderPad(deck, mode, page, pad);
    });
};

// Every pad of every deck: the modes on screen now, the rest from the timer.
PioneerDDJFLX10Pads.queueAllPads = function() {
    PioneerDDJFLX10Pads.padQueue = [];
    PioneerDDJFLX10Pads.decks.forEach((deck) => {
        const onScreen = PioneerDDJFLX10Pads.deck[deck].mode;
        PioneerDDJFLX10Pads.renderMode(deck, onScreen);
        for (let mode = 0; mode < 8; mode++) {
            if (mode !== onScreen) {
                PioneerDDJFLX10Pads.padQueue.push([deck, mode]);
            }
        }
    });
};

// A sampler changed: redraw its pad on the decks showing its bank.
PioneerDDJFLX10Pads.renderSamplerPad = function(number) {
    const bank = Math.floor((number - 1) / 8);
    const pad = (number - 1) % 8;
    PioneerDDJFLX10Pads.decks.forEach((deck) => {
        if (PioneerDDJFLX10Pads.deck[deck].samplerBank === bank) {
            PioneerDDJFLX10Pads.renderPad(deck, PioneerDDJFLX10Pads.mode.sampler, 1, pad);
            PioneerDDJFLX10Pads.renderPad(deck, PioneerDDJFLX10Pads.mode.sampler, 2, pad);
        }
    });
};

// A blinking colour: `on` on the blink, `off` in between. Marks the pad so
// the timer redraws it on every blink.
PioneerDDJFLX10Pads.blinkColor = function(on, off) {
    PioneerDDJFLX10Pads.padBlinks = true;
    return PioneerDDJFLX10Pads.blink ? on : off;
};

PioneerDDJFLX10Pads.isPressed = function(deck, mode, pad) {
    const pressed = PioneerDDJFLX10Pads.deck[deck].pressed[mode];
    return !!(pressed && pressed[pad]);
};

PioneerDDJFLX10Pads.hotCueColor = function(deck, number) {
    const group = PioneerDDJFLX10Pads.group(deck);
    const status = engine.getValue(group, `hotcue_${number}_status`);
    if (!status) {
        return PioneerDDJFLX10Pads.color.off;
    }
    const colour = PioneerDDJFLX10Pads.colorMapper.getValueForNearestColor(
        engine.getValue(group, `hotcue_${number}_color`));
    // A saved loop that is running blinks.
    if (status === 2 && engine.getValue(group, `hotcue_${number}_type`) === 4) {
        return PioneerDDJFLX10Pads.blinkColor(colour, PioneerDDJFLX10Pads.color.off);
    }
    return colour;
};

PioneerDDJFLX10Pads.padFxColor = function(deck, mode, page, pad) {
    return PioneerDDJFLX10Pads.isPressed(deck, mode, pad)
        ? PioneerDDJFLX10Pads.color.white
        : PioneerDDJFLX10Pads.padFx[mode][page - 1][pad].color;
};

PioneerDDJFLX10Pads.beatJumpColor = function(deck, pad) {
    const c = PioneerDDJFLX10Pads.color;
    if (PioneerDDJFLX10Pads.isPressed(deck, PioneerDDJFLX10Pads.mode.beatJump, pad)) {
        return c.white;
    }
    return PioneerDDJFLX10Pads.beatJumpBeats[pad] < 0 ? c.azure : c.cyan;
};

PioneerDDJFLX10Pads.samplerColor = function(deck, pad) {
    const c = PioneerDDJFLX10Pads.color;
    const number = PioneerDDJFLX10Pads.deck[deck].samplerBank * 8 + pad + 1;
    if (number > PioneerDDJFLX10Pads.numSamplers()) {
        return c.off;
    }
    const sampler = `[Sampler${number}]`;
    if (!engine.getValue(sampler, "track_loaded")) {
        return c.off;
    }
    return engine.getValue(sampler, "play") ? PioneerDDJFLX10Pads.blinkColor(c.white, c.magenta) : c.magenta;
};

// KEYBOARD and KEY SHIFT: the current key shift is white, no shift yellow.
PioneerDDJFLX10Pads.semitoneColor = function(deck, mode, page, pad) {
    const c = PioneerDDJFLX10Pads.color;
    const semitones = PioneerDDJFLX10Pads.semitones[page - 1][pad];
    if (Math.round(engine.getValue(PioneerDDJFLX10Pads.group(deck), "pitch_adjust")) === semitones) {
        return c.white;
    }
    if (semitones === 0) {
        return c.yellow;
    }
    return mode === PioneerDDJFLX10Pads.mode.keyboard ? c.purple : c.pink;
};

PioneerDDJFLX10Pads.beatLoopColor = function(deck, page, pad) {
    const c = PioneerDDJFLX10Pads.color;
    const group = PioneerDDJFLX10Pads.group(deck);
    const beats = PioneerDDJFLX10Pads.beatLoopBeats[page - 1][pad];
    const active = engine.getValue(group, "loop_enabled")
        && Math.abs(engine.getValue(group, "beatloop_size") - beats) < 1e-6;
    return active ? PioneerDDJFLX10Pads.blinkColor(c.white, c.green) : c.green;
};

PioneerDDJFLX10Pads.padColors = {
    [PioneerDDJFLX10Pads.mode.hotCue]: (deck, page, pad) => PioneerDDJFLX10Pads.hotCueColor(deck, pad + 1 + (page - 1) * 8),
    [PioneerDDJFLX10Pads.mode.padFx1]: (deck, page, pad) =>
        PioneerDDJFLX10Pads.padFxColor(deck, PioneerDDJFLX10Pads.mode.padFx1, page, pad),
    [PioneerDDJFLX10Pads.mode.padFx2]: (deck, page, pad) =>
        PioneerDDJFLX10Pads.padFxColor(deck, PioneerDDJFLX10Pads.mode.padFx2, page, pad),
    [PioneerDDJFLX10Pads.mode.beatJump]: (deck, page, pad) => PioneerDDJFLX10Pads.beatJumpColor(deck, pad),
    [PioneerDDJFLX10Pads.mode.sampler]: (deck, page, pad) => PioneerDDJFLX10Pads.samplerColor(deck, pad),
    [PioneerDDJFLX10Pads.mode.keyboard]: (deck, page, pad) =>
        PioneerDDJFLX10Pads.semitoneColor(deck, PioneerDDJFLX10Pads.mode.keyboard, page, pad),
    [PioneerDDJFLX10Pads.mode.beatLoop]: (deck, page, pad) => PioneerDDJFLX10Pads.beatLoopColor(deck, page, pad),
    [PioneerDDJFLX10Pads.mode.keyShift]: (deck, page, pad) =>
        PioneerDDJFLX10Pads.semitoneColor(deck, PioneerDDJFLX10Pads.mode.keyShift, page, pad),
};


PioneerDDJFLX10Pads.connectSamplers = function() {
    const count = PioneerDDJFLX10Pads.numSamplers();
    for (let i = PioneerDDJFLX10Pads.samplersConnected + 1; i <= count; i++) {
        PioneerDDJFLX10Pads.listen(`[Sampler${i}]`, "track_loaded", () => PioneerDDJFLX10Pads.renderSamplerPad(i));
        PioneerDDJFLX10Pads.listen(`[Sampler${i}]`, "play", () => PioneerDDJFLX10Pads.renderSamplerPad(i));
    }
    PioneerDDJFLX10Pads.samplersConnected = Math.max(count, PioneerDDJFLX10Pads.samplersConnected);
};

// Mixxx opens the MIDI output only after init() returns, so the pads are
// drawn from the first tick.
PioneerDDJFLX10Pads.tick = function() {
    if (!PioneerDDJFLX10Pads.opened) {
        PioneerDDJFLX10Pads.opened = true;
        PioneerDDJFLX10Pads.sent = {};
        PioneerDDJFLX10Pads.decks.forEach((deck) => PioneerDDJFLX10Pads.updateModeLeds(deck));
        PioneerDDJFLX10Pads.queueAllPads();
    }
    const now = Date.now();
    if (now - PioneerDDJFLX10Pads.blinkAt >= PioneerDDJFLX10Pads.config.blinkMs) {
        PioneerDDJFLX10Pads.blink = !PioneerDDJFLX10Pads.blink;
        PioneerDDJFLX10Pads.blinkAt = now;
        PioneerDDJFLX10Pads.decks.forEach((deck) => PioneerDDJFLX10Pads.renderBlinkingPads(deck));
    }
    const queued = PioneerDDJFLX10Pads.padQueue.shift();
    if (queued) {
        PioneerDDJFLX10Pads.renderMode(queued[0], queued[1]);
    }
};

PioneerDDJFLX10Pads.init = function() {
    PioneerDDJFLX10Pads.colorMapper = PioneerDDJFLX10Pads.buildColorMapper();
    PioneerDDJFLX10Pads.decks.forEach((deck) => {
        PioneerDDJFLX10Pads.deck[deck] = PioneerDDJFLX10Pads.newDeckState();
        PioneerDDJFLX10Pads.connectPads(deck);
    });
    PioneerDDJFLX10Pads.connectSamplers();
    PioneerDDJFLX10Pads.listen("[App]", "num_samplers", PioneerDDJFLX10Pads.connectSamplers);
    PioneerDDJFLX10Pads.timer = engine.beginTimer(PioneerDDJFLX10Pads.config.tickMs, PioneerDDJFLX10Pads.tick);
};

PioneerDDJFLX10Pads.shutdown = function() {
    if (PioneerDDJFLX10Pads.timer) {
        engine.stopTimer(PioneerDDJFLX10Pads.timer);
        PioneerDDJFLX10Pads.timer = 0;
    }
    Object.keys(PioneerDDJFLX10Pads.heldUnits).forEach((unit) => PioneerDDJFLX10Pads.releaseUnit(unit));
    PioneerDDJFLX10Pads.connections.concat(PioneerDDJFLX10Pads.listeners).forEach((c) => c.disconnect());
    PioneerDDJFLX10Pads.connections = [];
    PioneerDDJFLX10Pads.listeners = [];
    PioneerDDJFLX10Pads.restoreOverrides();
    Object.keys(PioneerDDJFLX10Pads.sent).forEach((key) => {
        const parts = key.split(":").map(Number);
        if ((parts[0] & 0xF0) === 0x90) {
            midi.sendShortMsg(parts[0], parts[1], 0x00);
        }
    });
};

// Memory cues (CUE/LOOP CALL) use hot cues 17-36; pads use 1-16.
PioneerDDJFLX10Pads.memoryFirst = 17;
PioneerDDJFLX10Pads.memoryLast = 36;
PioneerDDJFLX10Pads.memoryColor = 0xE8201E;

PioneerDDJFLX10Pads.samplesPerSecond = (group) => (engine.getValue(group, "track_samplerate") || 44100) * 2;

PioneerDDJFLX10Pads.playSamples = (group) =>
    engine.getValue(group, "playposition") * engine.getValue(group, "track_samples");

PioneerDDJFLX10Pads.seekSamples = function(group, samples) {
    const total = engine.getValue(group, "track_samples");
    if (total > 0) {
        engine.setValue(group, "playposition", PioneerDDJFLX10Pads.clamp(samples / total, 0, 1));
    }
};

PioneerDDJFLX10Pads.cueCall = function(direction) {
    return function(_channel, _control, value, _status, group) {
        if (!value || !engine.getValue(group, "track_loaded")) {
            return;
        }
        const here = PioneerDDJFLX10Pads.playSamples(group);
        const margin = PioneerDDJFLX10Pads.samplesPerSecond(group) * 0.05;
        const points = [engine.getValue(group, "cue_point")];
        for (let i = 1; i <= PioneerDDJFLX10Pads.memoryLast; i++) {
            points.push(engine.getValue(group, `hotcue_${i}_position`));
        }
        const candidates = points.filter((p) => p >= 0 && (direction < 0 ? p < here - margin : p > here + margin));
        if (!candidates.length) {
            return;
        }
        const target = direction < 0 ? Math.max.apply(null, candidates) : Math.min.apply(null, candidates);
        PioneerDDJFLX10Pads.seekSamples(group, target);
        if (!engine.getValue(group, "play")) {
            // A called cue becomes the CUE point, as on a CDJ. This replaces
            // the track's stored cue point (noted in the manual).
            engine.setValue(group, "cue_set", 1);
        }
    };
};

PioneerDDJFLX10Pads.cueCallBack = PioneerDDJFLX10Pads.cueCall(-1);
PioneerDDJFLX10Pads.cueCallForward = PioneerDDJFLX10Pads.cueCall(1);

// MEMORY: store the current position (or the running loop) as a memory cue.
PioneerDDJFLX10Pads.memory = function(_channel, _control, value, _status, group) {
    if (!value || !engine.getValue(group, "track_loaded")) {
        return;
    }
    const here = PioneerDDJFLX10Pads.playSamples(group);
    const margin = PioneerDDJFLX10Pads.samplesPerSecond(group) * 0.05;
    let free = 0;
    for (let i = PioneerDDJFLX10Pads.memoryFirst; i <= PioneerDDJFLX10Pads.memoryLast; i++) {
        const position = engine.getValue(group, `hotcue_${i}_position`);
        if (position >= 0 && Math.abs(position - here) < margin) {
            return;
        }
        if (position < 0 && !free) {
            free = i;
        }
    }
    if (free) {
        engine.setValue(group, `hotcue_${free}_set`, 1);
        engine.setValue(group, `hotcue_${free}_color`, PioneerDDJFLX10Pads.memoryColor);
    }
};

// SHIFT + MEMORY: delete the memory cue nearest the current position (within 1 s).
PioneerDDJFLX10Pads.memoryDelete = function(_channel, _control, value, _status, group) {
    if (!value || !engine.getValue(group, "track_loaded")) {
        return;
    }
    const here = PioneerDDJFLX10Pads.playSamples(group);
    let nearest = 0;
    let distance = PioneerDDJFLX10Pads.samplesPerSecond(group);
    for (let i = PioneerDDJFLX10Pads.memoryFirst; i <= PioneerDDJFLX10Pads.memoryLast; i++) {
        const position = engine.getValue(group, `hotcue_${i}_position`);
        if (position >= 0 && Math.abs(position - here) <= distance) {
            nearest = i;
            distance = Math.abs(position - here);
        }
    }
    if (nearest) {
        engine.setValue(group, `hotcue_${nearest}_clear`, 1);
    }
};
