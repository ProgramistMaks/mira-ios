import SwiftUI

struct CommandsView: View {
    @ObservedObject var store: CompanionStore
    let proposal: CommandProposal?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    private enum Action: String, CaseIterable { case note = "Заметка", reminder = "Напомнить", search = "Поиск" }
    @State private var action: Action = .note
    @State private var text: String
    @State private var completed = false
    init(store: CompanionStore, proposal: CommandProposal? = nil) {
        self.store = store; self.proposal = proposal
        _text = State(initialValue: proposal?.text ?? "")
    }
    private func allows(_ kind: CommandProposal.Kind) -> Bool {
        if let proposal { return proposal.kind == kind }
        switch (action, kind) {
        case (.note, .note), (.reminder, .reminder), (.search, .search): return true
        default: return false
        }
    }
    private var inputTitle: String {
        if allows(.search) { return "Что найти?" }
        if allows(.reminder) { return "О чём напомнить?" }
        return "Текст заметки"
    }
    private func acknowledge(_ detail: String, close: Bool = true) {
        if let proposal {
            guard !completed else { return }
            store.recordCommandResult(proposal, detail: detail); completed = true
            if close { dismiss() }
        } else { result = detail }
    }
    @State private var date = Date().addingTimeInterval(3600)
    @State private var confirmation = false
    @State private var saving = false
    @State private var result: String?
    @State private var hits: [SearchHit] = []
    @State private var searching = false
    @State private var searchTask: Task<Void, Never>?
    private var value: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if proposal != nil {
                        MiraScreenIntro(title: "Всё верно?", detail: "Проверь текст. Действие выполнится только после твоего подтверждения.", symbol: "checkmark.bubble")
                    } else {
                        MiraScreenIntro(title: "Небольшая помощь на каждый день", detail: "Сохрани мысль, поставь напоминание или найди информацию.", symbol: "square.stack.3d.up")
                        Picker("Действие", selection: $action) {
                            ForEach(Action.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.segmented).disabled(searching || saving)
                    }
                }
                Section(inputTitle) {
                    TextField(inputTitle, text: $text, axis: .vertical)
                        .lineLimit(3...6).accessibilityIdentifier("command.input")
                        .disabled(completed || searching || saving)
                    if allows(.search) {
                        Button(searching ? "Ищу…" : "Искать в Мире", systemImage: "sparkle.magnifyingglass") {
                            let query = value; searching = true; hits = []
                            searchTask = Task {
                                defer { searching = false }
                                do {
                                    let found = try await WebSearch().search(query, key: SecretStore.read(account: "tavily"))
                                    try Task.checkCancellation()
                                    hits = found
                                    if proposal != nil {
                                        acknowledge(found.isEmpty ? "По запросу «\(query)» ничего не найдено." :
                                            "По запросу «\(query)» найдены источники:\n" + found.map { "• \($0.title)\n\($0.url)" }.joined(separator: "\n"), close: false)
                                    }
                                    if found.isEmpty { result = "По этому запросу ничего не найдено." }
                                } catch { if !Task.isCancelled { result = error.localizedDescription } }
                            }
                        }.disabled(value.isEmpty || searching || completed)
                        Button("Открыть поиск в браузере", systemImage: "arrow.up.right.square") {
                            let query = value
                            var components = URLComponents(string: "https://www.google.com/search")!
                            components.queryItems = [URLQueryItem(name: "q", value: query)]
                            if let url = components.url {
                                openURL(url) { accepted in
                                    if !accepted { result = "Не удалось открыть браузер." }
                                    else if proposal != nil { acknowledge("Открыт поиск в браузере: «\(query)».") }
                                }
                            }
                        }.disabled(value.isEmpty || completed)
                    }
                    if allows(.note) {
                        Button("Сохранить заметку", systemImage: "note.text") {
                            do {
                                let note = value; try store.addNote(note)
                                acknowledge("Заметка сохранена в Мире: «\(note)»."); text = ""
                            }
                            catch { result = error.localizedDescription }
                        }.disabled(value.isEmpty || completed).accessibilityIdentifier("command.saveNote")
                    }
                }
                if allows(.search) && !hits.isEmpty {
                    Section("Источники · Tavily") {
                        ForEach(hits) { hit in
                            if let url = hit.safeURL {
                                VStack(alignment: .leading, spacing: 8) {
                                    MiraSourceLink(title: hit.title, url: url)
                                    Text(hit.content).font(.callout).lineLimit(6)
                                }.padding(.vertical, 6)
                            }
                        }
                    }
                }
                if allows(.reminder) {
                    Section("Напоминание") {
                        if proposal != nil { Text("Выбери дату и время: они не определяются из текста автоматически.").font(.footnote).foregroundStyle(.secondary) }
                        DatePicker("Когда", selection: $date, in: Date()...)
                        Button(saving ? "Создаю…" : "Создать напоминание", systemImage: "bell") { confirmation = true }
                            .disabled(value.isEmpty || saving || completed)
                    }
                }
                if store.notes.isEmpty && allows(.note) && proposal == nil {
                    Section {
                        MiraScreenIntro(title: "Здесь будут твои заметки", detail: "Напиши первую мысль выше. Она останется на этом устройстве.", symbol: "note.text")
                    }
                }
                if !store.notes.isEmpty && allows(.note) {
                    Section("Твои заметки") {
                        ForEach(store.notes) { note in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(note.text)
                                Text(note.created, style: .date).font(.caption).foregroundStyle(.secondary)
                            }.textSelection(.enabled)
                        }
                    }
                }
            }.miraForm()
            .navigationTitle(proposal?.title ?? "Команды").navigationBarTitleDisplayMode(.inline)
            .onDisappear { searchTask?.cancel() }
            .interactiveDismissDisabled(saving)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(proposal != nil && !completed ? "Отмена" : "Готово") { dismiss() }.disabled(saving)
                }
            }
            .confirmationDialog("Добавить «\(value)» на \(date.formatted(date: .abbreviated, time: .shortened))?",
                                isPresented: $confirmation, titleVisibility: .visible) {
                Button("Добавить в Напоминания") {
                    let title = value; let due = date; saving = true
                    Task {
                        defer { saving = false }
                        do {
                            try await store.addReminder(title, date: due)
                            acknowledge("Напоминание «\(title)» создано на \(due.formatted(date: .abbreviated, time: .shortened))."); text = ""
                        }
                        catch { result = error.localizedDescription }
                    }
                }
            }
            .alert("Команды", isPresented: Binding(get: { result != nil }, set: { if !$0 { result = nil } })) {
                Button("Понятно") { result = nil }
            } message: { Text(result ?? "") }
        }
    }
}
