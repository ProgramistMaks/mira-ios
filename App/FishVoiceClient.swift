import AVFoundation

struct FishVoice: Decodable, Identifiable {
    let id: String
    let title: String
    let type: String
    let state: String
    enum CodingKeys: String, CodingKey { case id = "_id", title, type, state }
}

/// Fixed official endpoint, bounded responses, no cross-origin credential redirects.
private final class FishRedirectPolicy: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

struct FishVoiceClient {
    private func fetch(_ request: URLRequest, limit: Int) async throws -> Data {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 60; configuration.timeoutIntervalForResource = 120
        let session = URLSession(configuration: configuration, delegate: FishRedirectPolicy(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse else { throw SpeechPlaybackError.unavailable }
        guard response.statusCode == 200 else {
            throw RoutineError.invalid("Fish Audio: ошибка \(response.statusCode). Проверь ключ, доступ к голосу и баланс сервиса.")
        }
        guard response.expectedContentLength <= Int64(limit) else { throw SpeechPlaybackError.tooLong }
        var data = Data()
        for try await byte in bytes {
            if data.count % 8192 == 0 { try Task.checkCancellation() }
            guard data.count < limit else { throw SpeechPlaybackError.tooLong }
            data.append(byte)
        }
        try Task.checkCancellation(); return data
    }
    private func request(_ url: URL, key: String) throws -> URLRequest {
        guard !key.isEmpty else { throw RoutineError.invalid("Сохрани ключ Fish Audio в настройках голоса.") }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        return request
    }
    func voices(query: String, page: Int, key: String) async throws -> [FishVoice] {
        var components = URLComponents(string: "https://api.fish.audio/model")!
        components.queryItems = [URLQueryItem(name: "title", value: query), URLQueryItem(name: "page_size", value: "20"),
                                URLQueryItem(name: "page_number", value: String(max(1, page)))]
        let data = try await fetch(request(components.url!, key: key), limit: 2_000_000)
        struct Page: Decodable { let items: [FishVoice] }
        return try JSONDecoder().decode(Page.self, from: data).items.filter { $0.type == "tts" && $0.state == "trained" }
    }
    func render(text: String, reference: String, key: String, session: SpeechRenderSession) async throws -> RenderedSpeech {
        guard !reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RoutineError.invalid("Выбери голос из библиотеки Fish Audio или укажи его ID.")
        }
        var request = try request(URL(string: "https://api.fish.audio/v1/tts")!, key: key)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("s2-pro", forHTTPHeaderField: "model")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text, "reference_id": reference, "format": "wav", "sample_rate": 24000])
        let data = try await fetch(request, limit: 18_000_000)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        defer { try? FileManager.default.removeItem(at: url) }
        try data.write(to: url, options: .completeFileProtection)
        let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
        guard file.processingFormat.sampleRate > 0, file.processingFormat.channelCount <= 2,
              Double(file.length) / file.processingFormat.sampleRate <= 180 else { throw SpeechPlaybackError.tooLong }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096) else { throw SpeechPlaybackError.unsupportedFormat }
        while file.framePosition < file.length {
            try Task.checkCancellation()
            try file.read(into: buffer)
            guard buffer.frameLength > 0 else { throw SpeechPlaybackError.unavailable }
            _ = try session.consume(buffer)
        }
        try Task.checkCancellation(); buffer.frameLength = 0
        guard let rendered = try session.consume(buffer) else { throw CancellationError() }
        return rendered
    }
}
