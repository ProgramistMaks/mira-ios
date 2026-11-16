import Foundation

struct Message: Codable, Identifiable, Equatable, Sendable {
    enum Role: String, Codable, Sendable { case user, assistant }
    enum Interruption: String, Codable, Sendable {
        case stopped, background, connection, length, filtered, incomplete
        var title: String {
            switch self {
            case .stopped: return "Ответ остановлен"
            case .background: return "Ответ прерван при сворачивании"
            case .connection: return "Ответ прерван из-за ошибки подключения"
            case .length: return "Достигнут предел длины ответа"
            case .filtered: return "Сервис остановил ответ"
            case .incomplete: return "Ответ не завершён"
            }
        }
    }
    var id = UUID()
    let role: Role
    var content: String
    var interrupted = false
    // Optional fields preserve previously saved conversations.
    var replyTo: UUID?
    var interruption: Interruption?
}

enum CompanionPhase: String { case idle, listening, thinking, speaking }
enum InferenceMode: String, Codable, CaseIterable { case local, cloud }

struct ConnectionSettings: Codable {
    var inferenceMode: InferenceMode? = .local
    var baseURL = ""
    var model = ""
    var voiceID = ""
    var speakReplies = true
    // Optional so existing saved settings migrate without a decoding failure.
    var liveActivitiesEnabled: Bool? = true

    func endpoint() throws -> URL {
        guard var url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CompanionError.configuration
        }
        if url.lastPathComponent != "completions" {
            url = url.appendingPathComponent("chat/completions")
        }
        return url
    }
}

enum CompanionError: LocalizedError {
    case configuration, authorization, server(Int), invalidResponse, noSpeech, offlineSpeechUnavailable, permission, storage
    var errorDescription: String? {
        switch self {
        case .configuration: return "Укажи HTTPS-адрес API, модель и ключ в настройках подключения."
        case .authorization: return "Сервис не принял ключ. Проверь настройки подключения."
        case .server(let code): return "Сервис временно недоступен (\(code)). Попробуй ещё раз."
        case .invalidResponse: return "Сервис вернул неполный или неподдерживаемый ответ."
        case .noSpeech: return "Распознавание речи сейчас недоступно. Можно написать сообщение."
        case .offlineSpeechUnavailable: return "На этом устройстве недоступно локальное распознавание русской речи. В локальном режиме можно написать сообщение; запись в облако отправлена не будет."
        case .permission: return "Нет разрешения. Его можно включить в настройках iPhone."
        case .storage: return "Не удалось сохранить данные на устройстве."
        }
    }
}

/// SSE events may span multiple data lines. A blank line terminates an event.
struct EventDecoder {
    private var data: [String] = []
    mutating func accept(_ line: String) -> String? {
        if line.isEmpty {
            guard !data.isEmpty else { return nil }
            defer { data.removeAll(keepingCapacity: true) }
            return data.joined(separator: "\n")
        }
        if line.hasPrefix("data:") {
            var value = String(line.dropFirst(5))
            if value.first == " " { value.removeFirst() }
            data.append(value)
        }
        return nil
    }
}

