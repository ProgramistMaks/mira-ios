import SwiftUI

struct MotionCatalogue: Decodable {
    struct Entry: Decodable, Identifiable { let id: String; let title: String }
    let version: Int
    let clips, emotions: [Entry]

    static let bundled: MotionCatalogue? = {
        guard let url = Bundle.main.url(forResource: "choreography", withExtension: "json", subdirectory: "Web"),
              let data = try? Data(contentsOf: url),
              let catalogue = try? JSONDecoder().decode(Self.self, from: data),
              catalogue.version == 1, !catalogue.clips.isEmpty else { return nil }
        return catalogue
    }()
}

struct MotionSettingsView: View {
    @AppStorage("bodyMode") private var bodyMode = "natural"
    @AppStorage("expressionsEnabled") private var enabled = true
    @AppStorage("expressionEmotion") private var emotion = "auto"
    @AppStorage("expressionIntensity") private var intensity = 0.7
    @AppStorage("motionClip") private var clip = "auto"
    @AppStorage("motionReplay") private var replay = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Form {
            if let catalogue = MotionCatalogue.bundled {
                Section("Движения Миры") {
                    Toggle("Жесты и реакции", isOn: $enabled)
                    if enabled {
                        Picker("Движение", selection: Binding(get: { clip }, set: { choice in
                            clip = choice
                            bodyMode = "natural"
                        })) {
                            Text("По ходу разговора").tag("auto")
                            ForEach(catalogue.clips) { Text($0.title).tag($0.id) }
                        }
                        if clip != "auto" {
                            Button("Повторить при возврате к Мире") {
                                bodyMode = "natural"
                                replay &+= 1
                            }
                        }
                    }
                    if reduceMotion {
                        MiraNotice(text: "Включено системное уменьшение движения. Мира сохраняет спокойную позу.")
                    }
                }
                Section("Мимика") {
                    Picker("Настроение", selection: $emotion) {
                        Text("По ходу разговора").tag("auto")
                        ForEach(catalogue.emotions) { Text($0.title).tag($0.id) }
                    }
                    Slider(value: $intensity, in: 0.35...1) { Text("Выразительность") }
                }
            } else {
                MiraNotice(text: "Не удалось открыть каталог движений.")
            }
            BodySettingsSections()
        }.miraForm().navigationTitle("Эмоции и движения").navigationBarTitleDisplayMode(.inline)
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
    @AppStorage("motionClip") private var motionClip = "auto"
    @AppStorage("expressionsEnabled") private var expressionsEnabled = true
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
                Button("Вернуть живое поведение") { mode = "natural"; controlsJSON = "{}"; motionClip = "auto"; expressionsEnabled = true }
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
