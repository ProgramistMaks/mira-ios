import AVFoundation

/// The audio callback consumes each buffer synchronously; no PCM escapes the tap.
final class MicrophoneLevelSampler: @unchecked Sendable {
    private let lock = NSLock()
    private var meter = MicrophoneMeter()
    func consume(_ buffer: AVAudioPCMBuffer) -> Double? {
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return nil }
        lock.lock(); defer { lock.unlock() }
        return meter.consume(UnsafeBufferPointer(start: channels[0], count: Int(buffer.frameLength) * buffer.stride),
                             stride: buffer.stride, sampleRate: buffer.format.sampleRate)
    }
}
