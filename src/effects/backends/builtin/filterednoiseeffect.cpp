#include "effects/backends/builtin/filterednoiseeffect.h"

#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "util/math.h"
#include "util/rampingvalue.h"
#include "util/sample.h"

namespace {
constexpr double kLowPassOpen = 20000.0;
constexpr double kLowPassClosed = 150.0;
constexpr double kHighPassOpen = 20.0;
constexpr double kHighPassClosed = 10000.0;
constexpr CSAMPLE kOutputGain = 0.25f;
} // namespace

// static
QString FilteredNoiseEffect::getId() {
    return QStringLiteral("org.mixxx.effects.filterednoise");
}

// static
EffectManifestPointer FilteredNoiseEffect::getManifest() {
    EffectManifestPointer pManifest(new EffectManifest());

    pManifest->setAddDryToWet(true);
    pManifest->setEffectRampsFromDry(true);

    pManifest->setId(getId());
    pManifest->setName(QObject::tr("Filtered Noise"));
    pManifest->setShortName(QObject::tr("FltNoise"));
    pManifest->setAuthor("The Mixxx Team");
    pManifest->setVersion("1.0");
    pManifest->setDescription(QObject::tr(
            "Mixes in white noise that passes a low-pass (left) or high-pass "
            "(right) filter"));

    EffectManifestParameterPointer filter = pManifest->addParameter();
    filter->setId("filter");
    filter->setName(QObject::tr("Filter"));
    filter->setShortName(QObject::tr("Filter"));
    filter->setDescription(QObject::tr(
            "Left of center lowers the low-pass cutoff, right of center raises "
            "the high-pass cutoff"));
    filter->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    filter->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    filter->setRange(-1.0, 0.0, 1.0);

    EffectManifestParameterPointer level = pManifest->addParameter();
    level->setId("level");
    level->setName(QObject::tr("Level"));
    level->setShortName(QObject::tr("Level"));
    level->setDescription(QObject::tr("Volume of the noise"));
    level->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    level->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    level->setDefaultLinkType(EffectManifestParameter::LinkType::Linked);
    level->setRange(0.0, 0.5, 1.0);

    return pManifest;
}

void FilteredNoiseEffect::loadEngineEffectParameters(
        const QMap<QString, EngineEffectParameterPointer>& parameters) {
    m_pFilterParameter = parameters.value("filter");
    m_pLevelParameter = parameters.value("level");
}

void FilteredNoiseEffect::processChannel(
        FilteredNoiseGroupState* pState,
        const CSAMPLE* pInput,
        CSAMPLE* pOutput,
        const mixxx::EngineParameters& engineParameters,
        const EffectEnableState enableState,
        const GroupFeatureState& groupFeatures) {
    Q_UNUSED(pInput);
    Q_UNUSED(groupFeatures);
    const double sampleRate = engineParameters.sampleRate();
    const SINT frames = engineParameters.framesPerBuffer();
    const double filter = m_pFilterParameter->value();
    for (int c = 0; c < 2; ++c) {
        if (filter < 0) {
            pState->lowPass[c].setLowPass(sampleRate,
                    kLowPassOpen * std::pow(kLowPassClosed / kLowPassOpen, -filter),
                    1.2);
        } else {
            pState->lowPass[c].setBypass();
        }
        if (filter > 0) {
            pState->highPass[c].setHighPass(sampleRate,
                    kHighPassOpen * std::pow(kHighPassClosed / kHighPassOpen, filter),
                    1.2);
        } else {
            pState->highPass[c].setBypass();
        }
    }
    const auto levelCurrent = static_cast<CSAMPLE_GAIN>(m_pLevelParameter->value());
    const RampingValue<CSAMPLE_GAIN> level(pState->prevLevel, levelCurrent, frames);

    for (SINT frame = 0; frame < frames; ++frame) {
        const CSAMPLE_GAIN gain = level.getNth(static_cast<int>(frame)) * kOutputGain;
        for (int c = 0; c < 2; ++c) {
            const CSAMPLE sample = pState->highPass[c].process(
                    pState->lowPass[c].process(pState->noise[c].next()));
            pOutput[frame * 2 + c] = sample * gain;
        }
    }

    if (enableState == EffectEnableState::Disabling) {
        SampleUtil::applyRampingGain(pOutput, 1.0, 0.0, engineParameters.samplesPerBuffer());
        pState->clear();
    } else {
        pState->prevLevel = levelCurrent;
    }
}
