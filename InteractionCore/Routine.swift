import Foundation

struct MiraRoutine: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var phrase: String
    var blocks: [RoutineBlock]
    func validate() throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 80,
              !phrase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, phrase.count <= 120,
              (1...16).contains(blocks.count), Set(blocks.map(\.id)).count == blocks.count else {
            throw RoutineError.invalid("Укажи название, фразу запуска и от 1 до 16 блоков.")
        }
        for block in blocks { try block.validate() }
    }
    static let study = MiraRoutine(name: "Режим учёбы", phrase: "режим учёбы", blocks: [
        RoutineBlock(kind: .say, text: "Давай сосредоточимся на одной задаче. У нас двадцать пять минут."),
        RoutineBlock(kind: .focus, seconds: 25 * 60)
    ])
    static func matching(_ input: String, in routines: [MiraRoutine]) -> MiraRoutine? {
        func normalize(_ text: String) -> String {
            text.lowercased().replacingOccurrences(of: "ё", with: "е")
                .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
                .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        }
        var text = normalize(input)
        if text.hasPrefix("мира,") { text = normalize(String(text.dropFirst(5))) }
        else if text.hasPrefix("мира ") { text = normalize(String(text.dropFirst(5))) }
        if text.hasPrefix("запусти сценарий ") { text = String(text.dropFirst("запусти сценарий ".count)) }
        return routines.first { normalize($0.phrase) == text }
    }
}

struct RoutineBlock: Codable, Identifiable, Equatable {
    enum Kind: String, Codable, CaseIterable, Identifiable {
        case say, wait, focus, note, theme, search
        var id: String { rawValue }
        var title: String {
            switch self {
            case .say: return "Произнести фразу"
            case .wait: return "Подождать"
            case .focus: return "Таймер учёбы"
            case .note: return "Сохранить заметку"
            case .theme: return "Сменить тему"
            case .search: return "Найти в интернете"
            }
        }
        var symbol: String {
            switch self {
            case .say: return "waveform"; case .wait: return "hourglass"; case .focus: return "timer"
            case .note: return "note.text"; case .theme: return "paintpalette"; case .search: return "globe"
            }
        }
    }
    var id = UUID()
    var kind: Kind
    var text = ""
    var seconds = 60
    var theme = "cream"
    var detail: String {
        switch kind {
        case .say, .note, .search: return text
        case .wait: return "\(seconds) сек."
        case .focus: return "\(seconds / 60) мин."
        case .theme: return ["cream": "Кремовая", "night": "Ночная", "rose": "Сакура", "sage": "Шалфей"][theme] ?? theme
        }
    }
    func validate() throws {
        switch kind {
        case .say, .note, .search:
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 2000 else {
                throw RoutineError.invalid("В блоке «\(kind.title)» нужен текст до 2000 символов.")
            }
        case .wait:
            guard (1...600).contains(seconds) else { throw RoutineError.invalid("Пауза: от 1 до 600 секунд.") }
        case .focus:
            guard (60...10800).contains(seconds) else { throw RoutineError.invalid("Учёба: от 1 до 180 минут.") }
        case .theme:
            guard ["cream", "night", "rose", "sage"].contains(theme) else { throw RoutineError.invalid("Неизвестная тема.") }
        }
    }
}

enum RoutineError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

struct StudySession: Codable, Equatable {
    var deadline: Date?
    var pausedSeconds: TimeInterval
    init(seconds: Int, now: Date = .now) {
        pausedSeconds = TimeInterval(min(10800, max(60, seconds)))
        deadline = now.addingTimeInterval(pausedSeconds)
    }
    func remaining(at date: Date) -> TimeInterval { max(0, deadline?.timeIntervalSince(date) ?? pausedSeconds) }
    mutating func pause(at date: Date) { pausedSeconds = remaining(at: date); deadline = nil }
    mutating func resume(at date: Date) { if deadline == nil && pausedSeconds > 0 { deadline = date.addingTimeInterval(pausedSeconds) } }
}
