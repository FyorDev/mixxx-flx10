#pragma once

#include <QMap>
#include <array>

#include "effects/backends/effectprocessor.h"
#include "util/class.h"

class ShepardToneGroupState : public EffectState {
  public:
    static constexpr int kVoices = 8;

    ShepardToneGroupState(const mixxx::EngineParameters& engineParameters)
            : EffectState(engineParameters) {
        clear();
    }
    ~ShepardToneGroupState() override = default;

    void clear() {
        shift = 0;
        oscillatorPhase.fill(0);
        prevLevel = 0;
    }

    // Position of the lowest voice within its octave, 0..1.
    double shift;
    std::array<double, kVoices> oscillatorPhase;
    CSAMPLE_GAIN prevLevel;
};

/// Endlessly rising or falling tone (Shepard-Risset glissando) of saw or
/// triangle waves, synced to the beat and mixed into the input. Wet only.
class ShepardToneEffect : public EffectProcessorImpl<ShepardToneGroupState> {
  public:
    ShepardToneEffect() = default;
    ~ShepardToneEffect() override = default;

    static QString getId();
    static EffectManifestPointer getManifest();

    void loadEngineEffectParameters(
            const QMap<QString, EngineEffectParameterPointer>& parameters) override;

    void processChannel(
            ShepardToneGroupState* pState,
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
    EngineEffectParameterPointer m_pLevelParameter;
    EngineEffectParameterPointer m_pFallingParameter;
    EngineEffectParameterPointer m_pTriangleParameter;

    DISALLOW_COPY_AND_ASSIGN(ShepardToneEffect);
};
