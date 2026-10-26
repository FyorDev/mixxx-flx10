#include "effects/backends/builtin/beatdelayeffect.h"

#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "util/math.h"
#include "util/rampingvalue.h"
#include "util/sample.h"

constexpr int BeatDelayGroupState::kMaxDelaySeconds;

namespace {
constexpr int kMaxTaps = 7;
constexpr double kLowCutOff = 25.0;
constexpr double kHighCutOff = 19000.0;
// Glide moves the delay by at most half a frame per frame: up to +-50 % pitch.
constexpr double kMaxGlidePerFrame = 0.5;
} // namespace

// static
QString BeatDelayEffect::getId() {
    return QStringLiteral("org.mixxx.effects.beatdelay");
}

// static
EffectManifestPointer BeatDelayEffect::getManifest() {
    EffectManifestPointer pManifest(new EffectManifest());

    pManifest->setAddDryToWet(true);
    pManifest->setEffectRampsFromDry(true);

    pManifest->setId(getId());
    pManifest->setName(QObject::tr("Beat Delay"));
    pManifest->setShortName(QObject::tr("BeatDly"));
    pManifest->setAuthor("The Mixxx Team");
    pManifest->setVersion("1.0");
    pManifest->setDescription(QObject::tr(
            "Tempo-synced delay from 1/16 to 16 beats with up to 7 taps, "
            "low and high cut on the repeats and an optional pitch glide "
            "when the time changes"));

    EffectManifestParameterPointer time = pManifest->addParameter();
    time->setId("time");
    time->setName(QObject::tr("Time"));
    time->setShortName(QObject::tr("Time"));
    time->setDescription(QObject::tr(
            "Delay time in beats (in half seconds if no tempo is detected)"));
    time->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    time->setUnitsHint(EffectManifestParameter::UnitsHint::Beats);
    time->setRange(1 / 16.0, 0.5, 16.0);

    EffectManifestParameterPointer feedback = pManifest->addParameter();
    feedback->setId("feedback");
    feedback->setName(QObject::tr("Feedback"));
    feedback->setShortName(QObject::tr("Feedback"));
    feedback->setDescription(QObject::tr("How much of each repeat is repeated again"));
    feedback->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    feedback->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    feedback->setRange(0.0, 0.5, 1.0);

    EffectManifestParameterPointer taps = pManifest->addParameter();
    taps->setId("taps");
    taps->setName(QObject::tr("Taps"));
    taps->setShortName(QObject::tr("Taps"));
    taps->setDescription(QObject::tr(
            "Number of repeats spread evenly over the delay time"));
    taps->setValueScaler(EffectManifestParameter::ValueScaler::Integral);
    taps->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    taps->setRange(1, 1, kMaxTaps);

    EffectManifestParameterPointer lowCut = pManifest->addParameter();
    lowCut->setId("low_cut");
    lowCut->setName(QObject::tr("Low Cut"));
    lowCut->setShortName(QObject::tr("LowCut"));
    lowCut->setDescription(QObject::tr("High-pass frequency applied to every repeat"));
    lowCut->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    lowCut->setUnitsHint(EffectManifestParameter::UnitsHint::Hertz);
    lowCut->setRange(20.0, 20.0, 5000.0);

    EffectManifestParameterPointer highCut = pManifest->addParameter();
    highCut->setId("high_cut");
    highCut->setName(QObject::tr("High Cut"));
    highCut->setShortName(QObject::tr("HighCut"));
    highCut->setDescription(QObject::tr("Low-pass frequency applied to every repeat"));
    highCut->setValueScaler(EffectManifestParameter::ValueScaler::Logarithmic);
    highCut->setUnitsHint(EffectManifestParameter::UnitsHint::Hertz);
    highCut->setRange(200.0, 20000.0, 20000.0);

    EffectManifestParameterPointer send = pManifest->addParameter();
    send->setId("send");
    send->setName(QObject::tr("Send"));
    send->setShortName(QObject::tr("Send"));
    send->setDescription(QObject::tr(
            "How much of the input goes into the delay. At zero the repeats "
            "ring out"));
    send->setValueScaler(EffectManifestParameter::ValueScaler::Linear);
    send->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    send->setDefaultLinkType(EffectManifestParameter::LinkType::Linked);
    send->setRange(0.0, 1.0, 1.0);

    EffectManifestParameterPointer glide = pManifest->addParameter();
    glide->setId("glide");
    glide->setName(QObject::tr("Glide"));
    glide->setShortName(QObject::tr("Glide"));
    glide->setDescription(QObject::tr(
            "Move smoothly to a new time, bending the pitch of the repeats"));
    glide->setValueScaler(EffectManifestParameter::ValueScaler::Toggle);
    glide->setUnitsHint(EffectManifestParameter::UnitsHint::Unknown);
    glide->setRange(0, 0, 1);

    return pManifest;
}

void BeatDelayEffect::loadEngineEffectParameters(
        const QMap<QString, EngineEffectParameterPointer>& parameters) {
    m_pTimeParameter = parameters.value("time");
    m_pFeedbackParameter = parameters.value("feedback");
    m_pTapsParameter = parameters.value("taps");
    m_pLowCutParameter = parameters.value("low_cut");
    m_pHighCutParameter = parameters.value("high_cut");
    m_pSendParameter = parameters.value("send");
    m_pGlideParameter = parameters.value("glide");
}

void BeatDelayEffect::processChannel(
        BeatDelayGroupState* pState,
        const CSAMPLE* pInput,
        CSAMPLE* pOutput,
        const mixxx::EngineParameters& engineParameters,
        const EffectEnableState enableState,
        const GroupFeatureState& groupFeatures) {
    const double sampleRate = engineParameters.sampleRate();
    const SINT frames = engineParameters.framesPerBuffer();

    double seconds = m_pTimeParameter->value() * mixxx::beatfx::beatSeconds(groupFeatures);
    const double maxSeconds = BeatDelayGroupState::kMaxDelaySeconds * 0.95;
    while (seconds > maxSeconds) {
        seconds /= 2;
    }
    const double targetDelay = std::max(1.0, seconds * sampleRate);
    const int taps = std::clamp(m_pTapsParameter->toInt(), 1, kMaxTaps);
    const auto feedback = static_cast<CSAMPLE_GAIN>(m_pFeedbackParameter->value());
    const auto sendCurrent = static_cast<CSAMPLE_GAIN>(m_pSendParameter->value());

    const double lowCut = m_pLowCutParameter->value();
    const double highCut = m_pHighCutParameter->value();
    for (int c = 0; c < 2; ++c) {
        if (lowCut <= kLowCutOff) {
            pState->lowCut[c].setBypass();
        } else {
            pState->lowCut[c].setHighPass(sampleRate, lowCut, 0.707);
        }
        if (highCut >= kHighCutOff) {
            pState->highCut[c].setBypass();
        } else {
            pState->highCut[c].setLowPass(sampleRate, highCut, 0.707);
        }
    }

    if (pState->delayFrames < 0) {
        pState->delayFrames = targetDelay;
    }
    const double startDelay = pState->delayFrames;
    double endDelay = targetDelay;
    const bool glide = m_pGlideParameter->toBool();
    if (glide) {
        const double maxChange = kMaxGlidePerFrame * frames;
        endDelay = startDelay + std::clamp(targetDelay - startDelay, -maxChange, maxChange);
    }
    const bool crossfade = !glide && startDelay != endDelay;

    CSAMPLE_GAIN tapGain[kMaxTaps];
    CSAMPLE_GAIN gainSum = 0;
    for (int k = 0; k < taps; ++k) {
        tapGain[k] = taps == 1 ? 1.0f : 1.0f - 0.6f * k / (taps - 1);
        gainSum += tapGain[k];
    }
    const CSAMPLE_GAIN normalize = taps == 1 ? 1.0f : 1.5f / gainSum;

    const RampingValue<CSAMPLE_GAIN> send(pState->prevSend, sendCurrent, frames);

    for (SINT frame = 0; frame < frames; ++frame) {
        const double progress = static_cast<double>(frame) / frames;
        const double delay = glide ? startDelay + (endDelay - startDelay) * progress : endDelay;
        CSAMPLE wetLeft = 0;
        CSAMPLE wetRight = 0;
        CSAMPLE lastLeft = 0;
        CSAMPLE lastRight = 0;
        for (int k = 0; k < taps; ++k) {
            const double tapDelay = delay * (k + 1) / taps;
            CSAMPLE left;
            CSAMPLE right;
            pState->ring.readDelayed(tapDelay, &left, &right);
            if (crossfade) {
                CSAMPLE oldLeft;
                CSAMPLE oldRight;
                pState->ring.readDelayed(startDelay * (k + 1) / taps, &oldLeft, &oldRight);
                const auto mix = static_cast<CSAMPLE>(progress);
                left = oldLeft + (left - oldLeft) * mix;
                right = oldRight + (right - oldRight) * mix;
            }
            wetLeft += left * tapGain[k];
            wetRight += right * tapGain[k];
            lastLeft = left;
            lastRight = right;
        }

        const SINT i = frame * 2;
        pOutput[i] = wetLeft * normalize;
        pOutput[i + 1] = wetRight * normalize;

        const CSAMPLE_GAIN sendRamped = send.getNth(static_cast<int>(frame));
        CSAMPLE inLeft = pInput[i] * sendRamped + lastLeft * feedback;
        CSAMPLE inRight = pInput[i + 1] * sendRamped + lastRight * feedback;
        inLeft = pState->highCut[0].process(pState->lowCut[0].process(inLeft));
        inRight = pState->highCut[1].process(pState->lowCut[1].process(inRight));
        pState->ring.write(SampleUtil::clampSample(inLeft), SampleUtil::clampSample(inRight));
    }

    pState->delayFrames = endDelay;
    if (enableState == EffectEnableState::Disabling) {
        SampleUtil::applyRampingGain(pOutput, 1.0, 0.0, engineParameters.samplesPerBuffer());
        pState->clear();
    } else {
        pState->prevSend = sendCurrent;
    }
}
