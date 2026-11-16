import Foundation

enum VoiceConversationPhase: Equatable {
    case ready, authorizing, listening, finishing, thinking, preparing, speaking

    static func current(authorizing: Bool, recording: Bool, finishing: Bool,
                        thinking: Bool, preparing: Bool, speaking: Bool) -> Self {
        if authorizing { return .authorizing }
        if finishing { return .finishing }
        if recording { return .listening }
        if thinking { return .thinking }
        if preparing { return .preparing }
        if speaking { return .speaking }
        return .ready
    }
    var title: String {
        switch self {
        case .ready: return "Я рядом"
        case .authorizing: return "Готовлю микрофон"
        case .listening: return "Слушаю тебя"
        case .finishing: return "Дописываю твою фразу"
        case .thinking: return "Обдумываю ответ"
        case .preparing: return "Готовлю голос"
        case .speaking: return "Говорю с тобой"
        }
    }
    var microphoneTitle: String {
        switch self {
        case .ready: return "Говорить"
        case .authorizing: return "Отменить запись"
        case .listening: return "Закончить фразу"
        case .finishing: return "Оставить текущий текст"
        case .thinking, .preparing, .speaking: return "Перебить и говорить"
        }
    }
    var capturing: Bool { self == .authorizing || self == .listening || self == .finishing }
    var canInterrupt: Bool { self == .thinking || self == .preparing || self == .speaking }
    func canSend(_ text: String) -> Bool {
        self == .ready && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// Let Speech.framework deliver its final revision after the microphone is closed.
/// Cancellation/replacement invalidates even a timeout that has already awakened.
@MainActor
final class RecognitionDrain {
    private var pending: Task<Void, Never>?
    private var generation = UUID()
    private let wait: @Sendable () async throws -> Void
    init(wait: @escaping @Sendable () async throws -> Void = { try await Task.sleep(for: .seconds(2)) }) {
        self.wait = wait
    }
    func begin(onTimeout: @escaping @MainActor () -> Void) {
        cancel()
        let id = generation, wait = wait
        pending = Task { [weak self] in
            do { try await wait() } catch { return }
            guard let self, self.generation == id, !Task.isCancelled else { return }
            self.pending = nil
            onTimeout()
        }
    }
    func cancel() { generation = UUID(); pending?.cancel(); pending = nil }
    deinit { pending?.cancel() }
}
