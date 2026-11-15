import SwiftUI
import EventKit

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
    @Published var thinking = false
    @Published var characterReady = false
    @Published var characterError: String?
    let voice = VoiceService()
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
        do { _ = try settings.endpoint(); guard !SecretStore.read().isEmpty else { throw CompanionError.configuration } }
        catch { self.error = error.localizedDescription; return }
        voice.stop()
        messages.append(Message(role: .user, content: text)); draft = ""
        let history = messages
        let reply = Message(role: .assistant, content: "", interrupted: true)
        messages.append(reply); saveConversation()
        thinking = true; activeID = reply.id
        let connection = settings; let key = SecretStore.read()
        work = Task { [weak self] in
            guard let self else { return }
            do {
                try await ChatClient().stream(settings: connection, key: key, history: history) { [weak self] text in
                    guard let self, self.activeID == reply.id,
                          let index = self.messages.firstIndex(where: { $0.id == reply.id }) else { return }
                    self.messages[index].content += text
                }
                try Task.checkCancellation()
                guard self.activeID == reply.id,
                      let index = self.messages.firstIndex(where: { $0.id == reply.id }) else { return }
                self.messages[index].interrupted = false
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
