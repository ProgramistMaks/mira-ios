import SwiftUI
import EventKit
import LocalLLM
import Combine

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
    @Published private(set) var automatic = AutomaticConversation()
    @Published private(set) var liveTranscript = ""
    @Published private(set) var searching = false
    @Published private(set) var cloudConfigured = false
    @Published private(set) var searchConfigured = false
    private var automaticCaptureSession: UUID?
    @Published var characterReady = false
    @Published var characterError: String?
    let voice = VoiceService()
    let localModel = LocalModelStore()
    let liveActivities = MiraLiveActivityController()
    private var activitySubscription: AnyCancellable?
    private var dictationDraft: MiraDictationDraft?
    private let localGenerator = LocalGenerator()
    private var storage: LocalStore?
    private var work: Task<Void, Never>?
    @Published private(set) var activeID: UUID?
    private let responseCheckpoint = ResponseCheckpoint()
    private let events = EKEventStore()
    private var spokenCommandID: UUID?

    init() {
        do {
            let store = try LocalStore(); storage = store
            messages = try store.read("conversation.json", as: [Message].self) ?? []
            settings = try store.read("settings.json", as: ConnectionSettings.self) ?? ConnectionSettings()
            notes = try store.read("notes.json", as: [Note].self) ?? []
        } catch { self.error = "Не удалось прочитать сохранённые данные. \(error.localizedDescription)" }
        refreshConnections()
        voice.onError = { [weak self] message in self?.failConversation(message) }
        voice.onUtterance = { [weak self] text in
            guard let self, let id = self.automaticCaptureSession else { return }
            self.automaticCaptureSession = nil
            guard self.automatic.heard(text, session: id) else { return }
            self.send(text, speakReply: true)
        }
        voice.onTranscript = { [weak self] text in
            guard let self else { return }
            if self.automaticCaptureSession != nil { self.liveTranscript = text }
            else if let dictation = self.dictationDraft { self.draft = dictation.applying(text) }
        }
        voice.onRecordingFinished = { [weak self] in self?.dictationDraft = nil }
        MiraActivityActions.stop = { [weak self] sessionID in
            guard let self, self.liveActivities.matches(sessionID: sessionID) else { return }
            self.cancel()
        }
        activitySubscription = Publishers.CombineLatest(
            Publishers.CombineLatest4($thinking,
                Publishers.CombineLatest3(voice.$recording, voice.$requestingRecording, voice.$finishingRecording)
                    .map { state in state.0 || state.1 || state.2 },
                voice.$preparing, voice.$speaking),
            $settings.map { $0.liveActivitiesEnabled ?? true }
        )
        // Coalesce synchronous voice handovers; don't end/recreate an activity
        // between thinking -> preparing -> speaking within the same run-loop turn.
        .debounce(for: .milliseconds(120), scheduler: RunLoop.main)
        .sink { [weak self] value in
            let (state, enabled) = value
            self?.liveActivities.update(phase: MiraActivityPhase.current(thinking: state.0, recording: state.1,
                                                                         preparing: state.2, speaking: state.3),
                                        enabled: enabled)
        }
    }
    func send(_ utterance: String? = nil, speakReply: Bool? = nil) {
        let text = (utterance ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty && !thinking && !voice.recordingBusy else { return }
        guard text.count <= 12000 else { failConversation("Сообщение слишком длинное: максимум 12 000 символов."); return }
        if let proposal = CommandProposal.parse(text) {
            if proposal.kind == .search {
                searchWeb(proposal.text, original: text, speakReply: speakReply ?? settings.speakReplies,
                          clearDraft: utterance == nil)
                return
            }
            automatic.stop(); automaticCaptureSession = nil
            voice.stop()
            spokenCommandID = speakReply == true ? proposal.id : nil
            proposedCommand = proposal; return
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
        catch { failConversation(error.localizedDescription); return }
        liveActivities.beginInteraction()
        voice.stop()
        let question = Message(role: .user, content: text)
        messages.append(question); if utterance == nil { draft = "" }
        let history = messages
        let reply = Message(role: .assistant, content: "", interrupted: true, replyTo: question.id)
        messages.append(reply); saveConversation()
        thinking = true; activeID = reply.id
        let connection = settings; let key = SecretStore.read()
        let shouldSpeak = speakReply ?? settings.speakReplies
        let localSelection = localModel.selected
        work = Task { [weak self] in
            guard let self else { return }
            do {
                let receive: @Sendable (String) async -> Void = { [weak self] text in
                    await self?.append(text, to: reply.id)
                }
                let completion: ChatCompletion
                if mode == .local {
                    let completed = try await self.localGenerator.generate(modelURL: LocalModelFile.installed(localSelection),
                        turns: history.filter { !$0.interrupted }.map { LocalTurn(role: $0.role.rawValue, text: $0.content) },
                        profile: localSelection.profile, onText: receive)
                    completion = completed ? .complete : .length
                } else {
                    completion = try await ChatClient().stream(settings: connection, key: key, history: history) { [weak self] text in
                        self?.append(text, to: reply.id)
                    }
                }
                try Task.checkCancellation()
                guard self.activeID == reply.id,
                      let index = self.messages.firstIndex(where: { $0.id == reply.id }) else { return }
                self.responseCheckpoint.cancel()
                self.messages[index].interrupted = completion != .complete
                self.messages[index].interruption = completion.interruption
                self.thinking = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if completion == .complete && shouldSpeak {
                    self.speakAnswer(self.messages[index].content)
                } else if self.automatic.active {
                    self.failConversation("Ответ не завершён. Разговор приостановлен; текст сохранён.")
                }
            } catch {
                guard self.activeID == reply.id else { return }
                self.responseCheckpoint.cancel()
                if let index = self.messages.firstIndex(where: { $0.id == reply.id }) {
                    self.messages[index].interruption = Task.isCancelled || error is CancellationError
                        ? .stopped : (error is URLError ? .connection : .incomplete)
                }
                self.thinking = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if !(error is CancellationError) { self.failConversation(error.localizedDescription) }
            }
        }
    }
    func refreshConnections() {
        cloudConfigured = (try? settings.endpoint()) != nil && !SecretStore.read().isEmpty
        searchConfigured = !SecretStore.read(account: "tavily").isEmpty
    }
    func startAutomaticConversation() async {
        guard !automatic.active, proposedCommand == nil else { return }
        refreshConnections()
        guard (settings.inferenceMode ?? .cloud) == .local ? localModel.installed : cloudConfigured else {
            failConversation("Сначала скачай локальную модель или подключи ИИ в настройках. Голос можно проверить кнопкой «Послушать Миру».")
            return
        }
        cancel()
        let id = automatic.start()
        await listenAutomatically(session: id)
    }
    private func listenAutomatically(session id: UUID) async {
        guard automatic.id == id, automatic.phase == .listening else { return }
        automaticCaptureSession = id; liveTranscript = ""
        liveActivities.beginInteraction()
        do {
            try await voice.startRecording(offlineOnly: settings.offlineRecognition, automatic: true)
            guard automatic.id == id else { return }
            if !voice.recording { automatic.stop(); automaticCaptureSession = nil }
        } catch {
            guard automatic.id == id else { return }
            failConversation(error.localizedDescription)
        }
    }
    func interruptAutomaticConversation() async {
        guard automatic.active else { return }
        cancel()
        let id = automatic.start()
        await listenAutomatically(session: id)
    }
    func disarmAutomaticConversation() {
        automatic.stop(); automaticCaptureSession = nil
    }
    private func speakAnswer(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            failConversation("ИИ вернул пустой ответ. Проверь подключение или выбранную модель."); return
        }
        let id = automatic.id
        let resumes = automatic.willSpeak(session: id)
        do {
            try voice.say(text, voiceID: settings.voiceID, onFinished: { [weak self] in
                guard resumes, let self, self.automatic.finishedSpeaking(session: id) else { return }
                Task { @MainActor [weak self] in await self?.listenAutomatically(session: id) }
            })
        } catch { failConversation(error.localizedDescription) }
    }
    private func failConversation(_ message: String) {
        automatic.stop(); automaticCaptureSession = nil
        voice.stop(); error = message
    }
    func previewVoice() {
        cancel(); liveActivities.beginInteraction()
        do { try voice.say("Привет! Я Мира. Так звучит мой голос. Давай поговорим.", voiceID: settings.voiceID) }
        catch { failConversation(error.localizedDescription) }
    }
    func searchWeb(_ query: String, original: String? = nil, speakReply: Bool = true, clearDraft: Bool = false) {
        guard !thinking, !voice.recordingBusy else { return }
        let key = SecretStore.read(account: "tavily")
        guard !key.isEmpty else {
            failConversation("Поиск ещё не подключён. Открой настройки поиска, сохрани ключ Tavily и нажми «Проверить поиск».")
            return
        }
        voice.stop(); liveActivities.beginInteraction()
        let question = Message(role: .user, content: original ?? query)
        let reply = Message(role: .assistant, content: "", interrupted: true, replyTo: question.id)
        messages.append(contentsOf: [question, reply]); if clearDraft { draft = "" }
        thinking = true; searching = true; activeID = reply.id; saveConversation()
        work = Task { [weak self] in
            guard let self else { return }
            do {
                let hits = try await WebSearch().search(query, key: key)
                try Task.checkCancellation()
                guard self.activeID == reply.id,
                      let index = self.messages.firstIndex(where: { $0.id == reply.id }) else { return }
                self.messages[index].sources = hits.map { SearchSource(title: $0.title, url: $0.url) }
                let body = hits.isEmpty ? "По запросу «\(query)» ничего не найдено." :
                    "Нашла источники по запросу «\(query)». Выдержки из результатов:\n\n" +
                    hits.prefix(3).enumerated().map { "[\($0.offset + 1)] \($0.element.title)\n\($0.element.content.prefix(600))" }.joined(separator: "\n\n")
                self.messages[index].content = body; self.messages[index].interrupted = false
                self.thinking = false; self.searching = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if speakReply {
                    let spoken = hits.first.map { "Первый источник: \($0.title). \($0.content.prefix(650)). Ссылки сохранены в разговоре." } ?? body
                    self.speakAnswer(spoken)
                }
            } catch {
                guard self.activeID == reply.id else { return }
                if let index = self.messages.firstIndex(where: { $0.id == reply.id }) {
                    self.messages[index].interruption = .connection
                }
                self.thinking = false; self.searching = false; self.activeID = nil; self.work = nil
                self.saveConversation()
                if !Task.isCancelled { self.failConversation(error.localizedDescription) }
            }
        }
    }
    func startRecording() async {
        guard !thinking, !voice.recordingBusy, proposedCommand == nil else { return }
        voice.stop()
        dictationDraft = MiraDictationDraft(original: draft)
        liveActivities.beginInteraction()
        do { try await voice.startRecording(offlineOnly: settings.offlineRecognition) }
        catch { self.error = error.localizedDescription }
    }
    func interruptAndRecord() async {
        guard !voice.recordingBusy, proposedCommand == nil else { return }
        cancel()
        await startRecording()
    }
    func replay(_ message: Message) {
        guard message.role == .assistant, !message.interrupted,
              !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !thinking, !voice.recordingBusy, !voice.busy else { return }
        liveActivities.beginInteraction()
        do { try voice.say(message.content, voiceID: settings.voiceID) }
        catch { self.error = error.localizedDescription }
    }
    func recordCommandResult(_ proposal: CommandProposal, detail: String) {
        messages.append(Message(role: .user, content: proposal.original))
        messages.append(Message(role: .assistant, content: detail))
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == proposal.original { draft = "" }
        saveConversation()
        if spokenCommandID == proposal.id {
            spokenCommandID = nil
            liveActivities.beginInteraction()
            do { try voice.say(detail, voiceID: settings.voiceID) }
            catch { self.error = error.localizedDescription }
        }
    }
    private func append(_ text: String, to id: UUID) {
        guard activeID == id, let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].content += text
        responseCheckpoint.schedule { [weak self] in
            guard let self, self.activeID == id else { return }
            self.saveConversation()
        }
    }
    func cancel(reason: Message.Interruption = .stopped) {
        automatic.stop(); automaticCaptureSession = nil; searching = false
        spokenCommandID = nil
        responseCheckpoint.cancel()
        if let id = activeID, let index = messages.firstIndex(where: { $0.id == id }) {
            messages[index].interruption = reason
        }
        activeID = nil; work?.cancel(); work = nil; thinking = false
        voice.stop(); saveConversation()
        liveActivities.finish()
    }
    func question(for replyID: UUID) -> String? {
        ConversationRecovery.question(for: replyID, in: messages)
    }
    @discardableResult
    func restoreQuestion(for replyID: UUID, replacingDraft: Bool = false) -> Bool {
        guard !thinking, !voice.recordingBusy,
              let text = ConversationRecovery.restoredQuestion(for: replyID, in: messages, draft: draft,
                                                               replacingDraft: replacingDraft) else { return false }
        draft = text
        return true
    }
    func saveSettings(key: String) throws {
        _ = try settings.endpoint()
        guard let storage else { throw CompanionError.storage }
        try SecretStore.write(key.trimmingCharacters(in: .whitespacesAndNewlines))
        try storage.write(settings, name: "settings.json")
        refreshConnections()
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
