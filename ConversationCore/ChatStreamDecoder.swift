import Foundation

enum ChatCompletion: Equatable {
    case complete, length, filtered, incomplete
    var interruption: Message.Interruption? {
        switch self {
        case .complete: return nil
        case .length: return .length
        case .filtered: return .filtered
        case .incomplete: return .incomplete
        }
    }
}

/// Shared by the actual transport and portable tests. Accepts UTF-8 one byte at
/// a time, bounds SSE data, and separates end-of-stream from successful completion.
struct ChatStreamDecoder {
    enum Output: Equatable { case text(String), finished(ChatCompletion) }
    private struct Chunk: Decodable {
        struct Choice: Decodable {
            struct Delta: Decodable { let content: String? }
            let index: Int?
            let delta: Delta?
            let finish_reason: String?
        }
        let choices: [Choice]
        private enum CodingKeys: String, CodingKey { case choices, error }
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            if container.contains(.error), try !container.decodeNil(forKey: .error) {
                throw CompanionError.invalidResponse
            }
            choices = try container.decode([Choice].self, forKey: .choices)
        }
    }
    private var events = EventDecoder()
    private var line = Data()
    private var afterCR = false
    private var firstLine = true
    private var eventBytes = 0
    private var characters = 0
    private var textBytes = 0
    private var hasVisibleText = false
    private var finishReason: String?
    private(set) var finished = false
    private let maximumEventBytes: Int
    private let maximumCharacters: Int
    private let maximumTextBytes: Int

    init(maximumEventBytes: Int = 1_048_576, maximumCharacters: Int = 64_000, maximumTextBytes: Int = 1_048_576) {
        self.maximumEventBytes = maximumEventBytes; self.maximumCharacters = maximumCharacters
        self.maximumTextBytes = maximumTextBytes
    }

    mutating func accept(_ byte: UInt8) throws -> Output? {
        guard !finished else { return nil }
        if afterCR { afterCR = false; if byte == 10 { return nil } }
        if byte == 13 { afterCR = true; return try endLine() }
        if byte == 10 { return try endLine() }
        line.append(byte)
        guard line.count <= maximumEventBytes else { throw CompanionError.invalidResponse }
        return nil
    }

    func endOfStream() throws {
        guard finished else { throw CompanionError.invalidResponse }
    }

    private mutating func endLine() throws -> Output? {
        guard var value = String(data: line, encoding: .utf8) else { throw CompanionError.invalidResponse }
        line.removeAll(keepingCapacity: true)
        if firstLine {
            firstLine = false
            if value.hasPrefix("\u{FEFF}") { value.removeFirst() }
        }
        if value.hasPrefix("data:") {
            eventBytes += value.utf8.count + 1
            guard eventBytes <= maximumEventBytes else { throw CompanionError.invalidResponse }
        }
        if value.isEmpty { eventBytes = 0 }
        guard let event = events.accept(value) else { return nil }
        if event.isEmpty { return nil }
        if event == "[DONE]" {
            let result: ChatCompletion
            switch finishReason {
            case nil, "stop": result = .complete
            case "length": result = .length
            case "content_filter": result = .filtered
            default: result = .incomplete
            }
            guard result != .complete || hasVisibleText else { throw CompanionError.invalidResponse }
            finished = true
            return .finished(result)
        }
        guard let chunk = try? JSONDecoder().decode(Chunk.self, from: Data(event.utf8)) else {
            throw CompanionError.invalidResponse
        }
        guard let choice = chunk.choices.first(where: { $0.index == 0 || $0.index == nil }) else { return nil }
        let text = choice.delta?.content ?? ""
        if finishReason != nil && !text.isEmpty { throw CompanionError.invalidResponse }
        if let reason = choice.finish_reason {
            if let previous = finishReason, previous != reason { throw CompanionError.invalidResponse }
            finishReason = reason
        }
        guard !text.isEmpty else { return nil }
        characters += text.count
        textBytes += text.utf8.count
        guard characters <= maximumCharacters, textBytes <= maximumTextBytes else { throw CompanionError.invalidResponse }
        hasVisibleText = hasVisibleText || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return .text(text)
    }
}
