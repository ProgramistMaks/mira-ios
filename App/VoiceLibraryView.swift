import SwiftUI

struct VoiceLibraryView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @AppStorage("speechProvider") private var provider = "apple"
    @AppStorage("fishVoiceID") private var fishID = ""
    @State private var key = ""
    @State private var savedKey = ""
    @State private var query = ""
    @State private var results: [FishVoice] = []
    @State private var page = 1
    @State private var busy = false
    @State private var searched = false
    @State private var error: String?
    @State private var lookup: Task<Void, Never>?
    var body: some View {
        List {
            Section {
                Picker("Источник голоса", selection: $provider) {
                    Text("На iPhone").tag("apple"); Text("Fish Audio").tag("fish")
                }.pickerStyle(.segmented)
                Text(provider == "apple" ? "Установленные русские голоса iOS. Интернет для озвучивания не нужен." : "Облачный голос, как в роликах. Текст озвучиваемого ответа отправляется Fish Audio, в том числе при локальном ИИ. Запросы оплачиваются по тарифу сервиса.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if provider == "apple" {
                Section("Голоса на устройстве") {
                    Button("Автоматически") { voice.stop(); store.settings.voiceID = "" }
                    ForEach(voice.voices, id: \.identifier) { item in
                        Button { voice.stop(); store.settings.voiceID = item.identifier } label: {
                            HStack { Text(item.name); Spacer(); if store.settings.voiceID == item.identifier { Image(systemName: "checkmark") } }
                        }
                    }
                    Text("Дополнительные системные голоса загружаются в настройках iPhone: Универсальный доступ → Устный контент → Голоса.").font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                Section("Подключение Fish Audio") {
                    SecureField("API-ключ Fish Audio", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(busy)
                    Button("Сохранить ключ") {
                        do { let value = key.trimmingCharacters(in: .whitespacesAndNewlines); try SecretStore.write(value, account: "fish-audio"); savedKey = value }
                        catch { self.error = error.localizedDescription }
                    }.disabled(busy)
                    TextField("ID выбранного голоса", text: $fishID).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                Section("Библиотека голосов") {
                    TextField("Название голоса", text: $query).disabled(busy)
                    Button(busy ? "Ищу…" : "Найти голоса") { page = 1; search() }.disabled(busy || savedKey.isEmpty || savedKey != key.trimmingCharacters(in: .whitespacesAndNewlines))
                    ForEach(results) { item in
                        Button { voice.stop(); fishID = item.id } label: {
                            HStack { Text(item.title); Spacer(); if fishID == item.id { Image(systemName: "checkmark") } }
                        }
                    }
                    if searched && results.isEmpty { Text("Голоса не найдены. Попробуй другое название.").font(.footnote) }
                    if !results.isEmpty { Button("Следующая страница") { page += 1; search() }.disabled(busy) }
                    Link("Открыть библиотеку Fish Audio", destination: URL(string: "https://fish.audio/discovery")!)
                }
            }
            Section {
                Button(voice.busy ? "Остановить пример" : "Послушать выбранный голос") {
                    if voice.busy { voice.stop() } else {
                        do { try voice.say("Привет. Я Мира. Давай поговорим.", voiceID: store.settings.voiceID) }
                        catch { self.error = error.localizedDescription }
                    }
                }
                Text("В разговорном режиме ответы всегда звучат автоматически. Здесь можно только выбрать и проверить голос.").font(.footnote).foregroundStyle(.secondary)
            }
            if let error { Section { MiraNotice(text: error, symbol: "exclamationmark.circle") } }
        }.miraForm().navigationTitle("Библиотека голосов").navigationBarTitleDisplayMode(.inline)
            .onAppear { key = SecretStore.read(account: "fish-audio"); savedKey = key }
            .onChange(of: provider) { _, _ in voice.stop(); lookup?.cancel() }
            .onDisappear { lookup?.cancel(); voice.stop(); store.persistPreferences() }
    }
    private func search() {
        busy = true; error = nil; searched = false
        let text = query, requestedPage = page, saved = savedKey
        lookup = Task {
            defer { busy = false }
            do { let found = try await FishVoiceClient().voices(query: text, page: requestedPage, key: saved); try Task.checkCancellation(); results = found; searched = true }
            catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
