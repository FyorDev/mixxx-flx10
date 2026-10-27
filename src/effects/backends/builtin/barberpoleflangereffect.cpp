#include "effects/backends/builtin/barberpoleflangereffect.h"

#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "util/math.h"
#include "util/rampingvalue.h"
#include "util/sample.h"

namespace {
constexpr double kMinDelaySeconds = 0.0003;
constexpr double kMaxDelaySeconds = 0.012;
} // namespace

// static
QString BarberpoleFlangerEffect::getId() {
    return QStringLiteral("org.mixxx.effects.barberpoleflanger");
}

// static
EffectManifestPointer BarberpoleFlangerEffect::getManifest() {
    EffectManifestPointer pManifest(new EffectManifest());

    pManifest->setEffectRampsFromDry(true);

    pManifest->setId(getId());
    pManifest->setName(QObject::tr("Barberpole Flanger"));
    pManifest->setShortName(QObject::tr("Barberpl"));
    pManifest->setAuthor("The Mixxx Team");
    pManifest->setVersion("1.0");
    pManifest->setDescription(QObject::tr(
            "Flanger that seems to rise or fall forever, one sweep per period"));

    EffectManifestParameterPointer period = pManifest->addParameter();
    period->setId("period");
    period->setName(QObject::tr("Period"));
    period->setShortName(QObject::tr("Period"));
    period->setDescription(QObject::tr(
            "Beats per sweep (half seconds if no tempo is detected)"));
    period->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    period->setUnitsHint(EffectManifestParameter::UnitsHint::Beats);
    period->setRange(1 / 16.0, 4.0, 64.0);

    EffectManifestParameterPointer depth = pManifest->addParameter();
    depth->setId("depth");
    depth->setName(QObject::tr("Depth"));
    depth->setShortName(QObject::tr("Depth"));
    depth->setDescription(QObject::tr("Level of the swept copy"));
    depth->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    depth->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    depth->setDefaultLinkType(EffectManifestParameter::LinkType::Linked);
    depth->setRange(0.0, 1.0, 1.0);

    EffectManifestParameterPointer regen = pManifest->addParameter();
    regen->setId("regen");
    regen->setName(QObject::tr("Regeneration"));
    regen->setShortName(QObject::tr("Regen"));
    regen->setDescription(QObject::tr("Feedback of the swept copy, sharpens the notches"));
    regen->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    regen->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    regen->setRange(0.0, 0.5, 0.9);

    EffectManifestParameterPointer falling = pManifest->addParameter();
    falling->setId("falling");
    falling->setName(QObject::tr("Falling"));
    falling->setShortName(QObject::tr("Falling"));
    falling->setDescription(QObject::tr("Sweep down instead of up"));
    falling->setValueScaler(EffectManifestParameter::ValueScaler::Toggle);
    falling->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    falling->setRange(0, 0, 1);

    return pManifest;
}

void BarberpoleFlangerEffect::loadEngineEffectParameters(
        const QMap<QString, EngineEffectParameterPointer>& parameters) {
    m_pPeriodParameter = parameters.value("period");
    m_pDepthParameter = parameters.value("depth");
    m_pRegenParameter = parameters.value("regen");
    m_pFallingParameter = parameters.value("falling");
}

void BarberpoleFlangerEffect::processChannel(
        BarberpoleFlangerGroupState* pState,
        const CSAMPLE* pInput,
        CSAMPLE* pOutput,
        const mixxx::EngineParameters& engineParameters,
        const EffectEnableState enableState,
        const GroupFeatureState& groupFeatures) {
    const double sampleRate = engineParameters.sampleRate();
    const SINT frames = engineParameters.framesPerBuffer();
    const double periodSeconds = m_pPeriodParameter->value() *
            mixxx::beatfx::beatSeconds(groupFeatures);
    const double phasePerFrame = 1.0 / (periodSeconds * sampleRate);
    const bool falling = m_pFallingParameter->toBool();
    const auto regen = static_cast<CSAMPLE_GAIN>(m_pRegenParameter->value());
    const auto depthCurrent = static_cast<CSAMPLE_GAIN>(m_pDepthParameter->value());
    const RampingValue<CSAMPLE_GAIN> depth(pState->prevDepth, depthCurrent, frames);
    const double minDelay = kMinDelaySeconds * sampleRate;
    const double sweep = (kMaxDelaySeconds - kMinDelaySeconds) * sampleRate;
    // With a beat grid the sweep follows the beats, so it starts on a beat
    // and stays in time when the tempo changes.
    double startBeats = 0;
    double endBeats = 0;
    const bool onBeat = pState->beatClock.advance(groupFeatures, &startBeats, &endBeats);
    const double periodBeats = m_pPeriodParameter->value();

    for (SINT frame = 0; frame < frames; ++frame) {
        if (onBeat) {
            const double beats = startBeats + (endBeats - startBeats) * frame / frames;
            pState->phase = beats / periodBeats - std::floor(beats / periodBeats);
        }
        CSAMPLE sweptLeft = 0;
        CSAMPLE sweptRight = 0;
        for (int voice = 0; voice < 2; ++voice) {
            double position = pState->phase + 0.5 * voice;
            position -= std::floor(position);
            // A shrinking delay moves the notches up.
            const double delay = falling
                    ? minDelay + sweep * position
                    : minDelay + sweep * (1.0 - position);
            const double window = std::sin(M_PI * position);
            const auto weight = static_cast<CSAMPLE>(window * window);
            CSAMPLE left;
            CSAMPLE right;
            pState->ring.readDelayed(delay, &left, &right);
            sweptLeft += left * weight;
            sweptRight += right * weight;
        }

        const SINT i = frame * 2;
        const CSAMPLE_GAIN depthRamped = depth.getNth(static_cast<int>(frame));
        const CSAMPLE_GAIN gain = 1.0f / (1.0f + 0.5f * depthRamped);
        pOutput[i] = (pInput[i] + sweptLeft * depthRamped) * gain;
        pOutput[i + 1] = (pInput[i + 1] + sweptRight * depthRamped) * gain;
        pState->ring.write(SampleUtil::clampSample(pInput[i] + sweptLeft * regen),
                SampleUtil::clampSample(pInput[i + 1] + sweptRight * regen));

        if (!onBeat) {
            pState->phase += phasePerFrame;
            if (pState->phase >= 1.0) {
                pState->phase -= 1.0;
            }
        }
    }

    if (enableState == EffectEnableState::Disabling) {
        pState->clear();
    } else {
        pState->prevDepth = depthCurrent;
    }
}
