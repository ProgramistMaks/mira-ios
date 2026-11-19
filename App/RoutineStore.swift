import SwiftUI

@MainActor
final class RoutineStore: ObservableObject {
    @Published private(set) var library: [MiraRoutine] = []
    @Published private(set) var study: StudySession?
    @Published private(set) var runningID: UUID?
    @Published private(set) var progress = ""
    @Published var error: String?
    private var task: Task<Void, Never>?
    private var execution: UUID?
    private var storage: LocalStore?
    init() {
        do {
            let storage = try LocalStore(); self.storage = storage
            library = try storage.read("routines.json", as: [MiraRoutine].self) ?? [.study]
            for routine in library { try routine.validate() }
            study = try storage.read("study.json", as: StudySession.self)
        } catch { self.error = error.localizedDescription }
    }
    func save(_ routine: MiraRoutine) throws {
        try routine.validate()
        guard !library.contains(where: { $0.id != routine.id && MiraRoutine.matching(routine.phrase, in: [$0]) != nil }) else {
            throw RoutineError.invalid("Эта фраза уже запускает другой сценарий.")
        }
        var next = library
        if let index = next.firstIndex(where: { $0.id == routine.id }) { next[index] = routine } else { next.append(routine) }
        guard let storage else { throw CompanionError.storage }
        try storage.write(next, name: "routines.json"); library = next
    }
    func remove(_ routine: MiraRoutine) {
        do {
            guard runningID != routine.id, let storage else { return }
            let next = library.filter { $0.id != routine.id }
            try storage.write(next, name: "routines.json"); library = next
        } catch { self.error = error.localizedDescription }
    }
    func startStudy(seconds: Int) throws {
        guard let storage else { throw CompanionError.storage }
        let next = StudySession(seconds: seconds)
        try storage.write(next, name: "study.json"); study = next
    }
    func toggleStudy() {
        guard var next = study else { return }
        if next.deadline == nil { next.resume(at: .now) } else { next.pause(at: .now) }
        do { guard let storage else { throw CompanionError.storage }; try storage.write(next, name: "study.json"); study = next }
        catch { self.error = error.localizedDescription }
    }
    func endStudy() {
        do { guard let storage else { throw CompanionError.storage }; try storage.write(Optional<StudySession>.none, name: "study.json"); study = nil }
        catch { self.error = error.localizedDescription }
    }
    func cancel() {
        execution = nil; task?.cancel(); task = nil; runningID = nil; progress = ""
    }
    func run(_ routine: MiraRoutine, companion: CompanionStore) {
        do { try routine.validate() } catch { self.error = error.localizedDescription; return }
        companion.cancel(); error = nil
        let id = UUID(); execution = id; runningID = routine.id
        task = Task { [weak self, weak companion] in
            guard let self, let companion else { return }
            defer { if self.execution == id { self.execution = nil; self.runningID = nil; self.task = nil } }
            do {
                for (index, block) in routine.blocks.enumerated() {
                    try Task.checkCancellation()
                    guard self.execution == id else { return }
                    self.progress = "\(index + 1)/\(routine.blocks.count) · \(block.kind.title)"
                    switch block.kind {
                    case .say:
                        var finished = false
                        try companion.voice.say(block.text, voiceID: companion.settings.voiceID) { finished = true }
                        while companion.voice.busy { try await Task.sleep(for: .milliseconds(100)) }
                        try Task.checkCancellation()
                        guard finished else { throw RoutineError.invalid("Фраза не была озвучена. Сценарий остановлен.") }
                    case .wait: try await Task.sleep(for: .seconds(block.seconds))
                    case .focus: try self.startStudy(seconds: block.seconds)
                    case .note: try companion.addNote(block.text)
                    case .theme: UserDefaults.standard.set(block.theme, forKey: "interfaceTheme")
                    case .search:
                        companion.error = nil
                        companion.searchWeb(block.text, speakReply: false)
                        while companion.thinking { try await Task.sleep(for: .milliseconds(100)) }
                        try Task.checkCancellation()
                        if let error = companion.error { throw RoutineError.invalid(error) }
                    }
                }
                try Task.checkCancellation()
                self.progress = "«\(routine.name)» выполнен"
            } catch {
                guard self.execution == id, !Task.isCancelled else { return }
                self.progress = "Сценарий остановлен"; self.error = error.localizedDescription
                companion.error = nil
            }
        }
    }
}
