#pragma once

#include <QMap>

#include "effects/backends/builtin/beatfxdsp.h"
#include "effects/backends/effectprocessor.h"
#include "util/class.h"

class BarberpoleFlangerGroupState : public EffectState {
  public:
    BarberpoleFlangerGroupState(const mixxx::EngineParameters& engineParameters)
            : EffectState(engineParameters) {
        // Longest sweep delay plus interpolation headroom.
        ring.allocate(static_cast<SINT>(0.02 * engineParameters.sampleRate()));
        clear();
    }
    ~BarberpoleFlangerGroupState() override = default;

    void clear() {
        ring.clear();
        phase = 0;
        prevDepth = 0;
        beatClock.reset();
    }

    mixxx::beatfx::StereoRing ring;
    double phase;
    CSAMPLE_GAIN prevDepth;
    mixxx::beatfx::BeatClock beatClock;
};

/// Flanger whose notches keep rising or falling: two delay taps sweep the
/// same way half a period apart and crossfade, so the sweep never turns back.
class BarberpoleFlangerEffect : public EffectProcessorImpl<BarberpoleFlangerGroupState> {
  public:
    BarberpoleFlangerEffect() = default;
    ~BarberpoleFlangerEffect() override = default;

    static QString getId();
    static EffectManifestPointer getManifest();

    void loadEngineEffectParameters(
            const QMap<QString, EngineEffectParameterPointer>& parameters) override;

    void processChannel(
            BarberpoleFlangerGroupState* pState,
            const CSAMPLE* pInput,
            CSAMPLE* pOutput,
            const mixxx::EngineParameters& engineParameters,
            const EffectEnableState enableState,
            const GroupFeatureState& groupFeatures) override;

  private:
    QString debugString() const {
        return getId();
    }

    EngineEffectParameterPointer m_pPeriodParameter;
    EngineEffectParameterPointer m_pDepthParameter;
    EngineEffectParameterPointer m_pRegenParameter;
    EngineEffectParameterPointer m_pFallingParameter;

    DISALLOW_COPY_AND_ASSIGN(BarberpoleFlangerEffect);
};
