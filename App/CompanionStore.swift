import SwiftUI
import EventKit
import LocalLLM

struct Note: Codable, Identifiable {
    var id = UUID()
    let text: String
    var created = Date()
}

@MainActor
final class CompanionStore: ObservableObject {
    @Published var messages: [Message] = []
    @Published var settings = ConnectionSettings()
    @Published var notes: [Note] = []
    @Published var draft = ""
    @Published var error: String?
    @Published var proposedCommand: CommandProposal?
    @Published var thinking = false
    @Published var characterReady = false
    @Published var characterError: String?
    let voice = VoiceService()
    let localModel = LocalModelStore()
    private let localGenerator = LocalGenerator()
    private var storage: LocalStore?
    private var work: Task<Void, Never>?
    private var activeID: UUID?
    private let events = EKEventStore()

    init() {
        do {
            let store = try LocalStore(); storage = store
            messages = try store.read("conversation.json", as: [Message].self) ?? []
            settings = try store.read("settings.json", as: ConnectionSettings.self) ?? ConnectionSettings()
            notes = try store.read("notes.json", as: [Note].self) ?? []
        } catch { self.error = "Не удалось прочитать сохранённые данные. \(error.localizedDescription)" }
        voice.onError = { [weak self] in self?.error = $0 }
    }
    func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty && !thinking && !voice.recording else { return }
        guard text.count <= 12000 else { error = "Сообщение слишком длинное: максимум 12 000 символов."; return }
        if let proposal = CommandProposal.parse(text) {
            voice.stop(); proposedCommand = proposal; return
        }
        let mode = settings.inferenceMode ?? .cloud
        do {
            if mode == .local {
                guard localModel.installed else { throw LocalError.missingModel }
            } else {
                _ = try settings.endpoint()
                guard !SecretStore.read().isEmpty else { throw CompanionError.configuration }
            }
        }
        catch { self.error = error.localizedDescription; return }
        voice.stop()
        messages.append(Message(role: .user, content: text)); draft = ""
        let history = messages
        let reply = Message(role: .assistant, content: "", interrupted: true)
        messages.append(reply); saveConversation()
        thinking = true; activeID = reply.id
        let connection = settings; let key = SecretStore.read()
        let localSelection = localModel.selected
        work = Task { [weak self] in
            guard let self else { return }
            do {
                let receive: @Sendable (String) async -> Void = { [weak self] text in
                    await self?.append(text, to: reply.id)
                }
                var completed = true
                if mode == .local {
                    completed = try await self.localGenerator.generate(modelURL: LocalModelFile.installed(localSelection),
                        turns: history.filter { !$0.interrupted }.map { LocalTurn(role: $0.role.rawValue, text: $0.content) },
                        profile: localSelection.profile, onText: receive)
                } else {
                    try await ChatClient().stream(settings: connection, key: key, history: history) { [weak self] text in
                        self?.append(text, to: reply.id)
                    }
                }
                try Task.checkCancellation()
                guard self.activeID == reply.id,
                      let index = self.messages.firstIndex(where: { $0.id == reply.id }) else { return }
                self.messages[index].interrupted = !completed
                self.thinking = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if self.settings.speakReplies {
                    do { try self.voice.say(self.messages[index].content, voiceID: self.settings.voiceID) }
                    catch { self.error = error.localizedDescription }
                }
            } catch {
                guard self.activeID == reply.id else { return }
                self.thinking = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if !(error is CancellationError) { self.error = error.localizedDescription }
            }
        }
    }
    func recordCommandResult(_ proposal: CommandProposal, detail: String) {
        messages.append(Message(role: .user, content: proposal.original))
        messages.append(Message(role: .assistant, content: detail))
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == proposal.original { draft = "" }
        saveConversation()
    }
    private func append(_ text: String, to id: UUID) {
        guard activeID == id, let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].content += text
    }
    func cancel() {
        activeID = nil; work?.cancel(); work = nil; thinking = false
        voice.stop(); saveConversation()
    }
    func saveSettings(key: String) throws {
        _ = try settings.endpoint()
        guard let storage else { throw CompanionError.storage }
        try SecretStore.write(key.trimmingCharacters(in: .whitespacesAndNewlines))
        try storage.write(settings, name: "settings.json")
    }
    func persistPreferences() {
        do {
            guard let storage else { throw CompanionError.storage }
            try storage.write(settings, name: "settings.json")
        } catch { self.error = error.localizedDescription }
    }
    func saveConversation() {
        do {
            guard let storage else { throw CompanionError.storage }
            try storage.write(messages, name: "conversation.json")
        } catch { self.error = error.localizedDescription }
    }
    func clearConversation() { cancel(); messages.removeAll(); saveConversation() }
    func addNote(_ text: String) throws {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        guard let storage else { throw CompanionError.storage }
        let updated = [Note(text: value)] + notes
        try storage.write(updated, name: "notes.json"); notes = updated
    }
    func addReminder(_ title: String, date: Date) async throws {
        guard try await events.requestFullAccessToReminders() else { throw CompanionError.permission }
        guard let calendar = events.defaultCalendarForNewReminders() else { throw CompanionError.permission }
        let reminder = EKReminder(eventStore: events)
        reminder.title = title; reminder.calendar = calendar
        reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        reminder.addAlarm(EKAlarm(absoluteDate: date))
        try events.save(reminder, commit: true)
    }
}
