import Foundation

/// Audio-derived mouth opening in 20 ms windows, indexed by the player's clock.
/// This is amplitude synchronization, not phoneme/viseme recognition.
struct SpeechEnvelope {
    static let windowDuration = 0.02
    private(set) var levels: [Double] = []
    private var squareSum = 0.0
    private var sampleCount = 0
    private var windowSamples = 0

    mutating func append(sample: Float, sampleRate: Double) {
        if windowSamples == 0 { windowSamples = max(1, Int(sampleRate * Self.windowDuration)) }
        let value = sample.isFinite ? Double(sample) : 0
        squareSum += value * value; sampleCount += 1
        if sampleCount >= windowSamples { flush() }
    }
    mutating func finish() { if sampleCount > 0 { flush() } }
    private mutating func flush() {
        let rms = sqrt(squareSum / Double(sampleCount))
        // Ignore the noise floor; softly compress louder vowels into the VRM range.
        levels.append(rms < 0.006 ? 0 : min(0.85, pow((rms - 0.006) * 5, 0.65)))
        squareSum = 0; sampleCount = 0
    }
    func level(at time: TimeInterval) -> Double {
        guard time.isFinite, time >= 0, time < Double(levels.count) * Self.windowDuration else { return 0 }
        return levels[Int(time / Self.windowDuration)]
    }
}
