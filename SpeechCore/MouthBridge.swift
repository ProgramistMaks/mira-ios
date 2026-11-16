import Foundation

struct MouthFrame: Equatable, Sendable {
    let level: Double
    /// Unix milliseconds, shared with JavaScript's Date.now().
    let sampledAt: Double
    let sequence: Int
}

/// At most one evaluation plus one replaceable sample per document. The callback
/// acknowledges delivery, never schedules another evaluation for every old sample.
@MainActor
final class MouthBridge {
    typealias Delivery = @MainActor (MouthFrame, @escaping @MainActor () -> Void) -> Void
    private let deliver: Delivery
    private let now: @MainActor () -> Double
    private var ready = false
    private var active = false
    private var sequence = 0
    private var pending: MouthFrame?
    private var inFlight: UUID?

    init(now: @escaping @MainActor () -> Double = { floor(Date().timeIntervalSince1970 * 1000) },
         deliver: @escaping Delivery) {
        self.now = now; self.deliver = deliver
    }
    func setState(ready: Bool, active: Bool) {
        guard ready else { reset(); return }
        let changed = !self.ready || self.active != active
        self.ready = true; self.active = active
        if changed { enqueue(0) }
    }
    func submit(_ level: Double) {
        guard ready, active else { return }
        enqueue(level)
    }
    func reset() {
        ready = false; active = false; pending = nil; inFlight = nil
        // Sequence survives reloads; acknowledgements from the old document are ignored.
    }
    private func enqueue(_ level: Double) {
        sequence += 1
        let timestamp = now()
        pending = MouthFrame(level: level.isFinite ? min(1, max(0, level)) : 0,
                             sampledAt: timestamp.isFinite ? timestamp : 0, sequence: sequence)
        drain()
    }
    private func drain() {
        guard ready, inFlight == nil, let next = pending else { return }
        pending = nil
        let timestamp = now(), age = timestamp - next.sampledAt
        let fresh = timestamp.isFinite && age >= 0 && age <= 180
        let frame = fresh ? next : MouthFrame(level: 0, sampledAt: timestamp.isFinite ? timestamp : 0,
                                              sequence: next.sequence)
        let id = UUID(); inFlight = id
        deliver(frame) { [weak self] in
            guard let self, self.inFlight == id else { return }
            self.inFlight = nil
            self.drain()
        }
    }
}
