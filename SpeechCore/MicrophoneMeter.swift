import Foundation

/// Computes a 100 ms RMS level from actual microphone samples, retaining no audio.
/// The caller owns thread serialization. Nonfinite samples count as silence.
struct MicrophoneMeter {
    private var squares = 0.0
    private var count = 0
    mutating func consume(_ samples: UnsafeBufferPointer<Float>, stride: Int, sampleRate: Double) -> Double? {
        guard stride > 0, sampleRate.isFinite, sampleRate >= 1, sampleRate <= 384000 else { return nil }
        let window = max(1, Int(sampleRate * 0.1))
        var result: Double?
        for index in Swift.stride(from: 0, to: samples.count, by: stride) {
            let value = samples[index].isFinite ? min(1, max(-1, Double(samples[index]))) : 0
            squares += value * value; count += 1
            if count >= window {
                let rms = sqrt(squares / Double(count))
                result = rms > 0 ? min(1, max(0, (20 * log10(rms) + 55) / 45)) : 0
                squares = 0; count = 0
            }
        }
        return result
    }
}
