import Foundation

struct Message: Codable, Identifiable, Equatable {
    enum Role: String, Codable { case user, assistant }
    var id = UUID()
    let role: Role
    var content: String
    var interrupted = false
}

enum CompanionPhase: String { case idle, listening, thinking, speaking }
enum InferenceMode: String, Codable, CaseIterable { case local, cloud }

struct ConnectionSettings: Codable {
    var inferenceMode: InferenceMode? = .local
    var baseURL = ""
    var model = ""
    var voiceID = ""
    var speakReplies = true

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

struct ChatClient {
    private struct Request: Encodable {
        struct Entry: Encodable { let role: String; let content: String }
        let model: String
        let messages: [Entry]
        let stream = true
    }
    private struct Chunk: Decodable {
        struct Choice: Decodable {
            struct Delta: Decodable { let content: String? }
            let delta: Delta
        }
        let choices: [Choice]
    }

    func stream(settings: ConnectionSettings, key: String, history: [Message],
                onText: @escaping @MainActor (String) -> Void) async throws {
        guard !key.isEmpty else { throw CompanionError.configuration }
        var request = URLRequest(url: try settings.endpoint())
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let system = Request.Entry(role: "system", content: "Ты Мира, дружелюбный личный помощник. Отвечай по-русски, естественно и по делу. Ты не можешь самостоятельно управлять телефоном, искать в интернете или создавать напоминания. Не утверждай, что выполнила действие. Для действий предложи пользователю раздел Команды. Не выдумывай результаты поиска.")
        let entries = history.filter { !$0.interrupted && !$0.content.isEmpty }.suffix(40).map {
            Request.Entry(role: $0.role.rawValue, content: String($0.content.prefix(12000)))
        }
        request.httpBody = try JSONEncoder().encode(Request(model: settings.model, messages: [system] + entries))
        // A dedicated session prevents a redirect from forwarding credentials to another host.
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw CompanionError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw CompanionError.authorization }
        guard http.statusCode == 200 else { throw CompanionError.server(http.statusCode) }
        guard http.value(forHTTPHeaderField: "Content-Type")?.contains("text/event-stream") == true else {
            throw CompanionError.invalidResponse
        }
        var decoder = EventDecoder()
        var receivedText = false
        var totalCharacters = 0
        var lineBytes = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            if byte != 10 {
                lineBytes.append(byte)
                guard lineBytes.count <= 1_048_576 else { throw CompanionError.invalidResponse }
                continue
            }
            if lineBytes.last == 13 { lineBytes.removeLast() }
            guard let line = String(data: lineBytes, encoding: .utf8) else { throw CompanionError.invalidResponse }
            lineBytes.removeAll(keepingCapacity: true)
            guard let event = decoder.accept(line) else { continue }
            if event == "[DONE]" {
                guard receivedText else { throw CompanionError.invalidResponse }
                return
            }
            let chunk = try JSONDecoder().decode(Chunk.self, from: Data(event.utf8))
            if let text = chunk.choices.first?.delta.content, !text.isEmpty {
                totalCharacters += text.count
                guard totalCharacters <= 64000 else { throw CompanionError.invalidResponse }
                receivedText = true
                await onText(text)
            }
        }
        throw CompanionError.invalidResponse // Never treat a dropped connection as completion.
    }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
