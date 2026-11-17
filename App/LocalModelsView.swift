import SwiftUI

struct LocalModelSection: View {
    @ObservedObject var model: LocalModelStore
    let busy: Bool
    var body: some View {
        Section("Локальная модель") {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "cpu").font(.title2).foregroundStyle(Palette.accent)
                    .frame(width: 36, height: 40).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.selected.title).font(.subheadline.weight(.semibold))
                    Text(model.installed ? "Модель загружена · \(model.selected.sizeLabel)" : "Нужна загрузка · \(model.selected.sizeLabel)")
                        .font(.footnote).foregroundStyle(Palette.muted)
                }
            }.padding(.vertical, 4)
            if model.downloading {
                ModelTransferStatus(model: model)
            } else if model.pausedBytes > 0 {
                Text(model.pausedBytes == model.selected.bytes ? "Файл скачан. Осталось проверить и установить." :
                     "Загрузка приостановлена. Можно продолжить.").font(.footnote).foregroundStyle(.secondary)
            }
            NavigationLink("Модели и загрузки") { LocalModelsView(model: model, busy: busy) }
                .accessibilityIdentifier("models.open")
        }
    }
}

struct LocalModelsView: View {
    @ObservedObject var model: LocalModelStore
    let busy: Bool
    @State private var query = ""
    @State private var installedOnly = false
    @State private var confirmDownload = false
    @State private var confirmDelete = false
    @State private var confirmLegacyDelete = false
    @State private var confirmDiscard = false
    private var memory: UInt64 { ProcessInfo.processInfo.physicalMemory }
    private var visibleModels: [LocalModelSpec] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return LocalModelCatalog.models.filter {
            (!installedOnly || model.installedIDs.contains($0.id)) && (text.isEmpty || "\($0.title) \($0.sizeLabel)".localizedCaseInsensitiveContains(text))
        }
    }
    var body: some View {
        List {
            Section {
                MiraScreenIntro(title: "ИИ на твоём iPhone", detail: "Выбери модель и загрузи её один раз. Дальше можно разговаривать без облачного сервиса.", symbol: "cpu")
                DisclosureGroup("О памяти и совместимости") {
                    Text("Оперативная память устройства: \(ByteCountFormatter.string(fromByteCount: Int64(memory), countStyle: .memory))")
                    Text("Метки ниже — предварительная оценка. iOS выделяет приложению только часть памяти. Даже рекомендуемая модель требует проверки на твоём устройстве; размер файла не равен расходу памяти.")
                        .font(.footnote).foregroundStyle(Palette.muted)
                }
                Picker("Показать модели", selection: $installedOnly) {
                    Text("Все модели").tag(false)
                    Text("Загруженные").tag(true)
                }.pickerStyle(.segmented)
            }
            if visibleModels.isEmpty {
                Section {
                    MiraScreenIntro(title: installedOnly ? "Пока нет загруженных моделей" : "Модель не найдена",
                                    detail: installedOnly ? "Открой «Все модели», чтобы выбрать и скачать первую." : "Попробуй другое название или сбрось фильтр.", symbol: "magnifyingglass")
                    Button("Показать все модели") { query = ""; installedOnly = false }
                }
            }
            ForEach(visibleModels) { item in
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 8) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.name).font(.headline)
                                Text(item.quantization).font(.caption.monospaced()).foregroundStyle(Palette.muted)
                            }
                            Spacer(minLength: 4)
                            MiraBadge(title: item.sizeLabel)
                        }
                        Text(item.guidanceText(physicalMemory: memory)).font(.footnote).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                        if model.installedIDs.contains(item.id) {
                            Label("Загружена", systemImage: "internaldrive")
                                .font(.footnote).foregroundStyle(.secondary)
                        } else if (model.savedBytes[item.id] ?? 0) > 0 && !(model.downloading && model.selected.id == item.id) {
                            Label(model.savedBytes[item.id] == item.bytes ? "Ожидает проверки" : "Загрузка на паузе",
                                  systemImage: model.savedBytes[item.id] == item.bytes ? "checkmark.shield" : "pause.circle")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        if model.selected.id == item.id {
                            Label("Выбрана", systemImage: "checkmark.circle.fill").foregroundStyle(Palette.accent)
                                .accessibilityIdentifier("models.selected.\(item.id)")
                        } else {
                            Button("Выбрать модель", systemImage: "checkmark.circle") { model.select(item) }
                                .disabled(busy || model.downloading)
                                .accessibilityIdentifier("models.select.\(item.id)")
                        }
                    }.padding(.vertical, 4)
                    if model.selected.id == item.id {
                        if model.downloading {
                            ModelTransferStatus(model: model)
                            Button("Приостановить") { model.pause() }.disabled(model.pausing)
                        } else if model.installed {
                            Button("Удалить с устройства", role: .destructive) { confirmDelete = true }.disabled(busy)
                        } else {
                            if model.pausedBytes > 0 {
                                Text("Сохранено \(ByteCountFormatter.string(fromByteCount: model.pausedBytes, countStyle: .decimal)) из \(item.sizeLabel)")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            Button(model.pausedBytes == item.bytes ? "Проверить и установить" :
                                   (model.pausedBytes > 0 ? "Продолжить по Wi-Fi" : "Скачать по Wi-Fi · \(item.sizeLabel)")) { confirmDownload = true }
                                .disabled(busy).accessibilityIdentifier("models.download")
                            if model.pausedBytes > 0 {
                                Button("Удалить незавершённую загрузку", role: .destructive) { confirmDiscard = true }
                                    .disabled(busy)
                            }
                        }
                        if let error = model.error { MiraNotice(text: error, symbol: "exclamationmark.circle") }
                    }
                    Link("Источник и лицензия Apache 2.0", destination: item.sourceURL).font(.caption)
                }.listRowBackground(model.selected.id == item.id ? Palette.honey.opacity(0.22) : Color.white.opacity(0.7))
            }
            if model.legacyInstalled {
                Section("Прежняя загрузка") {
                    Button("Удалить Qwen2.5 1.5B · 1,12 ГБ", role: .destructive) { confirmLegacyDelete = true }
                        .disabled(busy || model.downloading)
                }
            }
        }
        .miraForm()
        .navigationTitle("Модели").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Qwen, Gemma или размер модели")
        .alert(model.pausedBytes > 0 ? "Продолжить установку?" : "Загрузить модель?", isPresented: $confirmDownload) {
            Button(model.pausedBytes == model.selected.bytes ? "Проверить" : (model.pausedBytes > 0 ? "Продолжить" : "Скачать")) { model.download() }
            Button("Отмена", role: .cancel) { }
        } message: {
            if model.pausedBytes == model.selected.bytes {
                Text("Файл уже на устройстве. Перед установкой проверю его целостность; повторная загрузка не нужна.")
            } else {
                Text("\(model.selected.title) · \(model.selected.sizeLabel). При сворачивании загрузка приостановится; её можно продолжить позже. Для оставшейся части файла нужен ещё 1 ГБ свободного места в запасе.")
            }
        }
        .confirmationDialog("Удалить \(model.selected.title)? Для запуска понадобится скачать её заново.",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { model.remove() }
        }
        .confirmationDialog("Удалить прежнюю Qwen2.5 1.5B?", isPresented: $confirmLegacyDelete, titleVisibility: .visible) {
            Button("Удалить прежнюю модель", role: .destructive) { model.removeLegacy() }
        }
        .confirmationDialog("Удалить незавершённую загрузку? Следующая начнётся заново.", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Удалить загрузку", role: .destructive) { model.discardPartial() }
        }
    }
}

private struct ModelTransferStatus: View {
    @ObservedObject var model: LocalModelStore
    var body: some View {
        if model.pausing {
            ProgressView("Приостанавливаю…")
        } else if model.verifying {
            ProgressView(value: model.verificationProgress) {
                Text("Проверяю файл · \(Int(model.verificationProgress * 100))%")
                    .monospacedDigit()
            }
        } else {
            ProgressView(value: model.progress)
            Text("\(ByteCountFormatter.string(fromByteCount: model.receivedBytes, countStyle: .decimal)) из \(model.selected.sizeLabel) · \(Int(model.progress * 100))%")
                .font(.footnote).monospacedDigit()
            if model.bytesPerSecond > 0 {
                Text("\(ByteCountFormatter.string(fromByteCount: Int64(model.bytesPerSecond), countStyle: .decimal))/с")
                    .font(.caption).foregroundStyle(.secondary).monospacedDigit()
            }
        }
    }
}
