#include <gtest/gtest.h>

#include <QMap>
#include <cmath>
#include <vector>

#include "effects/backends/builtin/barberpoleflangereffect.h"
#include "effects/backends/builtin/beatdelayeffect.h"
#include "effects/backends/builtin/filterednoiseeffect.h"
#include "effects/backends/builtin/shepardtoneeffect.h"
#include "effects/backends/builtin/stretcheffect.h"
#include "effects/backends/effectmanifest.h"
#include "engine/effects/engineeffectparameter.h"
#include "engine/engine.h"
#include "util/types.h"

namespace {

constexpr int kSampleRate = 44100;
constexpr SINT kFrames = 512;
constexpr double kBeatSeconds = 0.5;

template<class Effect, class State>
class Harness {
  public:
    Harness()
            : m_pManifest(Effect::getManifest()),
              m_parameters(mixxx::audio::SampleRate(kSampleRate), kFrames),
              m_state(m_parameters) {
        for (const auto& pManifest : m_pManifest->parameters()) {
            m_values.insert(pManifest->id(),
                    EngineEffectParameterPointer(new EngineEffectParameter(pManifest)));
        }
        m_effect.loadEngineEffectParameters(m_values);
        m_features.beat_length = GroupFeatureBeatLength{kBeatSeconds, 1.0};
    }

    void set(const QString& id, double value) {
        ASSERT_TRUE(m_values.contains(id)) << id.toStdString();
        m_values.value(id)->setValue(value);
    }

    // Processes `input` (interleaved stereo, a multiple of kFrames frames).
    std::vector<CSAMPLE> process(const std::vector<CSAMPLE>& input) {
        std::vector<CSAMPLE> output(input.size());
        for (std::size_t i = 0; i < input.size(); i += kFrames * 2) {
            m_effect.processChannel(&m_state,
                    input.data() + i,
                    output.data() + i,
                    m_parameters,
                    EffectEnableState::Enabled,
                    m_features);
        }
        return output;
    }

    GroupFeatureState m_features;

  private:
    EffectManifestPointer m_pManifest;
    mixxx::EngineParameters m_parameters;
    Effect m_effect;
    State m_state;
    QMap<QString, EngineEffectParameterPointer> m_values;
};

std::vector<CSAMPLE> silence(double seconds) {
    const auto buffers = static_cast<SINT>(std::ceil(seconds * kSampleRate / kFrames));
    return std::vector<CSAMPLE>(buffers * kFrames * 2, 0.0f);
}

std::vector<CSAMPLE> sine(double seconds, double frequency, CSAMPLE amplitude = 0.5f) {
    auto samples = silence(seconds);
    for (std::size_t frame = 0; frame < samples.size() / 2; ++frame) {
        const auto value = amplitude *
                static_cast<CSAMPLE>(std::sin(2 * M_PI * frequency * frame / kSampleRate));
        samples[frame * 2] = value;
        samples[frame * 2 + 1] = value;
    }
    return samples;
}

double rms(const std::vector<CSAMPLE>& samples, std::size_t from, std::size_t to) {
    double sum = 0;
    for (std::size_t i = from; i < to; ++i) {
        sum += samples[i] * samples[i];
    }
    return std::sqrt(sum / static_cast<double>(to - from));
}

void expectFiniteAndBounded(const std::vector<CSAMPLE>& samples, CSAMPLE bound) {
    for (CSAMPLE sample : samples) {
        ASSERT_TRUE(std::isfinite(sample));
        ASSERT_LE(std::fabs(sample), bound);
    }
}

TEST(BeatFxEffectsTest, BeatDelayRepeatsAfterTheBeatTime) {
    Harness<BeatDelayEffect, BeatDelayGroupState> delay;
    delay.set("time", 0.5);
    delay.set("feedback", 0.5);
    // The send fades in over the first buffer, so the impulse comes after it.
    const std::size_t impulse = kFrames;
    auto input = silence(1.0);
    input[impulse * 2] = input[impulse * 2 + 1] = 1.0f;
    const auto output = delay.process(input);

    const auto delayFrames = static_cast<std::size_t>(0.5 * kBeatSeconds * kSampleRate);
    EXPECT_NEAR(output[(impulse + delayFrames) * 2], 1.0f, 1e-4);
    EXPECT_NEAR(output[(impulse + 2 * delayFrames) * 2], 0.5f, 1e-4);
    EXPECT_FLOAT_EQ(output[(impulse + delayFrames - 10) * 2], 0.0f);
    expectFiniteAndBounded(output, 1.0f);
}

TEST(BeatFxEffectsTest, BeatDelayWithoutSendTakesNoInput) {
    Harness<BeatDelayEffect, BeatDelayGroupState> delay;
    delay.set("send", 0.0);
    const auto output = delay.process(sine(1.0, 440));
    EXPECT_LT(rms(output, kFrames * 2, output.size()), 1e-6);
}

TEST(BeatFxEffectsTest, BeatDelayMultiTapAndGlideStayBounded) {
    Harness<BeatDelayEffect, BeatDelayGroupState> delay;
    delay.set("taps", 7);
    delay.set("glide", 1);
    delay.set("feedback", 0.9);
    delay.set("low_cut", 700);
    delay.set("high_cut", 3000);
    auto output = delay.process(sine(1.0, 220));
    delay.set("time", 16.0);
    const auto more = delay.process(sine(2.0, 220));
    output.insert(output.end(), more.begin(), more.end());
    expectFiniteAndBounded(output, 1.0f);
    EXPECT_GT(rms(output, output.size() / 2, output.size()), 0.01);
}

TEST(BeatFxEffectsTest, ShepardToneIsAudibleAndBounded) {
    Harness<ShepardToneEffect, ShepardToneGroupState> tone;
    tone.set("level", 1.0);
    tone.set("period", 1 / 16.0);
    auto output = tone.process(silence(2.0));
    tone.set("falling", 1);
    tone.set("triangle", 1);
    const auto more = tone.process(silence(2.0));
    output.insert(output.end(), more.begin(), more.end());
    expectFiniteAndBounded(output, 1.0f);
    EXPECT_GT(rms(output, kFrames * 2, output.size()), 0.02);
    for (std::size_t i = 0; i < output.size(); i += 2) {
        ASSERT_EQ(output[i], output[i + 1]);
    }
}

TEST(BeatFxEffectsTest, BarberpoleFlangerWithoutDepthPassesInput) {
    Harness<BarberpoleFlangerEffect, BarberpoleFlangerGroupState> flanger;
    flanger.set("depth", 0.0);
    const auto input = sine(0.5, 440);
    const auto output = flanger.process(input);
    for (std::size_t i = 0; i < input.size(); ++i) {
        ASSERT_NEAR(output[i], input[i], 1e-6);
    }
}

TEST(BeatFxEffectsTest, BarberpoleFlangerStaysBounded) {
    Harness<BarberpoleFlangerEffect, BarberpoleFlangerGroupState> flanger;
    flanger.set("regen", 0.9);
    flanger.set("period", 1 / 16.0);
    const auto output = flanger.process(sine(2.0, 1000, 0.9f));
    expectFiniteAndBounded(output, 1.5f);
}

TEST(BeatFxEffectsTest, StretchWithoutStretchFollowsInput) {
    Harness<StretchEffect, StretchGroupState> stretch;
    stretch.set("stretch", 1.0);
    stretch.set("retrigger", 16.0);
    const auto input = sine(1.0, 440);
    const auto output = stretch.process(input);
    const double inputLevel = rms(input, input.size() / 4, input.size());
    const double outputLevel = rms(output, output.size() / 4, output.size());
    EXPECT_NEAR(outputLevel, inputLevel, inputLevel * 0.1);
    expectFiniteAndBounded(output, 1.0f);
}

TEST(BeatFxEffectsTest, StretchPlaysTheStartSlower) {
    Harness<StretchEffect, StretchGroupState> stretch;
    stretch.set("stretch", 4.0);
    stretch.set("retrigger", 16.0);
    // A tone that stops after 0.1 s is still heard after 0.3 s when stretched.
    auto input = sine(0.1, 440);
    const auto rest = silence(0.4);
    input.insert(input.end(), rest.begin(), rest.end());
    const auto output = stretch.process(input);
    const auto at = static_cast<std::size_t>(0.3 * kSampleRate) * 2;
    EXPECT_GT(rms(output, at, at + 2000), 0.05);
}

TEST(BeatFxEffectsTest, FilteredNoiseLevelAndFilter) {
    Harness<FilteredNoiseEffect, FilteredNoiseGroupState> noise;
    noise.set("level", 0.0);
    auto quiet = noise.process(silence(0.2));
    EXPECT_LT(rms(quiet, kFrames * 2, quiet.size()), 1e-6);

    noise.set("level", 1.0);
    const auto open = noise.process(silence(0.5));
    noise.set("filter", -1.0);
    const auto closed = noise.process(silence(0.5));
    expectFiniteAndBounded(open, 1.0f);
    expectFiniteAndBounded(closed, 1.0f);
    // A closed low-pass leaves little difference between neighbouring frames.
    auto roughness = [](const std::vector<CSAMPLE>& samples) {
        double sum = 0;
        for (std::size_t i = 2 * kFrames * 2; i + 2 < samples.size(); i += 2) {
            sum += std::fabs(samples[i + 2] - samples[i]);
        }
        return sum;
    };
    EXPECT_GT(rms(open, kFrames * 2, open.size()), 0.05);
    EXPECT_LT(roughness(closed), roughness(open) * 0.2);
}

} // namespace
