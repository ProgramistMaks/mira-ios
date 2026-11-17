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
            BodySettingsSections()
            if let catalogue = MotionCatalogue.bundled {
                Section {
                    MiraScreenIntro(title: "Живая Мира", detail: "Сочетаний в каталоге: \(catalogue.count.formatted()). Движения плавно сменяют друг друга, с паузами и без близких повторов жеста.", symbol: "sparkles")
                    Text("Каждый вариант сочетает жест, выражение лица, направление взгляда и опору тела.").font(.footnote).foregroundStyle(.secondary)
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
                            Text("При слушании — спокойные реакции, при ответе — объясняющие жесты. В паузах речи движения рук становятся сдержаннее. Настроение можно выбрать вручную.").font(.footnote).foregroundStyle(.secondary)
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


struct BodyCatalogue: Decodable {
    struct Channel: Decodable, Identifiable {
        let id, title, group: String
        let min, max, initial: Double
    }
    let version: Int
    let channels: [Channel]
    let modes: [MotionCatalogue.Entry]
    static let bundled: Self? = {
        guard let url = Bundle.main.url(forResource: "body-catalog", withExtension: "json", subdirectory: "Web"),
              let data = try? Data(contentsOf: url), let result = try? JSONDecoder().decode(Self.self, from: data),
              result.version == 1, result.channels.count <= 150,
              result.channels.allSatisfy({ $0.min.isFinite && $0.max.isFinite && $0.initial.isFinite && $0.min < $0.max }) else { return nil }
        return result
    }()
}

private struct BodySettingsSections: View {
    @AppStorage("bodyMode") private var mode = "natural"
    @AppStorage("bodyControls") private var controlsJSON = "{}"
    @AppStorage("secondaryPhysics") private var physics = true
    @AppStorage("physicsWind") private var wind = 0.0
    @AppStorage("physicsSoftness") private var softness = 0.5
    @AppStorage("hairDetail") private var detail = "standard"
    private var controls: [String: Double] {
        guard controlsJSON.utf8.count <= 32000 else { return [:] }
        return (try? JSONDecoder().decode([String: Double].self, from: Data(controlsJSON.utf8))) ?? [:]
    }
    var body: some View {
        if let catalogue = BodyCatalogue.bundled {
            Section("Тело и суставы") {
                Picker("Поведение", selection: $mode) { ForEach(catalogue.modes) { Text($0.title).tag($0.id) } }
                Text("В живом поведении взгляд опережает голову, руки и пальцы движутся с разным темпом. Мира меняет опору, расслабляет кисти и делает паузы. Для проверки отдельных движений выбери демонстрацию. Изменения видны после возврата к персонажу.").font(.footnote).foregroundStyle(.secondary)
                if mode == "manual" {
                    ForEach(Array(Set(catalogue.channels.map(\.group))).sorted(), id: \.self) { group in
                        DisclosureGroup(group) {
                            ForEach(catalogue.channels.filter { $0.group == group }) { channel in
                                VStack(alignment: .leading) {
                                    Text(channel.title).font(.subheadline)
                                    Slider(value: binding(channel), in: channel.min...channel.max)
                                        .accessibilityLabel(channel.title)
                                }
                            }
                        }
                    }
                    Text("Большие углы нескольких суставов одновременно могут вызвать пересечения. Колено управляет подъёмом стопы; это проверка подвижности, а не ходьба.").font(.footnote).foregroundStyle(.secondary)
                }
                Button("Вернуть живое поведение") { mode = "natural"; controlsJSON = "{}" }
            }
            Section("Волосы и одежда") {
                Toggle("Физика модели", isOn: $physics)
                if physics {
                    VStack(alignment: .leading) { Text("Мягкость"); Slider(value: $softness, in: 0...1) }
                    VStack(alignment: .leading) { Text("Ветер"); Slider(value: $wind, in: 0...1) }
                }
                Picker("Сетка волос", selection: $detail) {
                    Text("Стандартная").tag("standard")
                    Text("Плотная — выше нагрузка").tag("high")
                }
                Text("Плотная сетка добавляет вершины с весами скелета для более плавного изгиба. Физика Vita управляет волосами, юбкой и рукавами через кости и коллайдеры. Это не полная симуляция ткани; жёстко прикреплённые украшения следуют телу. Отдельного сустава копчика нет.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
    private func binding(_ channel: BodyCatalogue.Channel) -> Binding<Double> {
        Binding(get: { min(channel.max, max(channel.min, controls[channel.id] ?? channel.initial)) }, set: { value in
            guard value.isFinite else { return }
            var values = controls; values[channel.id] = min(channel.max, max(channel.min, value))
            if let data = try? JSONEncoder().encode(values) { controlsJSON = String(decoding: data, as: UTF8.self) }
        })
    }
}
