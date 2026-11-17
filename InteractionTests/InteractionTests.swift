import XCTest
#if canImport(MiraInteractionCore)
@testable import MiraInteractionCore
#else
@testable import Companion
#endif

final class InteractionTests: XCTestCase {
    func testResizeAndLargeTextKeepSceneAndControlsInsideViewport() {
        for size in [CGSize(width: 320, height: 480), CGSize(width: 466, height: 678), CGSize(width: 890, height: 626), CGSize(width: 626, height: 890), CGSize(width: 844, height: 320)] {
            for textHeight in [200.0, 500.0] {
                let plan = CompanionLayoutPlan(size: size, preferredControlsHeight: textHeight)
                let bounds = CGRect(origin: .zero, size: size)
                for rect in [plan.header, plan.scene, plan.controls] { XCTAssertTrue(bounds.contains(rect)); XCTAssertGreaterThan(rect.height, 44) }
                XCTAssertFalse(plan.scene.intersects(plan.controls))
                XCTAssertGreaterThan(plan.scene.width, 100)
            }
        }
    }
    func testHingeNeverCrossesCharacterOrActionsInEitherOrientation() {
        for (size, hinge, expected) in [
            (CGSize(width: 890, height: 626), CGRect(x: 425, y: 0, width: 40, height: 626), CompanionLayoutPlan.Mode.book),
            (CGSize(width: 626, height: 890), CGRect(x: 0, y: 425, width: 626, height: 40), .tabletop)
        ] {
            let plan = CompanionLayoutPlan(size: size, divisions: [hinge])
            XCTAssertEqual(plan.mode, expected)
            for rect in [plan.scene, plan.header, plan.controls] { XCTAssertFalse(rect.intersects(hinge)); XCTAssertTrue(CGRect(origin: .zero, size: size).contains(rect)) }
        }
    }
    func testInactiveAndOutOfBoundsRegionsDoNotInventAFold() {
        let plan = CompanionLayoutPlan(size: CGSize(width: 890, height: 626), divisions: [CGRect(x: 445, y: 0, width: 0, height: 626), CGRect(x: 1000, y: 0, width: 30, height: 626)])
        XCTAssertEqual(plan.mode, .expanded)
    }
    func testCameraOcclusionClearsHeader() {
        let camera = CGRect(x: 300, y: 0, width: 50, height: 40)
        let plan = CompanionLayoutPlan(size: CGSize(width: 626, height: 890), occlusions: [camera])
        XCTAssertFalse(plan.header.intersects(camera))
    }
    func testRoutinePhrasesAreExactNotConversationIntentGuesses() {
        for phrase in ["Мира, режим учёбы", "режим учебы", "Запусти сценарий режим учёбы!"] {
            XCTAssertNotNil(MiraRoutine.matching(phrase, in: [.study]))
        }
        for phrase in ["не включай режим учёбы", "что такое режим учёбы", "вчера включил режим учёбы", "режим учёбы и удали всё"] {
            XCTAssertNil(MiraRoutine.matching(phrase, in: [.study]))
        }
    }
    func testImportedRoutineRejectsInvalidDurationsUnknownTypesAndDuplicateBlocks() throws {
        var routine = MiraRoutine.study
        routine.blocks[1].seconds = Int.max; XCTAssertThrowsError(try routine.validate())
        routine = .study; routine.blocks.append(routine.blocks[0]); XCTAssertThrowsError(try routine.validate())
        let data = try JSONEncoder().encode(MiraRoutine.study)
        let text = String(decoding: data, as: UTF8.self).replacingOccurrences(of: "\"focus\"", with: "\"run_shell\"")
        XCTAssertThrowsError(try JSONDecoder().decode(MiraRoutine.self, from: Data(text.utf8)))
        XCTAssertNoThrow(try JSONDecoder().decode(MiraRoutine.self, from: data).validate())
    }
    func testStudySurvivesRestartPauseAndTimePassing() throws {
        let start = Date(timeIntervalSince1970: 1000)
        var study = StudySession(seconds: 1500, now: start)
        study.pause(at: start.addingTimeInterval(100))
        study = try JSONDecoder().decode(StudySession.self, from: JSONEncoder().encode(study))
        XCTAssertEqual(study.remaining(at: start.addingTimeInterval(10000)), 1400)
        study.resume(at: start.addingTimeInterval(10000))
        XCTAssertEqual(study.remaining(at: start.addingTimeInterval(10100)), 1300)
        XCTAssertEqual(study.remaining(at: start.addingTimeInterval(20000)), 0)
    }
    private func glb(_ json: [String: Any]) throws -> Data {
        var content = try JSONSerialization.data(withJSONObject: json)
        while content.count % 4 != 0 { content.append(32) }
        var data = Data()
        for value in [UInt32(0x46546c67), 2, UInt32(20 + content.count), UInt32(content.count), 0x4e4f534a] {
            var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        data.append(content); return data
    }
    func testVRMRejectsTruncationExternalAssetsAndOversizedJSON() throws {
        let valid = try glb(["extensions": ["VRMC_vrm": ["humanoid": [:]]], "buffers": [["byteLength": 0]]])
        XCTAssertNoThrow(try VRMImport.validate(valid))
        XCTAssertThrowsError(try VRMImport.validate(valid.dropLast()))
        var badLength = valid; badLength.replaceSubrange(12..<16, with: [0xff, 0xff, 0xff, 0x7f])
        XCTAssertThrowsError(try VRMImport.validate(badLength))
        for uri in ["https://tracker.invalid/a.png", "../../private.png", "file:///private/data"] {
            XCTAssertThrowsError(try VRMImport.validate(glb(["extensions": ["VRM": ["humanoid": [:]]], "images": [["uri": uri]]])))
        }
        XCTAssertThrowsError(try VRMImport.validate(glb(["asset": ["version": "2.0"]])))
    }
}
