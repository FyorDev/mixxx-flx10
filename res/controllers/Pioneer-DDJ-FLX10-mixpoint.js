// Mix Point Link for the Pioneer DDJ-FLX10, following the rekordbox behaviour
// in the DDJ-FLX10 Operating Instructions ("Using Mix Point Link"):
//
//   On the deck with the next track (B): call up the cue or hot cue where B
//   should come in, pick the point on the playing track (A) where the mix
//   happens with MIX POINT SELECT < / >, then press MIX POINT LINK. B starts
//   by itself so that it reaches its point exactly when A reaches its point.
//   SHIFT + MIX POINT LINK: B stays silent until its mix point (Silent).
//   SHIFT + MIX POINT SELECT <: cancel. SHIFT + MIX POINT SELECT >: choose
//   another deck as A. If A jumps before its point the link is cancelled and
//   MIX POINT LINK flashes; pressing it again relinks.
//
// Under Serato the same button is Key Lock; the "mixPointLinkButton" setting
// chooses between the two.

// eslint-disable-next-line no-var
var PioneerDDJFLX10MixPoint = {};

PioneerDDJFLX10MixPoint.LINK_NOTE = 0x4A;
PioneerDDJFLX10MixPoint.TICK_MS = 20;
PioneerDDJFLX10MixPoint.BLINK_MS = 300;
// A jump of A's playhead larger than this (seconds) cancels the link.
PioneerDDJFLX10MixPoint.JUMP_SECONDS = 0.75;

PioneerDDJFLX10MixPoint.state = {};
PioneerDDJFLX10MixPoint.timer = 0;
PioneerDDJFLX10MixPoint.blinkAt = 0;
PioneerDDJFLX10MixPoint.blinkOn = false;

PioneerDDJFLX10MixPoint.group = function(deck) {
    return "[Channel" + deck + "]";
};

PioneerDDJFLX10MixPoint.deckOf = function(group) {
    return script.deckFromGroup(group);
};

PioneerDDJFLX10MixPoint.keylockMode = function() {
    return engine.getSetting("mixPointLinkButton") === "keylock";
};

PioneerDDJFLX10MixPoint.seconds = function(group, samples) {
    var rate = engine.getValue(group, "track_samplerate") || 44100;
    return samples / (rate * 2);
};

PioneerDDJFLX10MixPoint.position = function(group) {
    return engine.getValue(group, "playposition") * engine.getValue(group, "track_samples");
};

// Cue point and hot cues of a deck, sorted, in samples.
PioneerDDJFLX10MixPoint.points = function(group) {
    var points = [];
    var cue = engine.getValue(group, "cue_point");
    if (cue >= 0) {
        points.push(cue);
    }
    for (var i = 1; i <= 36; i++) {
        var p = engine.getValue(group, "hotcue_" + i + "_position");
        if (p >= 0 && points.indexOf(p) < 0) {
            points.push(p);
        }
    }
    return points.sort(function(a, b) { return a - b; });
};

PioneerDDJFLX10MixPoint.newState = function() {
    return {target: 0, outPoint: -1, inPoint: -1, linked: false, broken: false,
        silent: false, started: false, lastTargetPos: -1, savedPregain: null};
};

PioneerDDJFLX10MixPoint.get = function(deck) {
    if (!PioneerDDJFLX10MixPoint.state[deck]) {
        PioneerDDJFLX10MixPoint.state[deck] = PioneerDDJFLX10MixPoint.newState();
    }
    return PioneerDDJFLX10MixPoint.state[deck];
};

// The deck to mix from: the playing deck other than this one, preferring the
// sync leader.
PioneerDDJFLX10MixPoint.defaultTarget = function(deck) {
    var best = 0;
    for (var d = 1; d <= 4; d++) {
        if (d === deck || !engine.getValue(PioneerDDJFLX10MixPoint.group(d), "track_loaded")) {
            continue;
        }
        var playing = engine.getValue(PioneerDDJFLX10MixPoint.group(d), "play") > 0;
        var leader = engine.getValue(PioneerDDJFLX10MixPoint.group(d), "sync_leader") > 0;
        if (!best || (playing && leader)) {
            best = d;
        } else if (playing && !engine.getValue(PioneerDDJFLX10MixPoint.group(best), "play")) {
            best = d;
        }
    }
    return best;
};

PioneerDDJFLX10MixPoint.setLed = function(deck, on) {
    midi.sendShortMsg(0x90 + deck - 1, PioneerDDJFLX10MixPoint.LINK_NOTE, on ? 0x7F : 0x00);
};

PioneerDDJFLX10MixPoint.restoreSound = function(deck) {
    var state = PioneerDDJFLX10MixPoint.get(deck);
    if (state.savedPregain !== null) {
        engine.setValue(PioneerDDJFLX10MixPoint.group(deck), "pregain", state.savedPregain);
        state.savedPregain = null;
    }
};

PioneerDDJFLX10MixPoint.cancel = function(deck) {
    PioneerDDJFLX10MixPoint.restoreSound(deck);
    PioneerDDJFLX10MixPoint.state[deck] = PioneerDDJFLX10MixPoint.newState();
    PioneerDDJFLX10MixPoint.setLed(deck, false);
};

PioneerDDJFLX10MixPoint.select = function(direction) {
    return function(channel, control, value, status, group) {
        if (!value || PioneerDDJFLX10MixPoint.keylockMode()) {
            return;
        }
        var deck = PioneerDDJFLX10MixPoint.deckOf(group);
        var state = PioneerDDJFLX10MixPoint.get(deck);
        if (!state.target) {
            state.target = PioneerDDJFLX10MixPoint.defaultTarget(deck);
        }
        if (!state.target) {
            return;
        }
        var targetGroup = PioneerDDJFLX10MixPoint.group(state.target);
        var points = PioneerDDJFLX10MixPoint.points(targetGroup);
        if (!points.length) {
            return;
        }
        var index = points.indexOf(state.outPoint);
        if (index < 0) {
            var here = PioneerDDJFLX10MixPoint.position(targetGroup);
            index = direction > 0 ? -1 : points.length;
            for (var i = 0; i < points.length; i++) {
                if (points[i] > here) {
                    index = direction > 0 ? i - 1 : i;
                    break;
                }
            }
        }
        index = Math.max(0, Math.min(points.length - 1, index + direction));
        state.outPoint = points[index];
        state.linked = false;
        state.broken = false;
    };
};

PioneerDDJFLX10MixPoint.selectBack = PioneerDDJFLX10MixPoint.select(-1);
PioneerDDJFLX10MixPoint.selectForward = PioneerDDJFLX10MixPoint.select(1);

PioneerDDJFLX10MixPoint.cancelButton = function(channel, control, value, status, group) {
    if (value && !PioneerDDJFLX10MixPoint.keylockMode()) {
        PioneerDDJFLX10MixPoint.cancel(PioneerDDJFLX10MixPoint.deckOf(group));
    }
};

PioneerDDJFLX10MixPoint.nextTarget = function(channel, control, value, status, group) {
    if (!value || PioneerDDJFLX10MixPoint.keylockMode()) {
        return;
    }
    var deck = PioneerDDJFLX10MixPoint.deckOf(group);
    var state = PioneerDDJFLX10MixPoint.get(deck);
    for (var step = 1; step <= 4; step++) {
        var d = ((state.target || deck) - 1 + step) % 4 + 1;
        if (d !== deck && engine.getValue(PioneerDDJFLX10MixPoint.group(d), "track_loaded")) {
            state.target = d;
            state.outPoint = -1;
            state.linked = false;
            return;
        }
    }
};

PioneerDDJFLX10MixPoint.link = function(channel, control, value, status, group) {
    if (PioneerDDJFLX10MixPoint.keylockMode()) {
        if (value) {
            engine.setValue(group, "keylock", engine.getValue(group, "keylock") ? 0 : 1);
        }
        return;
    }
    if (!value) {
        return;
    }
    var deck = PioneerDDJFLX10MixPoint.deckOf(group);
    var state = PioneerDDJFLX10MixPoint.get(deck);
    if (state.linked) {
        PioneerDDJFLX10MixPoint.cancel(deck);
        return;
    }
    if (!state.target || state.outPoint < 0) {
        return;
    }
    if (!state.broken) {
        state.inPoint = PioneerDDJFLX10MixPoint.position(group);
    }
    state.linked = true;
    state.broken = false;
    state.started = false;
    state.lastTargetPos = -1;
    PioneerDDJFLX10MixPoint.setLed(deck, true);
};

PioneerDDJFLX10MixPoint.silent = function(channel, control, value, status, group) {
    if (!value || PioneerDDJFLX10MixPoint.keylockMode()) {
        return;
    }
    var state = PioneerDDJFLX10MixPoint.get(PioneerDDJFLX10MixPoint.deckOf(group));
    state.silent = !state.silent;
};

PioneerDDJFLX10MixPoint.tickDeck = function(deck, now) {
    var state = PioneerDDJFLX10MixPoint.state[deck];
    if (!state || (!state.linked && !state.broken)) {
        return;
    }
    var group = PioneerDDJFLX10MixPoint.group(deck);
    if (state.broken) {
        PioneerDDJFLX10MixPoint.setLed(deck, PioneerDDJFLX10MixPoint.blinkOn);
        return;
    }
    var targetGroup = PioneerDDJFLX10MixPoint.group(state.target);
    var targetPos = PioneerDDJFLX10MixPoint.position(targetGroup);
    var targetRate = engine.getValue(targetGroup, "rate_ratio") || 1;
    var dt = PioneerDDJFLX10MixPoint.TICK_MS / 1000;
    if (state.lastTargetPos >= 0) {
        var moved = PioneerDDJFLX10MixPoint.seconds(targetGroup, targetPos - state.lastTargetPos);
        if (moved < -0.05 || moved > PioneerDDJFLX10MixPoint.JUMP_SECONDS + dt * 4) {
            if (!state.started) {
                state.linked = false;
                state.broken = true;
                return;
            }
        }
    }
    state.lastTargetPos = targetPos;
    if (state.started) {
        if (state.savedPregain !== null && PioneerDDJFLX10MixPoint.position(group) >= state.inPoint) {
            PioneerDDJFLX10MixPoint.restoreSound(deck);
        }
        if (state.savedPregain === null) {
            PioneerDDJFLX10MixPoint.cancel(deck);
        }
        return;
    }
    if (!engine.getValue(targetGroup, "play")) {
        return;
    }
    var toOut = PioneerDDJFLX10MixPoint.seconds(targetGroup, state.outPoint - targetPos) / targetRate;
    var rate = engine.getValue(group, "rate_ratio") || 1;
    var leadIn = PioneerDDJFLX10MixPoint.seconds(group, state.inPoint) / rate;
    if (toOut <= leadIn) {
        // Start late by the time already passed, so B meets its point on time.
        var startAt = Math.max(0, (leadIn - toOut) * rate);
        var samples = engine.getValue(group, "track_samples");
        if (samples > 0) {
            var rateHz = engine.getValue(group, "track_samplerate") || 44100;
            engine.setValue(group, "playposition", Math.min(1, startAt * rateHz * 2 / samples));
        }
        if (state.silent && startAt * (engine.getValue(group, "track_samplerate") || 44100) * 2 < state.inPoint) {
            state.savedPregain = engine.getValue(group, "pregain");
            engine.setValue(group, "pregain", 0);
        }
        engine.setValue(group, "play", 1);
        state.started = true;
    }
};

PioneerDDJFLX10MixPoint.tick = function() {
    var now = Date.now();
    if (now - PioneerDDJFLX10MixPoint.blinkAt >= PioneerDDJFLX10MixPoint.BLINK_MS) {
        PioneerDDJFLX10MixPoint.blinkAt = now;
        PioneerDDJFLX10MixPoint.blinkOn = !PioneerDDJFLX10MixPoint.blinkOn;
    }
    for (var deck = 1; deck <= 4; deck++) {
        PioneerDDJFLX10MixPoint.tickDeck(deck, now);
    }
};

PioneerDDJFLX10MixPoint.onLoad = function(value, group) {
    PioneerDDJFLX10MixPoint.cancel(PioneerDDJFLX10MixPoint.deckOf(group));
};

PioneerDDJFLX10MixPoint.init = function() {
    if (PioneerDDJFLX10MixPoint.keylockMode()) {
        for (var d = 1; d <= 4; d++) {
            engine.makeConnection(PioneerDDJFLX10MixPoint.group(d), "keylock", function(value, group) {
                PioneerDDJFLX10MixPoint.setLed(PioneerDDJFLX10MixPoint.deckOf(group), value > 0);
            }).trigger();
        }
        return;
    }
    for (var deck = 1; deck <= 4; deck++) {
        engine.makeConnection(PioneerDDJFLX10MixPoint.group(deck), "track_loaded", PioneerDDJFLX10MixPoint.onLoad);
        PioneerDDJFLX10MixPoint.setLed(deck, false);
    }
    PioneerDDJFLX10MixPoint.timer = engine.beginTimer(PioneerDDJFLX10MixPoint.TICK_MS, PioneerDDJFLX10MixPoint.tick);
};

PioneerDDJFLX10MixPoint.shutdown = function() {
    if (PioneerDDJFLX10MixPoint.timer) {
        engine.stopTimer(PioneerDDJFLX10MixPoint.timer);
        PioneerDDJFLX10MixPoint.timer = 0;
    }
    for (var deck = 1; deck <= 4; deck++) {
        PioneerDDJFLX10MixPoint.restoreSound(deck);
        PioneerDDJFLX10MixPoint.setLed(deck, false);
    }
};
