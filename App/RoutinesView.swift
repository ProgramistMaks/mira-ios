import SwiftUI
import UniformTypeIdentifiers

struct RoutinesView: View {
    @ObservedObject var companion: CompanionStore
    @ObservedObject var routines: RoutineStore
    @State private var editing: MiraRoutine?
    @State private var reviewing: MiraRoutine?
    @State private var deleting: MiraRoutine?
    @State private var importing = false
    var body: some View {
        List {
            Section {
                MiraScreenIntro(title: "Одна фраза — несколько действий", detail: "Собери сценарий из блоков. Локальные действия работают без ИИ. Облачный голос и поиск используют интернет.", symbol: "square.stack.3d.up")
                Button("Новый сценарий", systemImage: "plus") { editing = MiraRoutine(name: "", phrase: "", blocks: [RoutineBlock(kind: .say)]) }
                Button("Импорт из файла", systemImage: "square.and.arrow.down") { importing = true }
            }
            ForEach(routines.library) { routine in
                Section {
                    Text(routine.name).font(.headline)
                    Text("Скажи: «Мира, \(routine.phrase)»").font(.subheadline).foregroundStyle(.secondary)
                    Text("\(routine.blocks.count) блоков").font(.caption)
                    Button("Посмотреть и запустить", systemImage: "play") { reviewing = routine }.disabled(routines.runningID != nil)
                    Button("Изменить", systemImage: "slider.horizontal.3") { editing = routine }.disabled(routines.runningID == routine.id)
                    Button("Удалить", role: .destructive) { deleting = routine }.disabled(routines.runningID == routine.id)
                }
            }
            if !routines.progress.isEmpty {
                Section { Text(routines.progress); if routines.runningID != nil { Button("Остановить сценарий") { companion.cancel() } } }
            }
            if let error = routines.error { Section { MiraNotice(text: error, symbol: "exclamationmark.circle") } }
            Section { StudyControls(routines: routines) }
        }.miraForm().navigationTitle("Сценарии").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $editing) { RoutineEditor(routines: routines, initial: $0).miraSheet() }
            .sheet(item: $reviewing) { RoutineReview(companion: companion, routines: routines, routine: $0).miraSheet() }
            .confirmationDialog("Удалить сценарий?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), presenting: deleting) { routine in
                Button("Удалить", role: .destructive) { routines.remove(routine); deleting = nil }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                do {
                    let url = try result.get(); let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 128_000 else { throw RoutineError.invalid("Файл сценария слишком большой.") }
                    var routine = try JSONDecoder().decode(MiraRoutine.self, from: Data(contentsOf: url))
                    try routine.validate(); routine.id = UUID(); editing = routine
                } catch { routines.error = error.localizedDescription }
            }
    }
}

struct RoutineReview: View {
    @ObservedObject var companion: CompanionStore
    @ObservedObject var routines: RoutineStore
    let routine: MiraRoutine
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section { MiraScreenIntro(title: routine.name, detail: "Проверь все действия. Сценарий начнётся только после нажатия «Запустить».", symbol: "play.circle") }
                ForEach(Array(routine.blocks.enumerated()), id: \.element.id) { index, block in
                    MiraSettingsRow(title: "\(index + 1). \(block.kind.title)", detail: block.detail, symbol: block.kind.symbol)
                }
                Section {
                    Text("Таймер учёбы не включает системный «Фокус» и не закрывает другие приложения. При сворачивании цепочка останавливается; уже запущенный таймер сохраняется.").font(.footnote).foregroundStyle(.secondary)
                    Button("Запустить сценарий", systemImage: "play.fill") { routines.run(routine, companion: companion); dismiss() }
                        .disabled(routines.runningID != nil).accessibilityIdentifier("routine.run")
                }
            }.miraForm().navigationTitle("Запуск сценария").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
        }
    }
}

private struct RoutineDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var routine: MiraRoutine
    init(_ routine: MiraRoutine) { self.routine = routine }
    init(configuration: ReadConfiguration) throws {
        routine = try JSONDecoder().decode(MiraRoutine.self, from: configuration.file.regularFileContents ?? Data())
        try routine.validate()
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        try routine.validate(); return try FileWrapper(regularFileWithContents: JSONEncoder().encode(routine))
    }
}

private struct RoutineEditor: View {
    @ObservedObject var routines: RoutineStore
    @Environment(\.dismiss) private var dismiss
    @State private var routine: MiraRoutine
    @State private var error: String?
    @State private var exporting = false
    init(routines: RoutineStore, initial: MiraRoutine) { self.routines = routines; _routine = State(initialValue: initial) }
    var body: some View {
        NavigationStack {
            List {
                Section("Название и запуск") {
                    TextField("Название", text: $routine.name)
                    TextField("Фраза запуска", text: $routine.phrase)
                }
                Section("Блоки · сверху вниз") {
                    ForEach($routine.blocks) { $block in
                        VStack(alignment: .leading, spacing: 10) {
                            Label(block.kind.title, systemImage: block.kind.symbol).font(.headline)
                            switch block.kind {
                            case .say, .note, .search:
                                TextField("Текст", text: $block.text, axis: .vertical).lineLimit(2...5)
                            case .wait: Stepper("\(block.seconds) сек.", value: $block.seconds, in: 1...600)
                            case .focus:
                                Stepper("\(block.seconds / 60) мин.", value: $block.seconds, in: 60...10800, step: 60)
                            case .theme:
                                Picker("Тема", selection: $block.theme) { ForEach(MiraTheme.allCases) { Text($0.title).tag($0.rawValue) } }
                            }
                        }.padding(.vertical, 6)
                    }.onMove { routine.blocks.move(fromOffsets: $0, toOffset: $1) }
                        .onDelete { routine.blocks.remove(atOffsets: $0) }
                    Menu("Добавить блок", systemImage: "plus") {
                        ForEach(RoutineBlock.Kind.allCases) { kind in Button(kind.title, systemImage: kind.symbol) { routine.blocks.append(RoutineBlock(kind: kind)) } }
                    }.disabled(routine.blocks.count >= 16)
                }
                Section { Button("Экспортировать сценарий", systemImage: "square.and.arrow.up") { do { try routine.validate(); exporting = true } catch { self.error = error.localizedDescription } } }
            }.miraForm().navigationTitle("Редактор сценария").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                    ToolbarItem(placement: .primaryAction) { EditButton() }
                    ToolbarItem(placement: .confirmationAction) { Button("Сохранить") { do { try routines.save(routine); dismiss() } catch { self.error = error.localizedDescription } } }
                }
                .fileExporter(isPresented: $exporting, document: RoutineDocument(routine), contentType: .json, defaultFilename: "Mira-scenario") { if case let .failure(issue) = $0 { error = issue.localizedDescription } }
                .alert("Сценарий", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("Понятно") { error = nil } } message: { Text(error ?? "") }
        }
    }
}

struct StudyControls: View {
    @Environment(\.miraPalette) private var palette
    @ObservedObject var routines: RoutineStore
    var body: some View {
        if let study = routines.study {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = Int(ceil(study.remaining(at: context.date)))
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Label(remaining == 0 ? "Пора отдохнуть" : "Время для учёбы", systemImage: "timer").font(.subheadline.weight(.medium))
                        Spacer(minLength: 4)
                        Text(String(format: "%02d:%02d", remaining / 60, remaining % 60)).monospacedDigit()
                    }
                    HStack {
                        if remaining > 0 { Button(study.deadline == nil ? "Продолжить" : "Пауза") { routines.toggleStudy() }.frame(minHeight: 44) }
                        Spacer()
                        Button("Завершить") { routines.endStudy() }.frame(minHeight: 44)
                    }.font(.subheadline)
                }.padding(14).background(palette.surface, in: RoundedRectangle(cornerRadius: 16))
            }
        } else {
            Button("Учёба · 25 минут", systemImage: "timer") { do { try routines.startStudy(seconds: 1500) } catch { routines.error = error.localizedDescription } }
                .frame(minHeight: 44)
        }
    }
}
