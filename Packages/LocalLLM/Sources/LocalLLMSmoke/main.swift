import Foundation
import LocalLLM

@main
struct Smoke {
    static func main() async throws {
        guard (2...3).contains(CommandLine.arguments.count) else { fatalError("Pass a verified model file path") }
        let profile = CommandLine.arguments.count == 3 ? LocalPromptStyle(rawValue: CommandLine.arguments[2])! : .qwen35
        let collector = Collector()
        let completed = try await LocalGenerator().generate(modelURL: URL(fileURLWithPath: CommandLine.arguments[1]),
            turns: [LocalTurn(role: "user", text: "Сколько будет два плюс два? Ответь одним числом.")], profile: profile, maxTokens: 32) {
                await collector.append($0)
            }
        let response = await collector.value
        guard completed, response.trimmingCharacters(in: .whitespacesAndNewlines).range(of: #"^\*{0,2}4\*{0,2}[.!]?$"#, options: .regularExpression) != nil,
              !response.contains("<think>") else { fatalError("Unexpected or incomplete arithmetic response: \(response)") }
        print("LOCAL_INFERENCE_OK (\(profile.rawValue)): \(response)")
    }
}
actor Collector {
    var value = ""
    func append(_ text: String) { value += text }
}
