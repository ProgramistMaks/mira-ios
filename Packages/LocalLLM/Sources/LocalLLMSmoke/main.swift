import Foundation
import LocalLLM

@main
struct Smoke {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { fatalError("Pass a verified model file path") }
        let collector = Collector()
        _ = try await LocalGenerator().generate(modelURL: URL(fileURLWithPath: CommandLine.arguments[1]),
            turns: [LocalTurn(role: "user", text: "Сколько будет два плюс два? Ответь одним числом.")], maxTokens: 24) {
                await collector.append($0)
            }
        let response = await collector.value
        guard !response.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fatalError("Empty inference") }
        print("LOCAL_INFERENCE_OK: \(response)")
    }
}
actor Collector {
    var value = ""
    func append(_ text: String) { value += text }
}
