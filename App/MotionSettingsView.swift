import SwiftUI

/// Built from the renderer's catalogue; native controls never invent a different count.
struct MotionCatalogue: Decodable {
    struct Entry: Decodable, Identifiable { let id: String; let title: String }
    let version: Int
    let count: Int
    let gestures, emotions, gazes, stances: [Entry]
    static let bundled: MotionCatalogue? = {
        guard let url = Bundle.main.url(forResource: "expression-catalog", withExtension: "json", subdirectory: "Web"),
              let data = try? Data(contentsOf: url), let catalogue = try? JSONDecoder().decode(Self.self, from: data),
              catalogue.version == 1,
              [catalogue.gestures, catalogue.emotions, catalogue.gazes, catalogue.stances].allSatisfy({ !$0.isEmpty && $0.count <= 128 }),
              catalogue.count == catalogue.gestures.count * catalogue.emotions.count * catalogue.gazes.count * catalogue.stances.count else { return nil }
        return catalogue
    }()
    func indices(_ id: Int) -> [Int] {
        var remaining = min(count - 1, max(0, id))
        let stance = remaining % stances.count; remaining /= stances.count
        let gaze = remaining % gazes.count; remaining /= gazes.count
        return [remaining / emotions.count, remaining % emotions.count, gaze, stance]
    }
    func identifier(_ indices: [Int]) -> Int {
        ((indices[0] * emotions.count + indices[1]) * gazes.count + indices[2]) * stances.count + indices[3]
    }
}

struct MotionSettingsView: View {
    @AppStorage("expressionsEnabled") private var enabled = true
    @AppStorage("expressionEmotion") private var emotion = "auto"
    @AppStorage("expressionIntensity") private var intensity = 0.7
    @AppStorage("expressionVariant") private var variant = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Form {
            if let catalogue = MotionCatalogue.bundled {
                Section {
                    MiraScreenIntro(title: "Живая Мира", detail: "\(catalogue.count.formatted()) сочетания жестов, эмоций, взгляда и опоры. Переходы плавные, а недавние варианты не повторяются в автоматическом режиме.", symbol: "sparkles")
                    Text("Это сочетания движений, а не \(catalogue.count.formatted()) отдельных записанных клипов.").font(.footnote).foregroundStyle(.secondary)
                    Toggle("Разнообразные движения и эмоции", isOn: $enabled)
                }
                if enabled {
                    Section("Выразительность") {
                        Slider(value: $intensity, in: 0.35...1) { Text("Выразительность") }
                        Text(intensity < 0.55 ? "Сдержанно" : intensity < 0.85 ? "Естественно" : "Выразительно")
                        Toggle("Подбирать автоматически", isOn: Binding(get: { variant < 0 }, set: { variant = $0 ? -1 : 0 }))
                        if variant < 0 {
                            Picker("Настроение", selection: $emotion) {
                                Text("По состоянию разговора").tag("auto")
                                ForEach(catalogue.emotions) { Text($0.title).tag($0.id) }
                            }
                            Text("При слушании — спокойные реакции, при ответе — объясняющие жесты. Можно выбрать настроение вручную.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    if variant >= 0 {
                        Section("Своё сочетание") {
                            dimension("Жест", entries: catalogue.gestures, index: 0, catalogue: catalogue)
                            dimension("Эмоция", entries: catalogue.emotions, index: 1, catalogue: catalogue)
                            dimension("Взгляд", entries: catalogue.gazes, index: 2, catalogue: catalogue)
                            dimension("Опора", entries: catalogue.stances, index: 3, catalogue: catalogue)
                            Text("Сочетание \(min(catalogue.count, max(0, variant) + 1)) из \(catalogue.count.formatted())").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    if reduceMotion { MiraNotice(text: "Включено «Уменьшение движения»: дополнительные жесты отключены, мимика остаётся спокойной.") }
                    Text("Изменения видны на главном экране. Доступная мимика импортированных персонажей зависит от самой модели.").font(.footnote).foregroundStyle(.secondary)
                    Button("Вернуть естественное поведение") { enabled = true; emotion = "auto"; intensity = 0.7; variant = -1 }
                }
            } else {
                MiraNotice(text: "Каталог движений не найден в сборке. Базовые анимации персонажа остаются доступны.")
            }
        }.miraForm().navigationTitle("Эмоции и движения").navigationBarTitleDisplayMode(.inline)
    }
    private func dimension(_ title: String, entries: [MotionCatalogue.Entry], index: Int, catalogue: MotionCatalogue) -> some View {
        Picker(title, selection: Binding(get: { catalogue.indices(variant)[index] }, set: { value in
            var indices = catalogue.indices(variant); indices[index] = value; variant = catalogue.identifier(indices)
        })) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { offset, entry in Text(entry.title).tag(offset) }
        }
    }
}
