import AVFoundation
import Foundation

// Diagnostic only: synthetic text, no user audio/text and no app behavior changes.
// A successful process does not imply phonemes were provided; inspect the JSON.
final class Probe: @unchecked Sendable {
    private let lock = NSLock()
    private var frames: UInt64 = 0
    private var sampleRate = 0.0
    private var bytesPerFrame: UInt32 = 0
    private var complete = false
    private var markers: [[String: Any]] = []
    func audio(_ buffer: AVAudioBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        if pcm.frameLength == 0 { complete = true; return }
        frames += UInt64(pcm.frameLength)
        sampleRate = pcm.format.sampleRate
        bytesPerFrame = pcm.format.streamDescription.pointee.mBytesPerFrame
    }
    func metadata(_ values: [AVSpeechSynthesisMarker]) {
        lock.lock(); defer { lock.unlock() }
        for value in values {
            let kind: String
            switch value.mark {
            case .phoneme: kind = "phoneme"
            case .word: kind = "word"
            case .sentence: kind = "sentence"
            case .paragraph: kind = "paragraph"
            case .bookmark: kind = "bookmark"
            @unknown default: kind = "unknown"
            }
            markers.append(["kind": kind, "offset": value.byteSampleOffset,
                            "phoneme": value.mark == .phoneme ? value.phoneme : "",
                            "framesAtCallback": frames])
        }
    }
    var finished: Bool { lock.lock(); defer { lock.unlock() }; return complete }
    func report(voice: AVSpeechSynthesisVoice) throws {
        lock.lock(); defer { lock.unlock() }
        let report: [String: Any] = ["voice": voice.identifier, "language": voice.language,
            "frames": frames, "sampleRate": sampleRate, "bytesPerFrame": bytesPerFrame,
            "completed": complete, "markerCount": markers.count,
            "phonemeCount": markers.filter { $0["kind"] as? String == "phoneme" }.count,
            "markers": Array(markers.prefix(100))]
        print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]), encoding: .utf8)!)
    }
}

for language in ["ru-RU", "en-US"] {
    guard let voice = AVSpeechSynthesisVoice(language: language) else {
        print("VOICE_UNAVAILABLE: \(language)"); continue
    }
    let probe = Probe(), synth = AVSpeechSynthesizer()
    let utterance = AVSpeechUtterance(string: language == "ru-RU"
        ? "А, э, и, о, у. Привет, я Мира. Давай поговорим."
        : "Hello. I am Mira. Let us talk.")
    utterance.voice = voice
    synth.write(utterance, toBufferCallback: { probe.audio($0) }, toMarkerCallback: { probe.metadata($0) })
    let deadline = Date().addingTimeInterval(40)
    while !probe.finished && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    RunLoop.current.run(until: Date().addingTimeInterval(0.3))
    synth.stopSpeaking(at: .immediate)
    try probe.report(voice: voice)
}
