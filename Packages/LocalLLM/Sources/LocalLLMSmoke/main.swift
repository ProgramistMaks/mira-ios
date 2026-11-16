import Foundation
import LocalLLM

@main
struct Smoke {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { fatalError("Pass a verified model file path") }
        let collector = Collector()
        let completed = try await LocalGenerator().generate(modelURL: URL(fileURLWithPath: CommandLine.arguments[1]),
            turns: [LocalTurn(role: "user", text: "Сколько будет два плюс два? Ответь одним числом.")], maxTokens: 24) {
                await collector.append($0)
            }
        let response = await collector.value
        guard completed, response.trimmingCharacters(in: .whitespacesAndNewlines).contains("4"),
              !response.contains("<think>") else { fatalError("Unexpected or incomplete arithmetic response: \(response)") }
        print("LOCAL_INFERENCE_OK: \(response)")
    }
}
actor Collector {
    var value = ""
    func append(_ text: String) { value += text }
}
