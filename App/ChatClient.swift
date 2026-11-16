import Foundation

struct ChatClient {
    private struct Request: Encodable {
        struct Entry: Encodable { let role: String; let content: String }
        let model: String
        let messages: [Entry]
        let stream = true
    }
    func stream(settings: ConnectionSettings, key: String, history: [Message],
                onText: @escaping @MainActor (String) -> Void) async throws -> ChatCompletion {
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
        guard http.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("text/event-stream") == true else {
            throw CompanionError.invalidResponse
        }
        var decoder = ChatStreamDecoder()
        for try await byte in bytes {
            try Task.checkCancellation()
            switch try decoder.accept(byte) {
            case .some(.text(let text)): await onText(text)
            case .some(.finished(let completion)): return completion
            case nil: break
            }
        }
        try decoder.endOfStream()
        throw CompanionError.invalidResponse // A completion would already have returned from the loop.
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
