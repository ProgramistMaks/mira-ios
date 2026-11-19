import SwiftUI

struct ConversationMessageView: View {
    @Environment(\.miraPalette) private var palette
    let message: Message
    let active: Bool
    let searching: Bool
    let canRestore: Bool
    let busy: Bool
    let restore: () -> Void
    private var fromUser: Bool { message.role == .user }
    var body: some View {
        HStack(spacing: 0) {
            if fromUser { Spacer(minLength: 30) }
            VStack(alignment: .leading, spacing: 12) {
                Label(fromUser ? "ТЫ" : "МИРА", systemImage: fromUser ? "person" : "sparkle")
                    .font(.system(size: 10, weight: .semibold)).tracking(1.3).foregroundStyle(palette.accent)
                if message.content.isEmpty && active {
                    HStack(spacing: 10) {
                        ProgressView().tint(palette.accent)
                        Text(searching ? "Ищу источники…" : "Мира думает…").font(.subheadline).foregroundStyle(palette.muted)
                    }
                } else if !message.content.isEmpty {
                    Text(message.content).textSelection(.enabled).font(.body).lineSpacing(4)
                }
                if let sources = message.sources, !sources.isEmpty {
                    Text("Источники").font(.caption.weight(.medium)).foregroundStyle(palette.muted)
                    ForEach(sources) { source in
                        if let url = source.safeURL { MiraSourceLink(title: source.title, url: url) }
                    }
                }
                if message.interrupted && !active {
                    MiraNotice(text: message.interruption?.title ?? "Ответ прерван", symbol: "pause.circle")
                        .accessibilityIdentifier("conversation.interrupted.\(message.id)")
                    if canRestore {
                        Button(action: restore) {
                            Label("Вернуть вопрос", systemImage: "arrow.uturn.backward")
                                .font(.subheadline).frame(minHeight: 44)
                        }.disabled(busy).accessibilityIdentifier("conversation.restore.\(message.id)")
                    }

                }
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(fromUser ? palette.honey.opacity(0.35) : palette.surface,
                            in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(palette.outline.opacity(0.7), lineWidth: 0.7))
            if !fromUser { Spacer(minLength: 12) }
        }
    }
}
