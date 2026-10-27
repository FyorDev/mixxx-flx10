#include "effects/backends/builtin/stretcheffect.h"

#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "util/math.h"
#include "util/sample.h"

constexpr int StretchGroupState::kMaxSeconds;

// static
QString StretchEffect::getId() {
    return QStringLiteral("org.mixxx.effects.stretch");
}

// static
EffectManifestPointer StretchEffect::getManifest() {
    EffectManifestPointer pManifest(new EffectManifest());

    pManifest->setEffectRampsFromDry(true);

    pManifest->setId(getId());
    pManifest->setName(QObject::tr("Stretch"));
    pManifest->setShortName(QObject::tr("Stretch"));
    pManifest->setAuthor("The Mixxx Team");
    pManifest->setVersion("1.0");
    pManifest->setDescription(QObject::tr(
            "Records the input when switched on and plays it back slower at "
            "the same pitch, starting over every retrigger period"));

    EffectManifestParameterPointer retrigger = pManifest->addParameter();
    retrigger->setId("retrigger");
    retrigger->setName(QObject::tr("Retrigger"));
    retrigger->setShortName(QObject::tr("Retrig"));
    retrigger->setDescription(QObject::tr(
            "Beats until the recording starts over (half seconds if no tempo "
            "is detected)"));
    retrigger->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    retrigger->setUnitsHint(EffectManifestParameter::UnitsHint::Beats);
    retrigger->setRange(1 / 16.0, 4.0, 16.0);

    EffectManifestParameterPointer stretch = pManifest->addParameter();
    stretch->setId("stretch");
    stretch->setName(QObject::tr("Stretch"));
    stretch->setShortName(QObject::tr("Stretch"));
    stretch->setDescription(QObject::tr("How many times slower the recording plays"));
    stretch->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    stretch->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    stretch->setDefaultLinkType(EffectManifestParameter::LinkType::Linked);
    stretch->setRange(1.0, 2.0, 8.0);

    return pManifest;
}

void StretchEffect::loadEngineEffectParameters(
        const QMap<QString, EngineEffectParameterPointer>& parameters) {
    m_pRetriggerParameter = parameters.value("retrigger");
    m_pStretchParameter = parameters.value("stretch");
}

void StretchEffect::processChannel(
        StretchGroupState* pState,
        const CSAMPLE* pInput,
        CSAMPLE* pOutput,
        const mixxx::EngineParameters& engineParameters,
        const EffectEnableState enableState,
        const GroupFeatureState& groupFeatures) {
    const double sampleRate = engineParameters.sampleRate();
    const SINT frames = engineParameters.framesPerBuffer();
    const SINT grainFrames = pState->grainFrames;
    const double retriggerSeconds = std::min(
            m_pRetriggerParameter->value() * mixxx::beatfx::beatSeconds(groupFeatures),
            StretchGroupState::kMaxSeconds * 0.5);
    const auto retriggerFrames = std::max<int64_t>(grainFrames,
            static_cast<int64_t>(retriggerSeconds * sampleRate));
    const double speed = 1.0 / std::max(1.0, m_pStretchParameter->value());
    // With a beat grid the recording starts over on the beats, every
    // `retrigger` beats of the track.
    double startBeats = 0;
    double endBeats = 0;
    const bool onBeat = pState->beatClock.advance(groupFeatures, &startBeats, &endBeats);
    const double retriggerBeats = m_pRetriggerParameter->value();

    for (SINT frame = 0; frame < frames; ++frame) {
        const SINT i = frame * 2;
        pState->ring.write(pInput[i], pInput[i + 1]);

        bool retrigger = pState->framesSinceTrigger >= retriggerFrames;
        if (onBeat) {
            const double beats = startBeats + (endBeats - startBeats) * frame / frames;
            const double cycle = std::floor(beats / retriggerBeats);
            retrigger = pState->started && cycle != pState->cycle;
            pState->cycle = cycle;
        }
        if (!pState->started || retrigger) {
            // Start over from the newest frame; the second grain starts half
            // a grain earlier so the two windows overlap from the first frame.
            const auto now = static_cast<double>(pState->ring.written() - 1);
            pState->readPosition = now;
            pState->grains[0] = {now, 0};
            pState->grains[1] = {now - grainFrames / 2.0, grainFrames / 2};
            pState->framesSinceTrigger = 0;
            pState->started = true;
        }

        CSAMPLE left = 0;
        CSAMPLE right = 0;
        for (auto& grain : pState->grains) {
            if (grain.offset >= grainFrames) {
                grain.start = pState->readPosition;
                grain.offset = 0;
            }
            const double window = 0.5 - 0.5 * std::cos(2 * M_PI * grain.offset / grainFrames);
            CSAMPLE grainLeft;
            CSAMPLE grainRight;
            pState->ring.readAt(grain.start + grain.offset, &grainLeft, &grainRight);
            left += grainLeft * static_cast<CSAMPLE>(window);
            right += grainRight * static_cast<CSAMPLE>(window);
            ++grain.offset;
        }
        pOutput[i] = left;
        pOutput[i + 1] = right;

        pState->readPosition += speed;
        ++pState->framesSinceTrigger;
    }

    if (enableState == EffectEnableState::Disabling) {
        pState->clear();
    }
}
