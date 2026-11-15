import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var saved = false
    @State private var error: String?
    @State private var confirmDelete = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Голос") {
                    Toggle("Озвучивать ответы", isOn: $store.settings.speakReplies)
                    Picker("Голос", selection: $store.settings.voiceID) {
                        Text("Автоматически").tag("")
                        ForEach(voice.voices, id: \.identifier) { item in Text(item.name).tag(item.identifier) }
                    }
                    Button("Послушать голос") {
                        do { try voice.say("Привет. Я Мира. Рада тебя слышать.", voiceID: store.settings.voiceID) }
                        catch { self.error = error.localizedDescription }
                    }
                }
                Section {
                    TextField("Адрес API, включая /v1", text: $store.settings.baseURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Идентификатор модели", text: $store.settings.model)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("API-ключ", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(saved ? "Сохранено" : "Сохранить подключение") {
                        do { try store.saveSettings(key: key); saved = true }
                        catch { self.error = error.localizedDescription }
                    }
                } header: { Text("Подключение к ИИ") } footer: {
                    Text("Нужен сервис с потоковым Chat Completions API. Текст разговора отправляется выбранному сервису. Ключ хранится в защищённом хранилище iPhone. Стоимость запросов зависит от сервиса.")
                }
                Section("Данные") {
                    Text("История и заметки сохраняются на этом устройстве.").font(.footnote)
                    Button("Удалить историю разговора", role: .destructive) { confirmDelete = true }
                }
                Section("Персонаж") {
                    Text("Vita · VRoid Project / pixiv")
                    Link("Условия использования · CC0", destination: URL(string: "https://creativecommons.org/publicdomain/zero/1.0/")!)
                }
            }
            .navigationTitle("Настройки")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { voice.stop(); dismiss() } } }
            .onAppear { key = SecretStore.read() }
            .onDisappear { voice.stop(); store.persistPreferences() }
            .alert("Ошибка", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("Понятно") { error = nil }
            } message: { Text(error ?? "") }
            .confirmationDialog("Удалить весь разговор?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { store.clearConversation() }
            }
        }
    }
}
