#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "engine/effects/groupfeaturestate.h"
#include "util/math.h"
#include "util/samplebuffer.h"
#include "util/types.h"

// Small DSP helpers shared by the beat-synced effects (Beat Delay, Shepard
// Tone, Barberpole Flanger, Stretch, Filtered Noise).
namespace mixxx::beatfx {

// Length of one beat, or 120 BPM when the group has no tempo.
inline double beatSeconds(const GroupFeatureState& groupFeatures) {
    if (groupFeatures.beat_length.has_value() && groupFeatures.beat_length->seconds > 0) {
        return groupFeatures.beat_length->seconds;
    }
    return 0.5;
}

// RBJ cookbook low/high pass, transposed direct form II.
class Biquad {
  public:
    void setLowPass(double sampleRate, double frequency, double q) {
        design(sampleRate, frequency, q, false);
    }

    void setHighPass(double sampleRate, double frequency, double q) {
        design(sampleRate, frequency, q, true);
    }

    void setBypass() {
        m_b0 = 1;
        m_b1 = m_b2 = m_a1 = m_a2 = 0;
    }

    void reset() {
        m_z1 = m_z2 = 0;
    }

    CSAMPLE process(CSAMPLE x) {
        const double y = m_b0 * x + m_z1;
        m_z1 = m_b1 * x - m_a1 * y + m_z2;
        m_z2 = m_b2 * x - m_a2 * y;
        return static_cast<CSAMPLE>(y);
    }

  private:
    void design(double sampleRate, double frequency, double q, bool highPass) {
        frequency = std::clamp(frequency, 10.0, 0.45 * sampleRate);
        const double w0 = 2 * M_PI * frequency / sampleRate;
        const double cosW0 = std::cos(w0);
        const double alpha = std::sin(w0) / (2 * q);
        const double a0 = 1 + alpha;
        if (highPass) {
            m_b0 = (1 + cosW0) / 2 / a0;
            m_b1 = -(1 + cosW0) / a0;
        } else {
            m_b0 = (1 - cosW0) / 2 / a0;
            m_b1 = (1 - cosW0) / a0;
        }
        m_b2 = m_b0;
        m_a1 = -2 * cosW0 / a0;
        m_a2 = (1 - alpha) / a0;
    }

    double m_b0 = 1;
    double m_b1 = 0;
    double m_b2 = 0;
    double m_a1 = 0;
    double m_a2 = 0;
    double m_z1 = 0;
    double m_z2 = 0;
};

// xorshift32 white noise in [-1, 1].
class Noise {
  public:
    explicit Noise(uint32_t seed = 0x9e3779b9u)
            : m_state(seed ? seed : 1) {
    }

    CSAMPLE next() {
        m_state ^= m_state << 13;
        m_state ^= m_state >> 17;
        m_state ^= m_state << 5;
        return static_cast<CSAMPLE>(m_state / 2147483648.0 - 1.0);
    }

  private:
    uint32_t m_state;
};

// Stereo ring buffer addressed by absolute frame count, read with linear
// interpolation at fractional positions.
class StereoRing {
  public:
    void allocate(SINT frames) {
        m_frames = std::max<SINT>(frames, 2);
        m_buffer = mixxx::SampleBuffer(m_frames * 2);
        clear();
    }

    void clear() {
        m_buffer.clear();
        m_written = 0;
    }

    SINT frames() const {
        return m_frames;
    }

    int64_t written() const {
        return m_written;
    }

    void write(CSAMPLE left, CSAMPLE right) {
        const SINT index = static_cast<SINT>(m_written % m_frames) * 2;
        m_buffer[index] = left;
        m_buffer[index + 1] = right;
        ++m_written;
    }

    // Reads the frame at absolute position `frame` (may be fractional).
    void readAt(double frame, CSAMPLE* pLeft, CSAMPLE* pRight) const {
        if (m_written == 0) {
            *pLeft = *pRight = 0;
            return;
        }
        const double oldest = static_cast<double>(m_written - m_frames + 1);
        frame = std::clamp(frame, std::max(0.0, oldest), static_cast<double>(m_written - 1));
        const auto whole = static_cast<int64_t>(frame);
        const auto frac = static_cast<CSAMPLE>(frame - static_cast<double>(whole));
        const SINT i0 = static_cast<SINT>(whole % m_frames) * 2;
        const SINT i1 = static_cast<SINT>((whole + 1) % m_frames) * 2;
        const bool hasNext = whole + 1 < m_written;
        const CSAMPLE l1 = hasNext ? m_buffer[i1] : m_buffer[i0];
        const CSAMPLE r1 = hasNext ? m_buffer[i1 + 1] : m_buffer[i0 + 1];
        *pLeft = m_buffer[i0] + (l1 - m_buffer[i0]) * frac;
        *pRight = m_buffer[i0 + 1] + (r1 - m_buffer[i0 + 1]) * frac;
    }

    // Reads `delayFrames` behind the most recently written frame.
    void readDelayed(double delayFrames, CSAMPLE* pLeft, CSAMPLE* pRight) const {
        readAt(static_cast<double>(m_written) - delayFrames, pLeft, pRight);
    }

  private:
    mixxx::SampleBuffer m_buffer;
    SINT m_frames = 0;
    int64_t m_written = 0;
};

} // namespace mixxx::beatfx
