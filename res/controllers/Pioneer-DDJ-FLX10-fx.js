// Beat FX and Sound Color FX of the DDJ-FLX10 as the rekordbox section of the
// Operating Instructions describes them. Every effect is built from Mixxx
// effects loaded by id with engine.loadEffect(), so it does not depend on the
// order of the user's preset lists. Without that API (stock Mixxx) the Sound
// Color FX fall back to the stock quick effect presets and the Beat FX to
// whatever chain is loaded in effect unit 1.

// eslint-disable-next-line no-var
var PioneerDDJFLX10Fx = {};

PioneerDDJFLX10Fx.UNIT = "[EffectRack1_EffectUnit1]";
PioneerDDJFLX10Fx.DRY_SLASH_WET = 0;
PioneerDDJFLX10Fx.DRY_PLUS_WET = 1;
PioneerDDJFLX10Fx.LED_ON = 0x7F;
PioneerDDJFLX10Fx.BLINK_MS = 500;
PioneerDDJFLX10Fx.TAP_TIMEOUT_MS = 2000;

PioneerDDJFLX10Fx.ID = {
    delay: "org.mixxx.effects.beatdelay",
    reverb: "org.mixxx.effects.reverb",
    tremolo: "org.mixxx.effects.tremolo",
    barberpole: "org.mixxx.effects.barberpoleflanger",
    flanger: "org.mixxx.effects.flanger",
    phaser: "org.mixxx.effects.phaser",
    stretch: "org.mixxx.effects.stretch",
    shepard: "org.mixxx.effects.shepardtone",
    filter: "org.mixxx.effects.filter",
    bitcrusher: "org.mixxx.effects.bitcrusher",
    pitch: "org.mixxx.effects.pitchshift",
    noise: "org.mixxx.effects.filterednoise",
};

PioneerDDJFLX10Fx.clamp = function(value, min, max) {
    return Math.max(min, Math.min(max, value));
};

// Logarithmic sweep from `from` to `to` (both > 0) for amount 0..1.
PioneerDDJFLX10Fx.sweep = function(from, to, amount) {
    return from * Math.pow(to / from, amount);
};

PioneerDDJFLX10Fx.BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16, 32, 64];
PioneerDDJFLX10Fx.UP_TO_16 = PioneerDDJFLX10Fx.BEATS.slice(0, 10);
PioneerDDJFLX10Fx.SIGNED_BEATS = PioneerDDJFLX10Fx.BEATS.slice().reverse()
    .map(function(b) { return -b; })
    .concat(PioneerDDJFLX10Fx.BEATS);
PioneerDDJFLX10Fx.REVERB_SIZES = [0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

// ----- Beat FX ----------------------------------------------------------------
// BEAT FX select knob positions, notes 0x20-0x2D on channel 5. `steps` are the
// BEAT < / > values, `start` the index used until BEAT < / > is pressed.
// build(beats, level) returns the chain: mix mode, mix, and up to three
// effects as [id, {parameterId: value}].
PioneerDDJFLX10Fx.BEAT_FX = [
    {
        name: "LOW CUT ECHO", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.delay, {time: b, feedback: 0.55, taps: 1,
                    low_cut: 700, high_cut: 20000, send: 1, glide: 0}]]};
        },
    },
    {
        name: "ECHO", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.delay, {time: b, feedback: 0.5, taps: 1,
                    low_cut: 20, high_cut: 20000, send: 1, glide: 0}]]};
        },
    },
    {
        name: "MT DELAY", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 5,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.delay, {time: b, feedback: 0.25, taps: 7,
                    low_cut: 20, high_cut: 20000, send: 1, glide: 0}]]};
        },
    },
    {
        // The delay glides to a new time, so the repeats bend in pitch.
        name: "SPIRAL", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.delay, {time: b, feedback: 0.45 + 0.45 * level,
                    taps: 1, low_cut: 20, high_cut: 20000, send: 1, glide: 1}],
                [PioneerDDJFLX10Fx.ID.reverb, {decay: 0.7, bandwidth: 0.9, damping: 0.3,
                    send_amount: 1}]]};
        },
    },
    {
        name: "REVERB", steps: PioneerDDJFLX10Fx.REVERB_SIZES, start: 5,
        build: function(size, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.reverb, {decay: size, bandwidth: 1, damping: 0.3,
                    send_amount: 1}]]};
        },
    },
    {
        // LEVEL also shortens the part of each cycle that is let through.
        name: "TRANS", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.tremolo, {depth: level,
                    rate: PioneerDDJFLX10Fx.clamp(1 / b, 1 / 4, 8),
                    width: 0.8 - 0.6 * level, waveform: 0.005, phase: 0,
                    quantize: 1, triplet: 0}]]};
        },
    },
    {
        name: "ENIGMA JET", steps: PioneerDDJFLX10Fx.SIGNED_BEATS, start: 19,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.barberpole, {period: Math.abs(b), depth: 1,
                    regen: 0.6, falling: b < 0 ? 1 : 0}]]};
        },
    },
    {
        name: "FLANGER", steps: PioneerDDJFLX10Fx.BEATS, start: 7,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.flanger, {speed: PioneerDDJFLX10Fx.clamp(b, 1 / 4, 32),
                    regen: 0.6, mix: 1, triplet: 0}]]};
        },
    },
    {
        name: "PHASER", steps: PioneerDDJFLX10Fx.BEATS, start: 5,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.phaser, {lfo_period: PioneerDDJFLX10Fx.clamp(b, 1 / 16, 4),
                    feedback: 0.5, range: 1, stages: 6, depth: 1, triplet: 0, stereo: 1}]]};
        },
    },
    {
        // LEVEL sets how many times slower the recording plays.
        name: "STRETCH", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 5,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.stretch, {retrigger: b, stretch: 1 + 3 * level}]]};
        },
    },
    {name: "SLIP ROLL", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3, roll: "slip"},
    {name: "ROLL", steps: PioneerDDJFLX10Fx.UP_TO_16, start: 3, roll: "loop"},
    {
        name: "MOBIUS SAW", steps: PioneerDDJFLX10Fx.SIGNED_BEATS, start: 19,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.shepard, {period: Math.abs(b), level: 1,
                    falling: b < 0 ? 1 : 0, triangle: 0}]]};
        },
    },
    {
        name: "MOBIUS TRI", steps: PioneerDDJFLX10Fx.SIGNED_BEATS, start: 19,
        build: function(b, level) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: level, slots: [
                [PioneerDDJFLX10Fx.ID.shepard, {period: Math.abs(b), level: 1,
                    falling: b < 0 ? 1 : 0, triangle: 1}]]};
        },
    },
];

// Beat parameters of each effect, so TAP mode can rescale them.
PioneerDDJFLX10Fx.BEAT_PARAMETERS = {
    time: [1 / 16, 16], period: [1 / 16, 64], retrigger: [1 / 16, 16],
    speed: [1 / 4, 32], lfo_period: [0, 4],
};

// BEAT FX CH SELECT positions (notes 0x10-0x16).
PioneerDDJFLX10Fx.TARGETS = {
    0x10: "1", 0x11: "2", 0x12: "3", 0x13: "4", 0x14: "MST", 0x15: "MIC", 0x16: "SP",
};

PioneerDDJFLX10Fx.beat = {
    fx: 1,
    step: [],
    on: false,
    level: 0.5,
    levelMsb: 64,
    target: "MST",
    loadedIds: [],
    rollDecks: [],
    savedLoopSize: {},
    blinkTimer: 0,
    blinkLit: false,
    selectTimer: 0,
    pendingFx: 1,
    tapBpm: 0,
    taps: [],
};

PioneerDDJFLX10Fx.slotGroup = function(rack, n) {
    return rack.slice(0, -1) + "_Effect" + n + "]";
};

PioneerDDJFLX10Fx.available = function() {
    return typeof engine.loadEffect === "function";
};

// Loads the chain built by a Beat FX or Sound Color FX into a rack. Slots the
// chain does not use are switched off but keep their effect.
PioneerDDJFLX10Fx.slotCount = function(rack) {
    return engine.getValue(rack, "num_effectslots") || 4;
};

// Slots the chain does not use are emptied: an effect left there from a
// preset (e.g. the echo of "Smooth Growl" in slot 3) would keep playing
// next to the chosen FX.
PioneerDDJFLX10Fx.loadChain = function(rack, chain, loadedIds, enabled, reload) {
    for (var n = 1; n <= PioneerDDJFLX10Fx.slotCount(rack); n++) {
        var group = PioneerDDJFLX10Fx.slotGroup(rack, n);
        var slot = chain.slots[n - 1];
        if (slot) {
            engine.loadEffect(group, slot[0], slot[1], reload === true);
            loadedIds[n] = slot[0];
            engine.setValue(group, "enabled", enabled ? 1 : 0);
        } else if (loadedIds[n] !== null) {
            engine.setValue(group, "clear", 1);
            loadedIds[n] = null;
        }
    }
    engine.setValue(rack, "mix_mode", chain.mode);
    engine.setValue(rack, "mix", chain.mix);
};

PioneerDDJFLX10Fx.currentBeatFx = function() {
    return PioneerDDJFLX10Fx.BEAT_FX[PioneerDDJFLX10Fx.beat.fx];
};

PioneerDDJFLX10Fx.currentBeats = function() {
    var state = PioneerDDJFLX10Fx.beat;
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    if (state.step[state.fx] === undefined) {
        state.step[state.fx] = fx.start;
    }
    return fx.steps[state.step[state.fx]];
};

PioneerDDJFLX10Fx.targetDecks = function() {
    var target = PioneerDDJFLX10Fx.beat.target;
    if (target >= "1" && target <= "4") {
        return [parseInt(target, 10)];
    }
    if (target !== "MST") {
        return [];
    }
    var decks = [];
    for (var d = 1; d <= 4; d++) {
        if (engine.getValue("[Channel" + d + "]", "play")) {
            decks.push(d);
        }
    }
    return decks;
};

// BPM the effects follow: the target deck, or for MST the sync leader or the
// first playing deck, as the engine does for the main bus.
PioneerDDJFLX10Fx.sourceBpm = function() {
    var decks = PioneerDDJFLX10Fx.targetDecks();
    for (var i = 0; i < decks.length; i++) {
        var group = "[Channel" + decks[i] + "]";
        if (engine.getValue(group, "sync_mode") === 2 && engine.getValue(group, "bpm") > 0) {
            return engine.getValue(group, "bpm");
        }
    }
    for (var j = 0; j < decks.length; j++) {
        var bpm = engine.getValue("[Channel" + decks[j] + "]", "bpm");
        if (bpm > 0) {
            return bpm;
        }
    }
    return 120;
};

// In TAP mode the beat parameters are scaled so the effect runs at the tapped
// tempo while the engine keeps counting in beats of the source.
PioneerDDJFLX10Fx.applyTapTempo = function(chain) {
    var tapBpm = PioneerDDJFLX10Fx.beat.tapBpm;
    if (!tapBpm) {
        return chain;
    }
    var scale = PioneerDDJFLX10Fx.sourceBpm() / tapBpm;
    chain.slots.forEach(function(slot) {
        Object.keys(slot[1]).forEach(function(id) {
            var range = PioneerDDJFLX10Fx.BEAT_PARAMETERS[id];
            if (range) {
                slot[1][id] = PioneerDDJFLX10Fx.clamp(slot[1][id] * scale, range[0], range[1]);
            }
        });
        if (slot[1].rate !== undefined) {
            slot[1].rate = PioneerDDJFLX10Fx.clamp(slot[1].rate / scale, 1 / 4, 8);
        }
    });
    return chain;
};

// reload starts the effects afresh, so a new Beat FX that uses the same
// effect (the delays) does not carry over the repeats of the previous one.
PioneerDDJFLX10Fx.applyBeatFx = function(reload) {
    var state = PioneerDDJFLX10Fx.beat;
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    var unit = PioneerDDJFLX10Fx.UNIT;
    if (!PioneerDDJFLX10Fx.available()) {
        engine.setValue(unit, "mix", state.level);
        engine.setValue(unit, "enabled", state.on && !fx.roll ? 1 : 0);
        return;
    }
    if (fx.roll) {
        engine.setValue(unit, "enabled", 0);
        return;
    }
    var chain = PioneerDDJFLX10Fx.applyTapTempo(
        fx.build(PioneerDDJFLX10Fx.currentBeats(), state.level));
    PioneerDDJFLX10Fx.loadChain(unit, chain, state.loadedIds, true, reload);
    engine.setValue(unit, "enabled", state.on ? 1 : 0);
};

// The stems FX PART SELECT picks on a deck, or null for the whole deck.
// All three parts lit is the whole track, as with none lit.
PioneerDDJFLX10Fx.partStems = function(deck) {
    var selected = PioneerDDJFLX10._selectedStems();
    if (!selected.length || selected.length >= 4 || !PioneerDDJFLX10._hasStems(deck)) {
        return null;
    }
    return selected;
};

// With parts selected, the unit is routed to those stems of the target deck
// (MST: of every deck with stems) instead of the deck or the master.
PioneerDDJFLX10Fx.routeBeatFx = function() {
    var unit = PioneerDDJFLX10Fx.UNIT;
    var target = PioneerDDJFLX10Fx.beat.target;
    var anyParts = PioneerDDJFLX10._selectedStems().length > 0;
    var groups = {};
    var d;
    var stem;
    var partsOnMaster = false;
    for (d = 1; d <= 4; d++) {
        var stems = PioneerDDJFLX10Fx.partStems(d);
        var deckTargeted = target === String(d) || target === "MST";
        groups["[Channel" + d + "]"] = target === String(d) && !stems;
        for (stem = 1; stem <= 4; stem++) {
            groups[PioneerDDJFLX10._stemGroup(d, stem)] =
                deckTargeted && stems !== null && stems.indexOf(stem) >= 0;
        }
        partsOnMaster = partsOnMaster || (target === "MST" && stems !== null);
    }
    groups["[Master]"] = target === "MST" && !(anyParts && partsOnMaster);
    var mics = engine.getValue("[App]", "num_microphones") || 1;
    groups["[Microphone]"] = target === "MIC";
    for (d = 2; d <= mics; d++) {
        groups["[Microphone" + d + "]"] = target === "MIC";
    }
    var samplers = engine.getValue("[App]", "num_samplers");
    for (d = 1; d <= samplers; d++) {
        groups["[Sampler" + d + "]"] = target === "SP";
    }
    Object.keys(groups).forEach(function(group) {
        engine.setValue(unit, "group_" + group + "_enable", groups[group] ? 1 : 0);
    });
};

PioneerDDJFLX10Fx.startRoll = function() {
    var state = PioneerDDJFLX10Fx.beat;
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    var beats = PioneerDDJFLX10Fx.currentBeats();
    PioneerDDJFLX10Fx.stopRoll();
    state.rollDecks = PioneerDDJFLX10Fx.targetDecks();
    state.rollDecks.forEach(function(d) {
        var group = "[Channel" + d + "]";
        state.savedLoopSize[d] = engine.getValue(group, "beatloop_size");
        engine.setValue(group, "beatloop_size", beats);
        if (fx.roll === "slip") {
            engine.setValue(group, "beatlooproll_activate", 1);
        } else {
            engine.setValue(group, "beatloop_activate", 1);
        }
    });
    state.rollType = fx.roll;
};

PioneerDDJFLX10Fx.stopRoll = function() {
    var state = PioneerDDJFLX10Fx.beat;
    state.rollDecks.forEach(function(d) {
        var group = "[Channel" + d + "]";
        if (state.rollType === "slip") {
            engine.setValue(group, "beatlooproll_activate", 0);
        } else if (engine.getValue(group, "loop_enabled")) {
            engine.setValue(group, "reloop_toggle", 1);
            engine.setValue(group, "reloop_toggle", 0);
        }
        if (state.savedLoopSize[d] > 0) {
            engine.setValue(group, "beatloop_size", state.savedLoopSize[d]);
        }
    });
    state.rollDecks = [];
};

PioneerDDJFLX10Fx.setBeatFxLed = function(lit) {
    PioneerDDJFLX10Fx.beat.blinkLit = lit;
    midi.sendShortMsg(0x94, 0x47, lit ? PioneerDDJFLX10Fx.LED_ON : 0x00);
};

PioneerDDJFLX10Fx.setBeatFxOn = function(on) {
    var state = PioneerDDJFLX10Fx.beat;
    state.on = on;
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    if (fx.roll) {
        if (on) {
            PioneerDDJFLX10Fx.startRoll();
        } else {
            PioneerDDJFLX10Fx.stopRoll();
        }
    }
    PioneerDDJFLX10Fx.applyBeatFx();
    if (state.blinkTimer) {
        engine.stopTimer(state.blinkTimer);
        state.blinkTimer = 0;
    }
    PioneerDDJFLX10Fx.setBeatFxLed(on);
    if (on) {
        // The ON button flashes while the effect runs, as in rekordbox.
        state.blinkTimer = engine.beginTimer(PioneerDDJFLX10Fx.BLINK_MS, function() {
            PioneerDDJFLX10Fx.setBeatFxLed(!PioneerDDJFLX10Fx.beat.blinkLit);
        });
    }
};

// The select knob sends every position it passes; only the one it stops on
// is loaded, so turning it does not run each effect in between.
PioneerDDJFLX10Fx.SELECT_SETTLE_MS = 80;

PioneerDDJFLX10Fx.beatFxSelect = function(channel, control, value) {
    if (!value) {
        return;
    }
    var index = control - 0x20;
    if (index < 0 || index >= PioneerDDJFLX10Fx.BEAT_FX.length) {
        return;
    }
    var state = PioneerDDJFLX10Fx.beat;
    state.pendingFx = index;
    if (state.selectTimer) {
        engine.stopTimer(state.selectTimer);
    }
    state.selectTimer = engine.beginTimer(PioneerDDJFLX10Fx.SELECT_SETTLE_MS, function() {
        state.selectTimer = 0;
        PioneerDDJFLX10Fx.selectBeatFx(state.pendingFx);
    }, true);
};

PioneerDDJFLX10Fx.selectBeatFx = function(index) {
    var state = PioneerDDJFLX10Fx.beat;
    if (index === state.fx) {
        return;
    }
    if (PioneerDDJFLX10Fx.currentBeatFx().roll && state.on) {
        PioneerDDJFLX10Fx.stopRoll();
    }
    state.fx = index;
    if (PioneerDDJFLX10Fx.currentBeatFx().roll && state.on) {
        PioneerDDJFLX10Fx.startRoll();
    }
    PioneerDDJFLX10Fx.applyBeatFx(true);
    PioneerDDJFLX10Fx.logBeatFx();
};

PioneerDDJFLX10Fx.logBeatFx = function() {
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    var value = PioneerDDJFLX10Fx.currentBeats();
    var text = fx.steps === PioneerDDJFLX10Fx.REVERB_SIZES
        ? Math.round(value * 100) + " %" : value + " beats";
    console.log("DDJ-FLX10 Beat FX: " + fx.name + ", " + text +
        (PioneerDDJFLX10Fx.beat.tapBpm ? ", TAP " + Math.round(PioneerDDJFLX10Fx.beat.tapBpm) + " BPM" : ""));
};

PioneerDDJFLX10Fx.beatStep = function(direction) {
    var state = PioneerDDJFLX10Fx.beat;
    var fx = PioneerDDJFLX10Fx.currentBeatFx();
    PioneerDDJFLX10Fx.currentBeats();
    state.step[state.fx] = PioneerDDJFLX10Fx.clamp(state.step[state.fx] + direction,
        0, fx.steps.length - 1);
    if (fx.roll && state.on) {
        PioneerDDJFLX10Fx.startRoll();
    }
    PioneerDDJFLX10Fx.applyBeatFx();
    PioneerDDJFLX10Fx.logBeatFx();
};

PioneerDDJFLX10Fx.beatDown = function(channel, control, value) {
    if (value) {
        PioneerDDJFLX10Fx.beatStep(-1);
    }
};

PioneerDDJFLX10Fx.beatUp = function(channel, control, value) {
    if (value) {
        PioneerDDJFLX10Fx.beatStep(1);
    }
};

// SHIFT + BEAT <: AUTO, the effects follow the tempo of what they process.
PioneerDDJFLX10Fx.bpmAuto = function(channel, control, value) {
    if (!value) {
        return;
    }
    PioneerDDJFLX10Fx.beat.tapBpm = 0;
    PioneerDDJFLX10Fx.beat.taps = [];
    PioneerDDJFLX10Fx.applyBeatFx();
};

// SHIFT + BEAT >: TAP, the effects follow the tempo tapped on this button.
PioneerDDJFLX10Fx.bpmTap = function(channel, control, value) {
    if (!value) {
        return;
    }
    var state = PioneerDDJFLX10Fx.beat;
    var now = Date.now();
    if (state.taps.length && now - state.taps[state.taps.length - 1] > PioneerDDJFLX10Fx.TAP_TIMEOUT_MS) {
        state.taps = [];
    }
    state.taps.push(now);
    if (state.taps.length > 8) {
        state.taps.shift();
    }
    if (state.taps.length >= 2) {
        var interval = (state.taps[state.taps.length - 1] - state.taps[0]) / (state.taps.length - 1);
        state.tapBpm = 60000 / interval;
        PioneerDDJFLX10Fx.applyBeatFx();
    }
};

PioneerDDJFLX10Fx.beatFxOnOff = function(channel, control, value) {
    if (value) {
        PioneerDDJFLX10Fx.setBeatFxOn(!PioneerDDJFLX10Fx.beat.on);
    }
};

// SHIFT + BEAT FX ON: Release FX, the vinyl brake of rekordbox. The Beat FX
// stops and the decks it was set to slow down to a stop like a record.
PioneerDDJFLX10Fx.BRAKE_FACTOR = 1.0;

PioneerDDJFLX10Fx.releaseFx = function(channel, control, value) {
    if (!value) {
        return;
    }
    var decks = PioneerDDJFLX10Fx.targetDecks();
    if (PioneerDDJFLX10Fx.beat.on) {
        PioneerDDJFLX10Fx.setBeatFxOn(false);
    }
    decks.forEach(function(deck) {
        if (engine.getValue("[Channel" + deck + "]", "play")) {
            engine.brake(deck, true, PioneerDDJFLX10Fx.BRAKE_FACTOR);
        }
    });
};

PioneerDDJFLX10Fx.beatFxChannelSelect = function(channel, control, value) {
    var target = PioneerDDJFLX10Fx.TARGETS[control];
    if (!value || target === undefined) {
        return;
    }
    var state = PioneerDDJFLX10Fx.beat;
    state.target = target;
    PioneerDDJFLX10Fx.routeBeatFx();
    if (PioneerDDJFLX10Fx.currentBeatFx().roll && state.on) {
        PioneerDDJFLX10Fx.startRoll();
    }
};

PioneerDDJFLX10Fx.beatFxLevelMsb = function(channel, control, value) {
    PioneerDDJFLX10Fx.beat.levelMsb = value;
};

PioneerDDJFLX10Fx.beatFxLevelLsb = function(channel, control, value) {
    var state = PioneerDDJFLX10Fx.beat;
    state.level = (state.levelMsb * 128 + value) / 16383;
    PioneerDDJFLX10Fx.applyBeatFx();
};

// ----- Sound Color FX ---------------------------------------------------------
// Buttons 0x00-0x05 on channel 7. build(x, amount) gets the COLOR knob as
// x = -1 (left) .. 1 (right) and amount = |x|. `keepOn` effects stay switched
// on at the centre so their repeats can ring out.
PioneerDDJFLX10Fx.COLOR_FX = [
    {
        // Reverb on the low and mid range (left) or mid and high range (right).
        name: "SPACE",
        build: function(x, amount) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: amount, slots: [
                [PioneerDDJFLX10Fx.ID.reverb, {decay: 0.5 + 0.4 * amount, bandwidth: 0.8,
                    damping: 0.3, send_amount: 1}],
                [PioneerDDJFLX10Fx.ID.filter, {lpf: x < 0 ? 2500 : 22050,
                    hpf: x < 0 ? 13 : 500, q: 0.707}]]};
        },
    },
    {
        // Dub echo on the mid range (left) or high range (right). The knob
        // sets the send, so the echoes keep going when it returns to centre.
        name: "D.ECHO", keepOn: true,
        build: function(x, amount) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.delay, {time: 3 / 4, feedback: 0.6, taps: 1,
                    low_cut: x < 0 ? 250 : 1500, high_cut: x < 0 ? 3000 : 20000,
                    send: amount, glide: 0}]]};
        },
    },
    {
        // Bit crushing, with a rising high-pass filter on the right.
        name: "CRUSH",
        build: function(x, amount) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.bitcrusher, {bit_depth: 16 - 12 * amount,
                    downsample: 1 - 0.85 * amount}],
                [PioneerDDJFLX10Fx.ID.filter, {lpf: 22050,
                    hpf: x > 0 ? PioneerDDJFLX10Fx.sweep(13, 2500, amount) : 13, q: 0.707}]]};
        },
    },
    {
        name: "PITCH",
        build: function(x) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.pitch, {pitch: x, range: 1, semitonesMode: 0,
                    formantPreserving: 0}]]};
        },
    },
    {
        // White noise through a filter that closes (left) or opens (right).
        name: "NOISE",
        build: function(x, amount) {
            return {mode: PioneerDDJFLX10Fx.DRY_PLUS_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.noise, {filter: x, level: amount}]]};
        },
    },
    {
        name: "FILTER",
        build: function(x, amount) {
            return {mode: PioneerDDJFLX10Fx.DRY_SLASH_WET, mix: 1, slots: [
                [PioneerDDJFLX10Fx.ID.filter, {
                    lpf: x < 0 ? PioneerDDJFLX10Fx.sweep(22050, 80, amount) : 22050,
                    hpf: x > 0 ? PioneerDDJFLX10Fx.sweep(13, 9000, amount) : 13,
                    q: 0.707 + 0.8 * amount}]]};
        },
    },
];

// Stock quick effect preset indexes for stock Mixxx: Reverb, Echo,
// Bitcrusher, Pitch Shift, White Noise, Filter.
PioneerDDJFLX10Fx.COLOR_FX_PRESETS = [18, 10, 8, 17, 20, 11];
PioneerDDJFLX10Fx.COLOR_FX_DEADZONE = 0.01;

PioneerDDJFLX10Fx.color = {
    active: -1,
    knob: {1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5},
    knobMsb: {1: 64, 2: 64, 3: 64, 4: 64},
    loadedIds: {},
};

PioneerDDJFLX10Fx.colorRack = function(group) {
    return "[QuickEffectRack1_" + group + "]";
};

// The racks a deck's COLOR knob drives: the selected stems (FX PART SELECT)
// or the whole deck. Every other rack of the deck gets the centre position.
PioneerDDJFLX10Fx.colorTargets = function(deck) {
    var group = "[Channel" + deck + "]";
    var position = PioneerDDJFLX10Fx.color.knob[deck];
    var selected = PioneerDDJFLX10Fx.partStems(deck);
    var targets = {};
    var useStems = selected !== null;
    targets[PioneerDDJFLX10Fx.colorRack(group)] = useStems ? 0.5 : position;
    if (PioneerDDJFLX10._hasStems(deck)) {
        for (var stem = 1; stem <= 4; stem++) {
            targets[PioneerDDJFLX10Fx.colorRack(PioneerDDJFLX10._stemGroup(deck, stem))] =
                useStems && selected.indexOf(stem) >= 0 ? position : 0.5;
        }
    }
    return targets;
};

PioneerDDJFLX10Fx.applyColorRack = function(rack, position) {
    var color = PioneerDDJFLX10Fx.color;
    if (!color.loadedIds[rack]) {
        color.loadedIds[rack] = [];
    }
    var ids = color.loadedIds[rack];
    if (color.active < 0) {
        // Only switch off what a Sound Color FX loaded; a quick effect the
        // user chose in Mixxx stays as it is.
        for (var n = 1; n <= PioneerDDJFLX10Fx.slotCount(rack); n++) {
            if (ids[n]) {
                engine.setValue(PioneerDDJFLX10Fx.slotGroup(rack, n), "enabled", 0);
            }
        }
        return;
    }
    if (!PioneerDDJFLX10Fx.available()) {
        engine.setValue(rack, "super1", position);
        return;
    }
    var fx = PioneerDDJFLX10Fx.COLOR_FX[color.active];
    var x = PioneerDDJFLX10Fx.clamp((position - 0.5) * 2, -1, 1);
    var amount = Math.abs(x);
    var on = fx.keepOn || amount > PioneerDDJFLX10Fx.COLOR_FX_DEADZONE;
    PioneerDDJFLX10Fx.loadChain(rack, fx.build(x, amount), ids, on);
    engine.setValue(rack, "enabled", 1);
};

PioneerDDJFLX10Fx.applyColorDeck = function(deck) {
    var targets = PioneerDDJFLX10Fx.colorTargets(deck);
    Object.keys(targets).forEach(function(rack) {
        PioneerDDJFLX10Fx.applyColorRack(rack, targets[rack]);
    });
};

PioneerDDJFLX10Fx.applyColorAll = function() {
    for (var d = 1; d <= 4; d++) {
        PioneerDDJFLX10Fx.applyColorDeck(d);
    }
};

PioneerDDJFLX10Fx.loadColorPresets = function(preset) {
    for (var d = 1; d <= 4; d++) {
        var targets = PioneerDDJFLX10Fx.colorTargets(d);
        Object.keys(targets).forEach(function(rack) {
            engine.setValue(rack, "loaded_chain_preset", preset);
        });
    }
};

// One Sound Color FX for all decks. Radio-style latching buttons: switching
// A to B sends A's note off and then B's note on, so a note off only cancels
// the effect while it is still the active one.
PioneerDDJFLX10Fx.soundColorFx = function(channel, control, value, status) {
    var color = PioneerDDJFLX10Fx.color;
    var index = control & 0x07;
    if (index >= PioneerDDJFLX10Fx.COLOR_FX.length) {
        return;
    }
    var on = ((status & 0xF0) === 0x90) && value > 0;
    if (on) {
        color.active = index;
    } else if (color.active === index) {
        color.active = -1;
    } else {
        return;
    }
    if (!PioneerDDJFLX10Fx.available()) {
        PioneerDDJFLX10Fx.loadColorPresets(on ? PioneerDDJFLX10Fx.COLOR_FX_PRESETS[index] : 0);
        // Loading a preset resets super1; put back where each knob is.
        engine.beginTimer(50, PioneerDDJFLX10Fx.applyColorAll, true);
        return;
    }
    PioneerDDJFLX10Fx.applyColorAll();
};

PioneerDDJFLX10Fx.colorKnobMsb = function(channel, control, value, status, group) {
    PioneerDDJFLX10Fx.color.knobMsb[script.deckFromGroup(group)] = value;
};

// The COLOR knob is absolute, as in rekordbox: the effect always follows the
// physical position, also right after another Sound Color FX is chosen.
PioneerDDJFLX10Fx.colorKnobLsb = function(channel, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    var color = PioneerDDJFLX10Fx.color;
    color.knob[deck] = (color.knobMsb[deck] * 128 + value) / 16383;
    PioneerDDJFLX10Fx.applyColorDeck(deck);
};

PioneerDDJFLX10Fx.init = function() {
    if (!PioneerDDJFLX10Fx.available()) {
        console.warn("DDJ-FLX10: engine.loadEffect() missing, Beat FX limited to the " +
            "chain in effect unit 1 and Sound Color FX to the stock quick effects");
    }
    PioneerDDJFLX10Fx.routeBeatFx();
    PioneerDDJFLX10Fx.applyBeatFx();
    PioneerDDJFLX10Fx.setBeatFxLed(false);
    PioneerDDJFLX10Fx.applyColorAll();
    // A stem track loading or leaving changes where FX PART SELECT sends the FX.
    for (var d = 1; d <= 4; d++) {
        engine.makeConnection("[Channel" + d + "]", "stem_count", function() {
            PioneerDDJFLX10Fx.routeBeatFx();
            PioneerDDJFLX10Fx.applyColorAll();
        });
    }
};

PioneerDDJFLX10Fx.shutdown = function() {
    var state = PioneerDDJFLX10Fx.beat;
    if (state.on) {
        PioneerDDJFLX10Fx.setBeatFxOn(false);
    }
    PioneerDDJFLX10Fx.setBeatFxLed(false);
};
