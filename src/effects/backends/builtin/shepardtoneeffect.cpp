#include "effects/backends/builtin/shepardtoneeffect.h"

#include "effects/backends/builtin/beatfxdsp.h"
#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "util/math.h"
#include "util/rampingvalue.h"
#include "util/sample.h"

constexpr int ShepardToneGroupState::kVoices;

namespace {
constexpr double kLowestFrequency = 30.0;
constexpr CSAMPLE kOutputGain = 0.1f;

// Band-limiting correction for the saw discontinuity.
double polyBlep(double t, double dt) {
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1.0;
    }
    if (t > 1.0 - dt) {
        t = (t - 1.0) / dt;
        return t * t + t + t + 1.0;
    }
    return 0.0;
}
} // namespace

// static
QString ShepardToneEffect::getId() {
    return QStringLiteral("org.mixxx.effects.shepardtone");
}

// static
EffectManifestPointer ShepardToneEffect::getManifest() {
    EffectManifestPointer pManifest(new EffectManifest());

    pManifest->setAddDryToWet(true);
    pManifest->setEffectRampsFromDry(true);

    pManifest->setId(getId());
    pManifest->setName(QObject::tr("Shepard Tone"));
    pManifest->setShortName(QObject::tr("Shepard"));
    pManifest->setAuthor("The Mixxx Team");
    pManifest->setVersion("1.0");
    pManifest->setDescription(QObject::tr(
            "Mixes in a tone that seems to rise or fall forever, moving one "
            "octave per period"));

    EffectManifestParameterPointer period = pManifest->addParameter();
    period->setId("period");
    period->setName(QObject::tr("Period"));
    period->setShortName(QObject::tr("Period"));
    period->setDescription(QObject::tr(
            "Beats per octave of movement (half seconds if no tempo is detected)"));
    period->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    period->setUnitsHint(EffectManifestParameter::UnitsHint::Beats);
    period->setRange(1 / 16.0, 4.0, 64.0);

    EffectManifestParameterPointer level = pManifest->addParameter();
    level->setId("level");
    level->setName(QObject::tr("Level"));
    level->setShortName(QObject::tr("Level"));
    level->setDescription(QObject::tr("Volume of the tone"));
    level->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    level->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    level->setDefaultLinkType(EffectManifestParameter::LinkType::Linked);
    level->setRange(0.0, 0.5, 1.0);

    EffectManifestParameterPointer falling = pManifest->addParameter();
    falling->setId("falling");
    falling->setName(QObject::tr("Falling"));
    falling->setShortName(QObject::tr("Falling"));
    falling->setDescription(QObject::tr("Let the tone fall instead of rise"));
    falling->setValueScaler(EffectManifestParameter::ValueScaler::Toggle);
    falling->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    falling->setRange(0, 0, 1);

    EffectManifestParameterPointer triangle = pManifest->addParameter();
    triangle->setId("triangle");
    triangle->setName(QObject::tr("Triangle"));
    triangle->setShortName(QObject::tr("Triangle"));
    triangle->setDescription(QObject::tr("Triangle waves instead of saw waves"));
    triangle->setValueScaler(EffectManifestParameter::ValueScaler::Toggle);
    triangle->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    triangle->setRange(0, 0, 1);

    return pManifest;
}

void ShepardToneEffect::loadEngineEffectParameters(
        const QMap<QString, EngineEffectParameterPointer>& parameters) {
    m_pPeriodParameter = parameters.value("period");
    m_pLevelParameter = parameters.value("level");
    m_pFallingParameter = parameters.value("falling");
    m_pTriangleParameter = parameters.value("triangle");
}

void ShepardToneEffect::processChannel(
        ShepardToneGroupState* pState,
        const CSAMPLE* pInput,
        CSAMPLE* pOutput,
        const mixxx::EngineParameters& engineParameters,
        const EffectEnableState enableState,
        const GroupFeatureState& groupFeatures) {
    Q_UNUSED(pInput);
    constexpr int kVoices = ShepardToneGroupState::kVoices;
    const double sampleRate = engineParameters.sampleRate();
    const SINT frames = engineParameters.framesPerBuffer();
    const double periodSeconds = m_pPeriodParameter->value() *
            mixxx::beatfx::beatSeconds(groupFeatures);
    const double direction = m_pFallingParameter->toBool() ? -1.0 : 1.0;
    const double shiftPerFrame = direction / (periodSeconds * sampleRate);
    const bool triangle = m_pTriangleParameter->toBool();
    const auto levelCurrent = static_cast<CSAMPLE_GAIN>(m_pLevelParameter->value());
    const RampingValue<CSAMPLE_GAIN> level(pState->prevLevel, levelCurrent, frames);

    auto& phases = pState->oscillatorPhase;
    for (SINT frame = 0; frame < frames; ++frame) {
        pState->shift += shiftPerFrame;
        if (pState->shift >= 1.0) {
            // Every voice moved up one octave: voice k takes over k - 1.
            pState->shift -= 1.0;
            for (int k = kVoices - 1; k > 0; --k) {
                phases[k] = phases[k - 1];
            }
            phases[0] = 0;
        } else if (pState->shift < 0.0) {
            pState->shift += 1.0;
            for (int k = 0; k < kVoices - 1; ++k) {
                phases[k] = phases[k + 1];
            }
            phases[kVoices - 1] = 0;
        }

        const double base = kLowestFrequency * std::exp2(pState->shift);
        double sum = 0;
        for (int k = 0; k < kVoices; ++k) {
            const double position = (k + pState->shift) / kVoices;
            const double frequency = base * static_cast<double>(1 << k);
            const double increment = std::min(frequency / sampleRate, 0.5);
            const double amplitude = 0.5 - 0.5 * std::cos(2 * M_PI * position);
            double wave;
            if (triangle) {
                wave = 4.0 * std::fabs(phases[k] - 0.5) - 1.0;
            } else {
                wave = 2.0 * phases[k] - 1.0 - polyBlep(phases[k], increment);
            }
            sum += amplitude * wave;
            phases[k] += increment;
            if (phases[k] >= 1.0) {
                phases[k] -= 1.0;
            }
        }

        const auto sample = static_cast<CSAMPLE>(sum) * kOutputGain *
                level.getNth(static_cast<int>(frame));
        pOutput[frame * 2] = sample;
        pOutput[frame * 2 + 1] = sample;
    }

    if (enableState == EffectEnableState::Disabling) {
        SampleUtil::applyRampingGain(pOutput, 1.0, 0.0, engineParameters.samplesPerBuffer());
        pState->clear();
    } else {
        pState->prevLevel = levelCurrent;
    }
}
