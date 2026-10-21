// rekordbox behaviours of the DDJ-FLX10 that the Operating Instructions
// describe and that are not in the other script files: Fader Start, Part ISO,
// Part Instant Doubles, ACTIVE PART solo mode, LOAD (and Instant Doubles),
// VIEW hold, sampler volume and cue, BEAT < / >, Release FX, SHIFT + BEAT SYNC
// and the analogue level knobs. Fader start, sampler cue/volume and the
// headphone mix setting follow the DDJ-1000 mapping (mixxxdj/mixxx#17174).

// eslint-disable-next-line no-var
var PioneerDDJFLX10Extras = {};

PioneerDDJFLX10Extras.DOUBLE_PRESS_MS = 400;
PioneerDDJFLX10Extras.TRACKS_TABLE = 3;

PioneerDDJFLX10Extras.group = function(deck) {
    return "[Channel" + deck + "]";
};

PioneerDDJFLX10Extras.setting = function(name, fallback) {
    var value = engine.getSetting(name);
    return value === undefined || value === null || value === "" ? fallback : value;
};

PioneerDDJFLX10Extras.samplers = function() {
    var groups = [];
    var n = engine.getValue("[App]", "num_samplers");
    for (var i = 1; i <= n; i++) {
        groups.push("[Sampler" + i + "]");
    }
    return groups;
};

PioneerDDJFLX10Extras.otherPlayingDeck = function(deck) {
    var fallback = 0;
    for (var d = 1; d <= 4; d++) {
        if (d === deck || !engine.getValue(PioneerDDJFLX10Extras.group(d), "track_loaded")) {
            continue;
        }
        if (engine.getValue(PioneerDDJFLX10Extras.group(d), "play")) {
            return d;
        }
        fallback = fallback || d;
    }
    return fallback;
};

// ----- analogue knobs ------------------------------------------------------
// MASTER LEVEL, HEADPHONES LEVEL and HEADPHONES MIX also act in the unit's
// own analogue mixer; the unit blends main (outputs 1-2) and cue (3-4) in the
// headphones itself. Applying them in Mixxx as well would apply them twice,
// so by default Mixxx's headphone mix is set to cue only and the knobs are
// ignored. The "hardwareLevels" setting turns this off.
PioneerDDJFLX10Extras.savedHeadMix = null;
PioneerDDJFLX10Extras.levelMsb = {};

PioneerDDJFLX10Extras.hardwareLevels = function() {
    var v = engine.getSetting("hardwareLevels");
    return v !== false && v !== "false";
};

PioneerDDJFLX10Extras.levelKnob = function(key) {
    return function(channel, control, value) {
        if (PioneerDDJFLX10Extras.hardwareLevels()) {
            return;
        }
        if (control < 0x20) {
            PioneerDDJFLX10Extras.levelMsb[key] = value;
            return;
        }
        var v14 = ((PioneerDDJFLX10Extras.levelMsb[key] || 0) << 7) | value;
        engine.setParameter("[Master]", key, v14 / 16383);
    };
};

PioneerDDJFLX10Extras.masterLevel = PioneerDDJFLX10Extras.levelKnob("gain");
PioneerDDJFLX10Extras.headphoneLevel = PioneerDDJFLX10Extras.levelKnob("headGain");
PioneerDDJFLX10Extras.headphoneMix = PioneerDDJFLX10Extras.levelKnob("headMix");

// ----- fader start (only sent when Fader Start is on in the unit settings) --
PioneerDDJFLX10Extras.faderStartPlay = function(channel, control, value, status, group) {
    if (value && !engine.getValue(group, "play")) {
        engine.setValue(group, "play", 1);
    }
};

PioneerDDJFLX10Extras.faderStartSync = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "sync_enabled", 1);
        PioneerDDJFLX10Extras.faderStartPlay(channel, control, value, status, group);
    }
};

PioneerDDJFLX10Extras.faderStartCue = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "cue_gotoandstop", 1);
    }
};

// ----- sampler section -------------------------------------------------------
PioneerDDJFLX10Extras.samplerMsb = 0;

PioneerDDJFLX10Extras.samplerVolume = function(channel, control, value) {
    if (control === 0x03) {
        PioneerDDJFLX10Extras.samplerMsb = value;
        return;
    }
    var level = ((PioneerDDJFLX10Extras.samplerMsb << 7) | value) / 16383;
    PioneerDDJFLX10Extras.samplers().forEach(function(group) {
        engine.setParameter(group, "volume", level);
    });
};

PioneerDDJFLX10Extras.samplerCue = function(channel, control, value) {
    if (!value) {
        return;
    }
    var on = engine.getValue("[Sampler1]", "pfl") ? 0 : 1;
    PioneerDDJFLX10Extras.samplers().forEach(function(group) {
        engine.setValue(group, "pfl", on);
    });
    midi.sendShortMsg(0x96, 0x69, on ? 0x7F : 0x00);
};

// ----- sync ----------------------------------------------------------------
// SHIFT + BEAT SYNC: set this deck as master. Writing 1 requests explicit
// leader; 2 means it already is.
PioneerDDJFLX10Extras.syncMaster = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    var leader = engine.getValue(group, "sync_leader") === 2;
    engine.setValue(group, "sync_leader", leader ? 0 : 1);
};

// ----- browser -----------------------------------------------------------------
// Rotary selector press: load the track onto the deck, or open the selected
// sidebar item. Press twice: Instant Doubles.
PioneerDDJFLX10Extras.lastLoad = {};

PioneerDDJFLX10Extras.load = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    var deck = script.deckFromGroup(group);
    var now = Date.now();
    var last = PioneerDDJFLX10Extras.lastLoad[deck] || 0;
    PioneerDDJFLX10Extras.lastLoad[deck] = now;
    if (now - last < PioneerDDJFLX10Extras.DOUBLE_PRESS_MS) {
        engine.setValue(group, "CloneFromDeck", 0);
        return;
    }
    if (engine.getValue("[Library]", "focused_widget") === PioneerDDJFLX10Extras.TRACKS_TABLE) {
        engine.setValue(group, "LoadSelectedTrack", 1);
    } else {
        engine.setValue("[Library]", "GoToItem", 1);
    }
};

// VIEW hold: rekordbox adds the track to its Tag List; the nearest Mixxx
// equivalent is the Auto DJ queue.
PioneerDDJFLX10Extras.viewHold = function(channel, control, value) {
    if (value) {
        engine.setValue("[Library]", "AutoDjAddBottom", 1);
    }
};

// ----- Beat FX ---------------------------------------------------------------
// BEAT < / >: halve / double the beat length of the Beat FX (parameter 1 of
// each effect, the time or rate parameter for the beat-synced effects).
PioneerDDJFLX10Extras.beatStep = function(direction) {
    return function(channel, control, value) {
        if (!value) {
            return;
        }
        for (var slot = 1; slot <= 3; slot++) {
            var g = "[EffectRack1_EffectUnit1_Effect" + slot + "]";
            if (!engine.getValue(g, "loaded")) {
                continue;
            }
            var p = engine.getParameter(g, "parameter1");
            engine.setParameter(g, "parameter1", Math.max(0, Math.min(1, p + direction / 16)));
        }
    };
};

PioneerDDJFLX10Extras.beatDown = PioneerDDJFLX10Extras.beatStep(-1);
PioneerDDJFLX10Extras.beatUp = PioneerDDJFLX10Extras.beatStep(1);

// SHIFT + BEAT FX ON/OFF (Release FX): switch the Beat FX off at once and let
// the deck tails ring out through Mixxx's effect fade-out.
PioneerDDJFLX10Extras.releaseFx = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    if (PioneerDDJFLX10._beatFxActive) {
        PioneerDDJFLX10.beatFxOnOff(channel, 0x47, 0x7F, 0x94, group);
    }
    for (var slot = 1; slot <= 3; slot++) {
        engine.setValue("[EffectRack1_EffectUnit1_Effect" + slot + "]", "enabled", 0);
    }
};

// ----- STEMS -----------------------------------------------------------------
// ACTIVE PART buttons: Mute (default) or Solo, as the rekordbox preference.
PioneerDDJFLX10Extras.activePartSolo = function() {
    return PioneerDDJFLX10Extras.setting("activePartMode", "mute") === "solo";
};

PioneerDDJFLX10Extras.activePart = function(channel, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    if (!PioneerDDJFLX10Extras.activePartSolo() || !PioneerDDJFLX10._hasStems(deck)) {
        PioneerDDJFLX10.activePart(channel, control, value, status, group);
        return;
    }
    if (!value) {
        return;
    }
    var notes = PioneerDDJFLX10._PART_NOTES;
    var soloed = true;
    for (var i = 0; i < notes.length; i++) {
        if (PioneerDDJFLX10._partMuted(deck, notes[i]) !== (notes[i] !== control)) {
            soloed = false;
        }
    }
    for (var j = 0; j < notes.length; j++) {
        PioneerDDJFLX10._setPartMuted(deck, notes[j], soloed ? false : notes[j] !== control);
    }
};

// SHIFT + ACTIVE PART pressed twice (channel 7 notes 0x24-0x2F, one per deck
// and part): Part Instant Doubles. The pressed deck gets the other deck's
// track at the same position playing only that part; the other deck mutes it.
PioneerDDJFLX10Extras.PART_BY_BASE = {0x24: 0x0D, 0x28: 0x0E, 0x2C: 0x0F};

PioneerDDJFLX10Extras.partInstantDoubles = function(channel, control, value) {
    if (!value) {
        return;
    }
    var part = PioneerDDJFLX10Extras.PART_BY_BASE[control & 0xFC];
    var deck = (control & 0x03) + 1;
    var source = PioneerDDJFLX10Extras.otherPlayingDeck(deck);
    if (part === undefined || !source || !PioneerDDJFLX10._hasStems(source)) {
        return;
    }
    var group = PioneerDDJFLX10Extras.group(deck);
    engine.setValue(group, "CloneFromDeck", source);
    var tries = 0;
    var timer = engine.beginTimer(50, function() {
        tries++;
        if (PioneerDDJFLX10._hasStems(deck) || tries > 60) {
            engine.stopTimer(timer);
            if (!PioneerDDJFLX10._hasStems(deck)) {
                return;
            }
            var notes = PioneerDDJFLX10._PART_NOTES;
            for (var i = 0; i < notes.length; i++) {
                PioneerDDJFLX10._setPartMuted(deck, notes[i], notes[i] !== part);
            }
            PioneerDDJFLX10._setPartMuted(source, part, true);
        }
    });
};

// SHIFT + headphones CUE: switch the deck's EQ knobs between EQ and Part ISO.
// In Part ISO mode HI sets the INST part volume, MID the vocal, LOW the drums
// (the rekordbox layout); the knob's centre is full volume.
PioneerDDJFLX10Extras.partIso = {1: false, 2: false, 3: false, 4: false};
PioneerDDJFLX10Extras.eqMsb = {};
PioneerDDJFLX10Extras.EQ_BANDS = {
    0x07: {param: "parameter3", part: 0x0F},
    0x0B: {param: "parameter2", part: 0x0E},
    0x0F: {param: "parameter1", part: 0x0D},
};

PioneerDDJFLX10Extras.togglePartIso = function(channel, control, value, status, group) {
    if (!value) {
        return;
    }
    var deck = script.deckFromGroup(group);
    PioneerDDJFLX10Extras.partIso[deck] = !PioneerDDJFLX10Extras.partIso[deck];
    if (!PioneerDDJFLX10Extras.partIso[deck] && PioneerDDJFLX10._hasStems(deck)) {
        for (var stem = 1; stem <= 4; stem++) {
            engine.setValue(PioneerDDJFLX10._stemGroup(deck, stem), "volume", 1);
        }
    }
};

PioneerDDJFLX10Extras.eqKnob = function(channel, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    var msbControl = control >= 0x20 ? control - 0x20 : control;
    var band = PioneerDDJFLX10Extras.EQ_BANDS[msbControl];
    if (!band) {
        return;
    }
    var key = deck + ":" + msbControl;
    if (control < 0x20) {
        PioneerDDJFLX10Extras.eqMsb[key] = value;
        return;
    }
    var position = (((PioneerDDJFLX10Extras.eqMsb[key] || 0) << 7) | value) / 16383;
    if (PioneerDDJFLX10Extras.partIso[deck] && PioneerDDJFLX10._hasStems(deck)) {
        var volume = Math.min(1, position * 2);
        PioneerDDJFLX10._PART_STEMS[band.part].forEach(function(stem) {
            engine.setValue(PioneerDDJFLX10._stemGroup(deck, stem), "volume", volume);
        });
        return;
    }
    engine.setParameter("[EqualizerRack1_" + group + "_Effect1]", band.param, position);
};

PioneerDDJFLX10Extras.init = function() {
    if (PioneerDDJFLX10Extras.hardwareLevels()) {
        PioneerDDJFLX10Extras.savedHeadMix = engine.getValue("[Master]", "headMix");
        engine.setValue("[Master]", "headMix", -1);
    }
};

PioneerDDJFLX10Extras.shutdown = function() {
    if (PioneerDDJFLX10Extras.savedHeadMix !== null &&
            engine.getValue("[Master]", "headMix") === -1) {
        engine.setValue("[Master]", "headMix", PioneerDDJFLX10Extras.savedHeadMix);
    }
};
