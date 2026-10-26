#pragma once

#include <QMap>

#include "effects/backends/builtin/beatfxdsp.h"
#include "effects/backends/effectprocessor.h"
#include "util/class.h"

class BeatDelayGroupState : public EffectState {
  public:
    // 16 beats down to 120 BPM; longer times are halved until they fit.
    static constexpr int kMaxDelaySeconds = 8;

    BeatDelayGroupState(const mixxx::EngineParameters& engineParameters)
            : EffectState(engineParameters) {
        ring.allocate(kMaxDelaySeconds * engineParameters.sampleRate());
        clear();
    }
    ~BeatDelayGroupState() override = default;

    void clear() {
        ring.clear();
        delayFrames = -1;
        prevSend = 0;
        for (auto& filter : lowCut) {
            filter.reset();
        }
        for (auto& filter : highCut) {
            filter.reset();
        }
    }

    mixxx::beatfx::StereoRing ring;
    double delayFrames;
    CSAMPLE_GAIN prevSend;
    mixxx::beatfx::Biquad lowCut[2];
    mixxx::beatfx::Biquad highCut[2];
};

/// Tempo-synced delay with 1-7 taps, filters in the feedback path and an
/// optional glide that bends the pitch when the time changes. Wet only.
class BeatDelayEffect : public EffectProcessorImpl<BeatDelayGroupState> {
  public:
    BeatDelayEffect() = default;
    ~BeatDelayEffect() override = default;

    static QString getId();
    static EffectManifestPointer getManifest();

    void loadEngineEffectParameters(
            const QMap<QString, EngineEffectParameterPointer>& parameters) override;

    void processChannel(
            BeatDelayGroupState* pState,
            const CSAMPLE* pInput,
            CSAMPLE* pOutput,
            const mixxx::EngineParameters& engineParameters,
            const EffectEnableState enableState,
            const GroupFeatureState& groupFeatures) override;

  private:
    QString debugString() const {
        return getId();
    }

    EngineEffectParameterPointer m_pTimeParameter;
    EngineEffectParameterPointer m_pFeedbackParameter;
    EngineEffectParameterPointer m_pTapsParameter;
    EngineEffectParameterPointer m_pLowCutParameter;
    EngineEffectParameterPointer m_pHighCutParameter;
    EngineEffectParameterPointer m_pSendParameter;
    EngineEffectParameterPointer m_pGlideParameter;

    DISALLOW_COPY_AND_ASSIGN(BeatDelayEffect);
};
