import Foundation

/// Deliberately narrow offline commands. Free-form conversation is never treated
/// as permission to perform an action, and recognition itself has no side effects.
struct CommandProposal: Identifiable {
    enum Kind: Equatable { case note, reminder, search }
    let id = UUID()
    let kind: Kind
    let text: String
    let original: String
    var title: String {
        switch kind {
        case .note: return "Новая заметка"
        case .reminder: return "Новое напоминание"
        case .search: return "Поиск в интернете"
        }
    }
    static func parse(_ input: String) -> CommandProposal? {
        let prefix = #"^\s*(?:мира[,!:\s]+)?(?:пожалуйста[,\s]+)?"#
        let patterns: [(Kind, String)] = [
            (.note, #"(?:запиши|сохрани|добавь|создай)\s+заметку"#),
            (.reminder, #"(?:напомни(?:\s+мне)?+|создай\s+напоминание)"#),
            (.search, #"(?:найди|поищи)\s+в\s+интернете"#)
        ]
        let original = input.trimmingCharacters(in: .whitespacesAndNewlines)
        for (kind, verb) in patterns {
            guard let regex = try? NSRegularExpression(pattern: prefix + verb + #"(?:\s*:\s*|\s+)(.+)$"#,
                                                        options: [.caseInsensitive, .dotMatchesLineSeparators]),
                  let match = regex.firstMatch(in: original, range: NSRange(original.startIndex..., in: original)),
                  let range = Range(match.range(at: 1), in: original) else { continue }
            let text = String(original[range]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return CommandProposal(kind: kind, text: text, original: original)
        }
        return nil
    }
}
