import AVFoundation

struct RenderedSpeech {
    let url: URL
    let envelope: SpeechEnvelope
}

enum SpeechPlaybackError: LocalizedError {
    case unavailable, unsupportedFormat, tooLong, timeout
    var errorDescription: String? {
        switch self {
        case .unavailable: return "Не удалось подготовить голос. Попробуй другой голос в настройках."
        case .unsupportedFormat: return "Этот голос выдал неподдерживаемый звук. Выбери другой голос."
        case .tooLong: return "Ответ слишком длинный для озвучивания целиком. Текст сохранён в разговоре."
        case .timeout: return "Подготовка голоса заняла слишком много времени. Попробуй другой голос."
        }
    }
}

/// AVSpeechSynthesizer owns the callback queue. Serialize file access and cancellation;
/// never retain its borrowed PCM buffers or enqueue unbounded audio data on the main actor.
final class SpeechRenderSession: @unchecked Sendable {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".caf")
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var envelope = SpeechEnvelope()
    private var closed = false
    private var totalFrames: Int64 = 0
    private var sampleRate: Double?

    func consume(_ buffer: AVAudioPCMBuffer) throws -> RenderedSpeech? {
        lock.lock(); defer { lock.unlock() }
        guard !closed else { return nil }
        if buffer.frameLength == 0 {
            closed = true; file = nil; envelope.finish()
            guard totalFrames > 0 else { throw SpeechPlaybackError.unavailable }
            return RenderedSpeech(url: url, envelope: envelope)
        }
        let format = buffer.format
        guard format.sampleRate > 0, format.commonFormat == .pcmFormatFloat32,
              !format.isInterleaved, let samples = buffer.floatChannelData else {
            throw SpeechPlaybackError.unsupportedFormat
        }
        if let sampleRate, sampleRate != format.sampleRate { throw SpeechPlaybackError.unsupportedFormat }
        sampleRate = format.sampleRate
        totalFrames += Int64(buffer.frameLength)
        guard Double(totalFrames) / format.sampleRate <= 180 else { throw SpeechPlaybackError.tooLong }
        if file == nil {
            file = try AVAudioFile(forWriting: url, settings: format.settings,
                                   commonFormat: .pcmFormatFloat32, interleaved: false)
        }
        try file?.write(from: buffer)
        for index in 0..<Int(buffer.frameLength) {
            // Voice buffers are normally mono; take the strongest channel if stereo.
            var value: Float = 0
            for channel in 0..<Int(format.channelCount) {
                let sample = samples[channel][index]
                if abs(sample) > abs(value) { value = sample }
            }
            envelope.append(sample: value, sampleRate: format.sampleRate)
        }
        return nil
    }
    func cancel() {
        lock.lock(); defer { lock.unlock() }
        closed = true; file = nil
        try? FileManager.default.removeItem(at: url)
    }
    deinit { try? FileManager.default.removeItem(at: url) }
}
