import AVFoundation
import Speech
import Combine

@MainActor
final class VoiceService: NSObject, ObservableObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    @Published private(set) var speaking = false
    @Published private(set) var preparing = false
    var busy: Bool { speaking || preparing }
    let mouthEvents = CurrentValueSubject<Double, Never>(0)
    let inputLevels = CurrentValueSubject<Double, Never>(0)
    private var playbackCompletion: (() -> Void)?
    private var directUtterance: AVSpeechUtterance?
    private var speechText = ""
    private var speechVoiceID = ""
    private var endpoint = SpeechEndpoint()
    private var endpointClock: Task<Void, Never>?
    var onUtterance: ((String) -> Void)?
    private var player: AVAudioPlayer?
    private var render: SpeechRenderSession?
    private var playbackClock: Task<Void, Never>?
    private var playbackEnvelope: SpeechEnvelope?
    private var sceneActive = true
    private var renderTimeout: Task<Void, Never>?
    @Published private(set) var recording = false
    @Published private(set) var requestingRecording = false
    @Published private(set) var finishingRecording = false
    var recordingBusy: Bool { recording || requestingRecording || finishingRecording }
    @Published private(set) var transcript = ""
    var onError: ((String) -> Void)?
    var onTranscript: ((String) -> Void)?
    var onRecordingFinished: (() -> Void)?
    private let recordingAuthorization = MiraRecordingAuthorization()
    private let recognitionDrain = RecognitionDrain()
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
    func startRecording(offlineOnly: Bool = false, automatic: Bool = false) async throws {
        stop()
        let id = UUID(); generation = id
        requestingRecording = true
        defer {
            if generation == id {
                requestingRecording = false
                if !recording { onRecordingFinished?() }
            }
        }
        let authorization = await recordingAuthorization.request(speech: {
            await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
            }
        }, microphone: {
            await AVAudioApplication.requestRecordPermission()
        })
        guard id == generation, !Task.isCancelled else { return }
        if authorization == .cancelled { return }
        guard authorization == .authorized else { throw CompanionError.permission }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU")), recognizer.isAvailable else {
            throw CompanionError.noSpeech
        }
        if offlineOnly && !recognizer.supportsOnDeviceRecognition { throw CompanionError.offlineSpeechUnavailable }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.allowBluetooth])
        try session.setActive(true)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = offlineOnly
        self.request = request
        transcript = ""; endpoint = SpeechEndpoint()
        let node = engine.inputNode
        let format = node.outputFormat(forBus: 0)
        guard format.sampleRate > 0 && format.channelCount > 0 else { stopRecording(); throw CompanionError.noSpeech }
        let meter = MicrophoneLevelSampler()
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            request.append(buffer)
            if let level = meter.consume(buffer) {
                Task { @MainActor [weak self] in
                    guard let self, self.generation == id, self.recording else { return }
                    self.inputLevels.send(level)
                    self.endpoint.level(level, at: ProcessInfo.processInfo.systemUptime)
                }
            }
        }
        hasTap = true
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let finished = result?.isFinal == true
            Task { @MainActor in
                guard let self, self.generation == id else { return }
                if let text {
                    self.transcript = text; self.onTranscript?(text)
                    self.endpoint.transcript(text, at: ProcessInfo.processInfo.systemUptime)
                }
                if finished || (error != nil && self.finishingRecording) {
                    self.completeRecording()
                } else if let error {
                    self.stopRecording(); self.onError?(error.localizedDescription)
                }
            }
        }
        do { engine.prepare(); try engine.start(); recording = true }
        catch { stopRecording(); throw error }
        if automatic {
            endpointClock = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(100))
                    guard !Task.isCancelled, let self, self.generation == id, self.recording else { return }
                    if self.endpoint.shouldFinish(at: ProcessInfo.processInfo.systemUptime) {
                        self.finishRecording(); return
                    }
                }
            }
        }
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(55))
            guard !Task.isCancelled else { return }
            self?.finishRecording()
        }
    }
    func finishRecording() {
        guard recording, !finishingRecording else { return }
        let id = generation
        timeout?.cancel(); timeout = nil
        // Stop microphone I/O immediately, but retain recognition for its final text.
        engine.stop()
        if hasTap { engine.inputNode.removeTap(onBus: 0); hasTap = false }
        finishingRecording = true; recording = false; inputLevels.send(0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        recognitionDrain.begin { [weak self] in
            guard let self, self.generation == id, self.finishingRecording else { return }
            self.completeRecording()
        }
        request?.endAudio()
    }
    private func completeRecording() {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        stopRecording()
        if text.isEmpty { onError?(CompanionError.noSpeech.localizedDescription) }
        else { onUtterance?(text) }
    }
    func stopRecording() {
        let wasRecording = recordingBusy
        generation = UUID()
        recordingAuthorization.cancel()
        endpointClock?.cancel(); endpointClock = nil
        recognitionDrain.cancel()
        timeout?.cancel(); timeout = nil
        engine.stop()
        if hasTap { engine.inputNode.removeTap(onBus: 0); hasTap = false }
        request?.endAudio(); task?.cancel(); task = nil; request = nil
        recording = false; requestingRecording = false; finishingRecording = false
        inputLevels.send(0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if wasRecording { onRecordingFinished?() }
    }
    func say(_ text: String, voiceID: String, onFinished: (() -> Void)? = nil) throws {
        stop()
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard text.count <= 18000 else { throw SpeechPlaybackError.tooLong }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)
        playbackCompletion = onFinished; speechText = text; speechVoiceID = voiceID
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(identifier: voiceID) ?? voices.first ?? AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.94
        let id = UUID(); generation = id
        let render = SpeechRenderSession(); self.render = render
        preparing = true
        renderTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(45))
            guard !Task.isCancelled, let self, self.generation == id, self.preparing else { return }
            self.useDirectSpeechFallback()
        }
        synth.write(utterance) { [weak self, render] buffer in
            do {
                guard let pcm = buffer as? AVAudioPCMBuffer else { throw SpeechPlaybackError.unsupportedFormat }
                guard let result = try render.consume(pcm) else { return }
                Task { @MainActor [weak self] in
                    guard let self, self.generation == id else { return }
                    do { try self.play(result) }
                    catch { self.useDirectSpeechFallback() }
                }
            } catch {
                Task { @MainActor [weak self] in
                    guard let self, self.generation == id else { return }
                    self.useDirectSpeechFallback()
                }
            }
        }
    }
    private func useDirectSpeechFallback() {
        guard preparing, directUtterance == nil else { return }
        renderTimeout?.cancel(); renderTimeout = nil
        render?.cancel(); render = nil
        synth.stopSpeaking(at: .immediate)
        // Invalidate any late PCM callback before using actual system playback.
        generation = UUID()
        let utterance = AVSpeechUtterance(string: speechText)
        utterance.voice = AVSpeechSynthesisVoice(identifier: speechVoiceID) ?? voices.first ?? AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.94
        directUtterance = utterance
        let id = generation
        renderTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(180))
            guard !Task.isCancelled, let self, self.generation == id, self.directUtterance === utterance else { return }
            self.stop(); self.onError?(SpeechPlaybackError.timeout.localizedDescription)
        }
        synth.speak(utterance)
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.directUtterance === utterance else { return }
            self.preparing = false; self.speaking = true
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.directUtterance === utterance else { return }
            let completion = self.playbackCompletion
            self.stop(); completion?()
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.directUtterance === utterance else { return }
            self.stop(); self.onError?(SpeechPlaybackError.unavailable.localizedDescription)
        }
    }
    private func play(_ speech: RenderedSpeech) throws {
        renderTimeout?.cancel(); renderTimeout = nil
        let player = try AVAudioPlayer(contentsOf: speech.url)
        player.delegate = self
        guard player.prepareToPlay(), player.play() else { throw SpeechPlaybackError.unavailable }
        self.player = player; preparing = false; speaking = true
        playbackEnvelope = speech.envelope
        startPlaybackClock()
    }
    func setSceneActive(_ active: Bool) {
        sceneActive = active
        if active { startPlaybackClock() }
        else {
            playbackClock?.cancel(); playbackClock = nil
            mouthEvents.send(0)
        }
    }
    private func startPlaybackClock() {
        guard sceneActive, speaking, playbackClock == nil, let envelope = playbackEnvelope else { return }
        let id = generation
        playbackClock = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.generation == id, let player = self.player else { return }
                // Read actual playback time, never elapsed wall time or synthetic syllables.
                self.mouthEvents.send(player.isPlaying ? envelope.level(at: player.currentTime) : 0)
                try? await Task.sleep(for: .milliseconds(33))
            }
        }
    }
    func stop() {
        directUtterance = nil; playbackCompletion = nil
        synth.stopSpeaking(at: .immediate)
        playbackClock?.cancel(); playbackClock = nil
        renderTimeout?.cancel(); renderTimeout = nil
        player?.stop(); player = nil; playbackEnvelope = nil
        render?.cancel(); render = nil
        // Release playback before deactivating the shared audio session. Otherwise
        // setActive(false) may fail while AVAudioPlayer still owns audio I/O.
        stopRecording()
        speaking = false; preparing = false; mouthEvents.send(0)
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            let completion = flag ? self.playbackCompletion : nil
            self.stop()
            if !flag { self.onError?(SpeechPlaybackError.unavailable.localizedDescription) }
            completion?()
        }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.stop(); self.onError?(SpeechPlaybackError.unavailable.localizedDescription)
        }
    }
}
