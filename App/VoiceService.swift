import AVFoundation
import Speech
import Combine

@MainActor
final class VoiceService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var speaking = false
    @Published private(set) var recording = false
    @Published private(set) var transcript = ""
    var onError: ((String) -> Void)?
    private let synth = AVSpeechSynthesizer()
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var timeout: Task<Void, Never>?
    private var hasTap = false
    private var generation = UUID()

    override init() { super.init(); synth.delegate = self }
    var voices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ru") }
            .sorted { $0.quality.rawValue > $1.quality.rawValue }
    }
    func startRecording(offlineOnly: Bool = false) async throws {
        stop()
        let id = UUID(); generation = id
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        let microphone = await AVAudioApplication.requestRecordPermission()
        guard id == generation else { return }
        guard speech == .authorized && microphone else { throw CompanionError.permission }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU")), recognizer.isAvailable else {
            throw CompanionError.noSpeech
        }
        if offlineOnly && !recognizer.supportsOnDeviceRecognition { throw CompanionError.offlineSpeechUnavailable }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setActive(true)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = offlineOnly
        self.request = request
        transcript = ""
        let node = engine.inputNode
        let format = node.outputFormat(forBus: 0)
        guard format.sampleRate > 0 && format.channelCount > 0 else { stopRecording(); throw CompanionError.noSpeech }
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
        hasTap = true
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let finished = result?.isFinal == true
            Task { @MainActor in
                guard let self, self.generation == id else { return }
                if let text { self.transcript = text }
                if finished || error != nil {
                    self.stopRecording()
                    if error != nil && self.transcript.isEmpty { self.onError?(CompanionError.noSpeech.localizedDescription) }
                }
            }
        }
        do { engine.prepare(); try engine.start(); recording = true }
        catch { stopRecording(); throw error }
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(55))
            guard !Task.isCancelled else { return }
            self?.stopRecording()
        }
    }
    func stopRecording() {
        generation = UUID()
        timeout?.cancel(); timeout = nil
        engine.stop()
        if hasTap { engine.inputNode.removeTap(onBus: 0); hasTap = false }
        request?.endAudio(); task?.cancel(); task = nil; request = nil
        recording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func say(_ text: String, voiceID: String) throws {
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(identifier: voiceID) ?? voices.first ?? AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.94
        speaking = true
        synth.speak(utterance)
    }
    func stop() { stopRecording(); synth.stopSpeaking(at: .immediate); speaking = false }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard !self.synth.isSpeaking else { return }
            self.speaking = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
