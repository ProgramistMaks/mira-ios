import Foundation

/// Ends a recognized phrase only after both speech energy and text updates settle.
/// Times are monotonic; an empty microphone session never becomes a message.
struct SpeechEndpoint {
    private var lastText = ""
    private var textChangedAt: TimeInterval?
    private var voicedAt: TimeInterval?
    private var ended = false

    mutating func transcript(_ value: String, at time: TimeInterval) {
        guard time.isFinite, !ended else { return }
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value != lastText else { return }
        lastText = value; textChangedAt = time
    }
    mutating func level(_ value: Double, at time: TimeInterval) {
        guard time.isFinite, value.isFinite, !ended else { return }
        if value > 0.38 { voicedAt = time }
    }
    mutating func shouldFinish(at time: TimeInterval) -> Bool {
        guard !ended, time.isFinite, let textChangedAt,
              time - textChangedAt >= 1.35,
              time - (voicedAt ?? textChangedAt) >= 1.0 else { return false }
        ended = true
        return true
    }
}

/// One explicitly started, turn-taking conversation. Cancellation invalidates
/// callbacks from old recognition / generation / playback, including after restart.
struct AutomaticConversation {
    enum Phase: Equatable { case stopped, listening, answering, speaking }
    private(set) var phase: Phase = .stopped
    private(set) var id = UUID()
    var active: Bool { phase != .stopped }
    mutating func start() -> UUID { id = UUID(); phase = .listening; return id }
    mutating func stop() { id = UUID(); phase = .stopped }
    mutating func heard(_ text: String, session: UUID) -> Bool {
        guard session == id, phase == .listening,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        phase = .answering; return true
    }
    mutating func willSpeak(session: UUID) -> Bool {
        guard session == id, phase == .answering else { return false }
        phase = .speaking; return true
    }
    mutating func finishedSpeaking(session: UUID) -> Bool {
        guard session == id, phase == .speaking else { return false }
        phase = .listening; return true
    }
}
