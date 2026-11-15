import SwiftUI

struct CommandsView: View {
    @ObservedObject var store: CompanionStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var text = ""
    @State private var date = Date().addingTimeInterval(3600)
    @State private var confirmation = false
    @State private var saving = false
    @State private var result: String?
    private var value: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Что сделать?") {
                    TextField("Запрос, заметка или напоминание", text: $text, axis: .vertical)
                        .lineLimit(3...6).accessibilityIdentifier("command.input")
                    Button("Найти в интернете", systemImage: "magnifyingglass") {
                        var components = URLComponents(string: "https://www.google.com/search")!
                        components.queryItems = [URLQueryItem(name: "q", value: value)]
                        if let url = components.url {
                            openURL(url) { accepted in
                                if !accepted { result = "Не удалось открыть браузер." }
                            }
                        }
                    }.disabled(value.isEmpty)
                    Button("Сохранить заметку", systemImage: "note.text") {
                        do { try store.addNote(value); text = ""; result = "Заметка сохранена в Мире." }
                        catch { result = error.localizedDescription }
                    }.disabled(value.isEmpty).accessibilityIdentifier("command.saveNote")
                }
                Section("Напоминание") {
                    DatePicker("Когда", selection: $date, in: Date()...)
                    Button(saving ? "Создаю…" : "Создать напоминание", systemImage: "bell") { confirmation = true }
                        .disabled(value.isEmpty || saving)
                }
                if !store.notes.isEmpty {
                    Section("Твои заметки") {
                        ForEach(store.notes) { note in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(note.text)
                                Text(note.created, style: .date).font(.caption).foregroundStyle(.secondary)
                            }.textSelection(.enabled)
                        }
                    }
                }
            }.navigationTitle("Команды")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .confirmationDialog("Добавить «\(value)» на \(date.formatted(date: .abbreviated, time: .shortened))?",
                                isPresented: $confirmation, titleVisibility: .visible) {
                Button("Добавить в Напоминания") {
                    let title = value; let due = date; saving = true
                    Task {
                        defer { saving = false }
                        do { try await store.addReminder(title, date: due); result = "Напоминание создано."; text = "" }
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
