import Foundation

enum MiraActivityPhase: String, Codable, Hashable {
    case listening, thinking, preparing, speaking, finished, stopped, paused

    static func current(thinking: Bool, recording: Bool, preparing: Bool, speaking: Bool) -> Self? {
        if recording { return .listening }
        if thinking { return .thinking }
        if preparing { return .preparing }
        if speaking { return .speaking }
        return nil
    }

    var isRunning: Bool {
        switch self {
        case .listening, .thinking, .preparing, .speaking: return true
        case .finished, .stopped, .paused: return false
        }
    }
    var title: String {
        switch self {
        case .listening: return "Слушаю тебя"
        case .thinking: return "Обдумываю ответ"
        case .preparing: return "Готовлю голос"
        case .speaking: return "Озвучиваю ответ"
        case .finished: return "Готово"
        case .stopped: return "Остановлено"
        case .paused: return "Разговор приостановлен"
        }
    }
    var symbol: String {
        switch self {
        case .listening: return "mic.fill"
        case .thinking: return "ellipsis.bubble.fill"
        case .preparing: return "speaker.wave.1.fill"
        case .speaking: return "speaker.wave.2.fill"
        case .finished: return "checkmark"
        case .stopped: return "stop.fill"
        case .paused: return "pause.fill"
        }
    }
}
