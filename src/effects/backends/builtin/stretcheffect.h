#pragma once

#include <QMap>

#include "effects/backends/builtin/beatfxdsp.h"
#include "effects/backends/effectprocessor.h"
#include "util/class.h"

class StretchGroupState : public EffectState {
  public:
    static constexpr int kMaxSeconds = 8;

    struct Grain {
        double start;
        SINT offset;
    };

    StretchGroupState(const mixxx::EngineParameters& engineParameters)
            : EffectState(engineParameters) {
        ring.allocate(kMaxSeconds * engineParameters.sampleRate());
        grainFrames = std::max<SINT>(64,
                static_cast<SINT>(0.04 * engineParameters.sampleRate()));
        clear();
    }
    ~StretchGroupState() override = default;

    void clear() {
        ring.clear();
        started = false;
        readPosition = 0;
        framesSinceTrigger = 0;
    }

    mixxx::beatfx::StereoRing ring;
    SINT grainFrames;
    bool started;
    double readPosition;
    int64_t framesSinceTrigger;
    Grain grains[2];
};

/// Records the input from the moment it is switched on and plays it back
/// slowed down by the stretch factor without changing the pitch (two
/// overlapping grains). Starts over every retrigger period.
class StretchEffect : public EffectProcessorImpl<StretchGroupState> {
  public:
    StretchEffect() = default;
    ~StretchEffect() override = default;

    static QString getId();
    static EffectManifestPointer getManifest();

    void loadEngineEffectParameters(
            const QMap<QString, EngineEffectParameterPointer>& parameters) override;

    void processChannel(
            StretchGroupState* pState,
            const CSAMPLE* pInput,
            CSAMPLE* pOutput,
            const mixxx::EngineParameters& engineParameters,
            const EffectEnableState enableState,
            const GroupFeatureState& groupFeatures) override;

  private:
    QString debugString() const {
        return getId();
    }

    EngineEffectParameterPointer m_pRetriggerParameter;
    EngineEffectParameterPointer m_pStretchParameter;

    DISALLOW_COPY_AND_ASSIGN(StretchEffect);
};
