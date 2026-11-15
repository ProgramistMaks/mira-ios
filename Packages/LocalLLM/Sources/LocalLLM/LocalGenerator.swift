import Foundation
import llama

public struct LocalTurn: Sendable {
    public let role: String
    public let text: String
    public init(role: String, text: String) { self.role = role; self.text = text }
}

public enum LocalError: LocalizedError {
    case missingModel, load, context, promptTooLong, decode, busy
    public var errorDescription: String? {
        switch self {
        case .missingModel: return "Сначала загрузи локальную модель в настройках."
        case .load: return "Не удалось загрузить модель. Закрой другие приложения и попробуй снова."
        case .context: return "Не удалось выделить память для локального ИИ."
        case .promptTooLong: return "Сообщение слишком длинное для локальной модели. Сократи его."
        case .decode: return "Локальная модель не смогла продолжить ответ."
        case .busy: return "Локальная модель завершает предыдущий запрос. Попробуй через секунду."
        }
    }
}

/// No network dependencies. Every inference owns and releases its context/model.
public actor LocalGenerator {
    private static let initialized: Void = { llama_backend_init() }()
    private var busy = false
    public init() {}

    public func generate(modelURL: URL, turns: [LocalTurn], maxTokens: Int = 512,
                         onText: @escaping @Sendable (String) async -> Void) async throws -> Bool {
        guard !busy else { throw LocalError.busy }
        busy = true; defer { busy = false }
        try Task.checkCancellation()
        guard FileManager.default.fileExists(atPath: modelURL.path) else { throw LocalError.missingModel }
        _ = Self.initialized
        var modelParams = llama_model_default_params()
        #if targetEnvironment(simulator) || os(macOS)
        modelParams.n_gpu_layers = 0
        #else
        modelParams.n_gpu_layers = 99
        #endif
        guard let model = llama_model_load_from_file(modelURL.path, modelParams) else { throw LocalError.load }
        defer { llama_model_free(model) }
        try Task.checkCancellation()
        guard let vocab = llama_model_get_vocab(model) else { throw LocalError.load }
        var params = llama_context_default_params()
        params.n_ctx = 4096; params.n_batch = 512
        params.n_threads = Int32(min(4, ProcessInfo.processInfo.activeProcessorCount))
        params.n_threads_batch = params.n_threads
        guard let context = llama_init_from_model(model, params) else { throw LocalError.context }
        defer { llama_free(context) }
        guard let sampler = llama_sampler_init_greedy() else { throw LocalError.context }
        defer { llama_sampler_free(sampler) }

        var history = Array(turns.suffix(12))
        var tokens: [llama_token] = []
        while true {
            let prompt = Self.prompt(history)
            tokens = try Self.tokenize(prompt, vocab: vocab)
            if tokens.count <= 3072 { break }
            guard history.count > 1 else { throw LocalError.promptTooLong }
            history.removeFirst()
        }
        for start in stride(from: 0, to: tokens.count, by: 512) {
            try Task.checkCancellation()
            var chunk = Array(tokens[start..<min(start + 512, tokens.count)])
            let status = chunk.withUnsafeMutableBufferPointer {
                llama_decode(context, llama_batch_get_one($0.baseAddress, Int32($0.count)))
            }
            guard status == 0 else { throw LocalError.decode }
        }
        var pending = Data()
        for _ in 0..<max(1, min(maxTokens, 768)) {
            try Task.checkCancellation()
            var token = llama_sampler_sample(sampler, context, -1)
            if llama_vocab_is_eog(vocab, token) { return true }
            var buffer = [CChar](repeating: 0, count: 256)
            var capacity = Int32(buffer.count)
            var count = llama_token_to_piece(vocab, token, &buffer, capacity, 0, false)
            if count < 0 {
                buffer = [CChar](repeating: 0, count: Int(-count))
                capacity = Int32(buffer.count)
                count = llama_token_to_piece(vocab, token, &buffer, capacity, 0, false)
            }
            guard count >= 0 else { throw LocalError.decode }
            pending.append(contentsOf: buffer.prefix(Int(count)).map { UInt8(bitPattern: $0) })
            if let text = String(data: pending, encoding: .utf8) {
                if !text.isEmpty { await onText(text) }
                pending.removeAll(keepingCapacity: true)
            }
            let status = withUnsafeMutablePointer(to: &token) {
                llama_decode(context, llama_batch_get_one($0, 1))
            }
            guard status == 0 else { throw LocalError.decode }
        }
        return false // Explicit length stop; caller must not label the answer complete.
    }

    private static func tokenize(_ text: String, vocab: OpaquePointer) throws -> [llama_token] {
        let size = text.utf8.count
        guard size < 100_000 else { throw LocalError.promptTooLong }
        var tokens = [llama_token](repeating: 0, count: size + 8)
        let capacity = Int32(tokens.count)
        let count = llama_tokenize(vocab, text, Int32(size), &tokens, capacity, true, true)
        guard count > 0 else { throw LocalError.decode }
        return Array(tokens.prefix(Int(count)))
    }
    private static func prompt(_ turns: [LocalTurn]) -> String {
        let system = "Ты Мира, личный помощник. Отвечай по-русски, кратко и естественно. Ты работаешь на телефоне без интернета. Не выдумывай результаты поиска и выполненные действия. Для заметок, поиска и напоминаний предложи раздел Команды."
        var text = "<|im_start|>system\n\(system)<|im_end|>\n"
        for turn in turns {
            let role = turn.role == "assistant" ? "assistant" : "user"
            // Escape ChatML delimiters from conversation text, preserving role boundaries.
            let content = turn.text.replacingOccurrences(of: "<|", with: "‹|").replacingOccurrences(of: "|>", with: "|›")
            text += "<|im_start|>\(role)\n\(content)<|im_end|>\n"
        }
        return text + "<|im_start|>assistant\n"
    }
}
