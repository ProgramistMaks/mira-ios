import SwiftUI
import UniformTypeIdentifiers

struct ImportedCharacter: Codable, Identifiable {
    let id: String
    let name: String
}

enum CharacterFiles {
    static var directory: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MiraCharacters", isDirectory: true) }
    static func file(for id: String) -> URL? {
        guard UUID(uuidString: id) != nil else { return nil }
        return directory.appendingPathComponent(id + ".vrm")
    }
}

struct CharacterLibraryView: View {
    @AppStorage("characterID") private var selection = "vita"
    @State private var items: [ImportedCharacter] = []
    @State private var importing = false
    @State private var busy = false
    @State private var error: String?
    @State private var deletion: ImportedCharacter?
    var body: some View {
        List {
            Section {
                MiraScreenIntro(title: "Твой персонаж", detail: "Vita остаётся по умолчанию. Можно добавить свой VRM, в том числе вариант с другим костюмом.", symbol: "person.crop.rectangle")
                Button { selection = "vita" } label: { selectionRow("Vita", id: "vita") }
                Link("Vita · VRoid Project / pixiv · CC0", destination: URL(string: "https://creativecommons.org/publicdomain/zero/1.0/")!).font(.footnote)
            }
            Section("Мои персонажи") {
                ForEach(items) { item in
                    Button { selection = item.id } label: { selectionRow(item.name, id: item.id) }
                        .swipeActions { Button("Удалить", role: .destructive) { deletion = item } }
                }
                Button(busy ? "Импортирую…" : "Добавить VRM из Файлов", systemImage: "square.and.arrow.down") { importing = true }.disabled(busy)
                Text("Самодостаточный VRM 0.x / 1.0 до 64 МБ. Импорт сохраняет файл на iPhone; выбор персонажа отдельный. Сложные модели могут работать медленнее.").font(.footnote).foregroundStyle(.secondary)
            }
            if let error { Section { MiraNotice(text: error, symbol: "exclamationmark.circle") } }
        }.miraForm().navigationTitle("Персонажи").navigationBarTitleDisplayMode(.inline)
            .task { do { items = try LocalStore().read("characters.json", as: [ImportedCharacter].self) ?? [] } catch { self.error = error.localizedDescription } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [UTType(filenameExtension: "vrm") ?? .data]) { result in
                do {
                    let url = try result.get(); busy = true
                    Task {
                        defer { busy = false }
                        do {
                            let item = try await Self.copyCharacter(url)
                            let next = items + [item]
                            do { try LocalStore().write(next, name: "characters.json"); items = next }
                            catch { if let file = CharacterFiles.file(for: item.id) { try? FileManager.default.removeItem(at: file) }; throw error }
                        } catch { self.error = error.localizedDescription }
                    }
                } catch { self.error = error.localizedDescription }
            }
            .confirmationDialog("Удалить персонажа?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), presenting: deletion) { item in
                Button("Удалить", role: .destructive) {
                    do {
                        let next = items.filter { $0.id != item.id }
                        try LocalStore().write(next, name: "characters.json")
                        if selection == item.id { selection = "vita" }; items = next
                        if let file = CharacterFiles.file(for: item.id) { try FileManager.default.removeItem(at: file) }
                    } catch { self.error = error.localizedDescription }
                    deletion = nil
                }
            }
    }
    private func selectionRow(_ name: String, id: String) -> some View {
        HStack { Text(name); Spacer(); if selection == id { Image(systemName: "checkmark.circle.fill") } }.frame(minHeight: 44)
    }
    nonisolated private static func copyCharacter(_ url: URL) async throws -> ImportedCharacter {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= VRMImport.maximumBytes else { throw RoutineError.invalid("Размер VRM должен быть не больше 64 МБ.") }
        let data = try Data(contentsOf: url, options: .mappedIfSafe); try VRMImport.validate(data)
        let item = ImportedCharacter(id: UUID().uuidString, name: String(url.deletingPathExtension().lastPathComponent.prefix(80)))
        try FileManager.default.createDirectory(at: CharacterFiles.directory, withIntermediateDirectories: true)
        guard let target = CharacterFiles.file(for: item.id) else { throw CompanionError.storage }
        try data.write(to: target, options: [.atomic, .completeFileProtection]); return item
    }
}
