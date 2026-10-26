#pragma once

#include <QMap>

#include "effects/backends/builtin/beatfxdsp.h"
#include "effects/backends/effectprocessor.h"
#include "util/class.h"

class FilteredNoiseGroupState : public EffectState {
  public:
    FilteredNoiseGroupState(const mixxx::EngineParameters& engineParameters)
            : EffectState(engineParameters),
              noise{mixxx::beatfx::Noise(0x2545f491u), mixxx::beatfx::Noise(0x9e3779b9u)} {
        clear();
    }
    ~FilteredNoiseGroupState() override = default;

    void clear() {
        for (int c = 0; c < 2; ++c) {
            lowPass[c].reset();
            highPass[c].reset();
        }
        prevLevel = 0;
    }

    mixxx::beatfx::Noise noise[2];
    mixxx::beatfx::Biquad lowPass[2];
    mixxx::beatfx::Biquad highPass[2];
    CSAMPLE_GAIN prevLevel;
};

/// White noise through a filter that closes (left) or opens from the bottom
/// (right), mixed into the input. Wet only.
class FilteredNoiseEffect : public EffectProcessorImpl<FilteredNoiseGroupState> {
  public:
    FilteredNoiseEffect() = default;
    ~FilteredNoiseEffect() override = default;

    static QString getId();
    static EffectManifestPointer getManifest();

    void loadEngineEffectParameters(
            const QMap<QString, EngineEffectParameterPointer>& parameters) override;

    void processChannel(
            FilteredNoiseGroupState* pState,
            const CSAMPLE* pInput,
            CSAMPLE* pOutput,
            const mixxx::EngineParameters& engineParameters,
            const EffectEnableState enableState,
            const GroupFeatureState& groupFeatures) override;

  private:
    QString debugString() const {
        return getId();
    }

    EngineEffectParameterPointer m_pFilterParameter;
    EngineEffectParameterPointer m_pLevelParameter;

    DISALLOW_COPY_AND_ASSIGN(FilteredNoiseEffect);
};
