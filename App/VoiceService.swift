import AVFoundation
import Speech
import Combine

@MainActor
final class VoiceService: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var speaking = false
    @Published private(set) var preparing = false
    var busy: Bool { speaking || preparing }
    let mouthEvents = CurrentValueSubject<Double, Never>(0)
    private var player: AVAudioPlayer?
    private var render: SpeechRenderSession?
    private var playbackClock: Task<Void, Never>?
    private var renderTimeout: Task<Void, Never>?
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

    override init() { super.init() }
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
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard text.count <= 18000 else { throw SpeechPlaybackError.tooLong }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(identifier: voiceID) ?? voices.first ?? AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.94
        let id = UUID(); generation = id
        let render = SpeechRenderSession(); self.render = render
        preparing = true
        renderTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(45))
            guard !Task.isCancelled, let self, self.generation == id, self.preparing else { return }
            self.stop(); self.onError?(SpeechPlaybackError.timeout.localizedDescription)
        }
        synth.write(utterance) { [weak self, render] buffer in
            do {
                guard let pcm = buffer as? AVAudioPCMBuffer else { throw SpeechPlaybackError.unsupportedFormat }
                guard let result = try render.consume(pcm) else { return }
                Task { @MainActor [weak self] in
                    guard let self, self.generation == id else { return }
                    do { try self.play(result, generation: id) }
                    catch { self.stop(); self.onError?(error.localizedDescription) }
                }
            } catch {
                let message = error.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self, self.generation == id else { return }
                    self.stop(); self.onError?(message)
                }
            }
        }
    }
    private func play(_ speech: RenderedSpeech, generation id: UUID) throws {
        renderTimeout?.cancel(); renderTimeout = nil
        let player = try AVAudioPlayer(contentsOf: speech.url)
        player.delegate = self
        guard player.prepareToPlay(), player.play() else { throw SpeechPlaybackError.unavailable }
        self.player = player; preparing = false; speaking = true
        playbackClock = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.generation == id, let player = self.player else { return }
                // Read actual playback time, never elapsed wall time or synthetic syllables.
                self.mouthEvents.send(player.isPlaying ? speech.envelope.level(at: player.currentTime) : 0)
                try? await Task.sleep(for: .milliseconds(33))
            }
        }
    }
    func stop() {
        stopRecording()
        synth.stopSpeaking(at: .immediate)
        playbackClock?.cancel(); playbackClock = nil
        renderTimeout?.cancel(); renderTimeout = nil
        player?.stop(); player = nil
        render?.cancel(); render = nil
        speaking = false; preparing = false; mouthEvents.send(0)
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.stop()
            if !flag { self.onError?(SpeechPlaybackError.unavailable.localizedDescription) }
        }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.stop(); self.onError?(SpeechPlaybackError.unavailable.localizedDescription)
        }
    }
}
