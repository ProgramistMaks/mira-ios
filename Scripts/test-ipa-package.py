"""Packaging guard tests with synthetic fixtures; not native compilation evidence."""
import importlib.util
import pathlib
import plistlib
import struct
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("ipa", pathlib.Path(__file__).with_name("check-ipa.py"))
ipa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa)


def binary(platform=2, linked=False):
    commands = [struct.pack("<6I", 0x32, 24, platform, 0, 0, 0)]
    if linked:
        name = b"@rpath/llama.framework/llama\0"
        length = (24 + len(name) + 7) // 8 * 8
        commands.append(struct.pack("<6I", 0xC, length, 24, 0, 0, 0) + name + b"\0" * (length - 24 - len(name)))
    return struct.pack("<8I", 0xFEEDFACF, 0x0100000C, 0, 2, len(commands), sum(map(len, commands)), 0, 0) + b"".join(commands)


def fixture():
    info = {"CFBundleIdentifier": "app.personal.companion", "CFBundleExecutable": "Companion",
            "CFBundleVersion": "1", "CFBundleShortVersionString": "0.1", "MinimumOSVersion": "18.0",
            "NSSupportsLiveActivities": True, "UIBackgroundModes": ["audio"],
            "NSMicrophoneUsageDescription": "Microphone", "NSSpeechRecognitionUsageDescription": "Speech"}
    widget = {**info, "CFBundleIdentifier": "app.personal.companion.widgets", "CFBundleExecutable": "MiraWidgets",
              "NSExtension": {"NSExtensionPointIdentifier": "com.apple.widgetkit-extension"}}
    return {"Info.plist": plistlib.dumps(info), "Companion": binary(linked=True),
            "Frameworks/llama.framework/llama": binary(), "Web/character.vrm": b"glTFfixture",
            **{name: b"fixture" for name in ["Web/index.html", "Web/avatar.js", "Web/choreography.json", "Web/body-catalog.json", "Web/ASSET-LICENSE.md", "Web/avatar.js.LEGAL.txt"]},
            "PlugIns/MiraWidgets.appex/Info.plist": plistlib.dumps(widget),
            "PlugIns/MiraWidgets.appex/MiraWidgets": binary()}


class PackageTests(unittest.TestCase):
    def check(self, files):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "test.ipa"
            with zipfile.ZipFile(path, "w") as archive:
                for name, data in files.items():
                    archive.writestr("Payload/Companion.app/" + name, data)
            return ipa.validate(path)

    def test_complete_fixture_reports_contents_without_claiming_a_valid_signature(self):
        report = self.check(fixture())
        self.assertEqual(len(report["components"]), 5)
        self.assertEqual(report["signature"], "not validated by this checker")
        self.assertEqual(len(report["sha256"]), 64)

    def test_missing_components_are_rejected(self):
        for name in ["Web/choreography.json", "Web/body-catalog.json", "Web/character.vrm", "Frameworks/llama.framework/llama", "PlugIns/MiraWidgets.appex/MiraWidgets"]:
            with self.subTest(name=name):
                files = fixture(); del files[name]
                with self.assertRaisesRegex(ValueError, "Missing bundled component"):
                    self.check(files)

    def test_simulator_binary_cannot_be_packaged_as_iphone(self):
        for name in ["Companion", "Frameworks/llama.framework/llama", "PlugIns/MiraWidgets.appex/MiraWidgets"]:
            files = fixture(); files[name] = binary(platform=7, linked=True)
            with self.assertRaisesRegex(ValueError, "not an iOS device"):
                self.check(files)

    def test_unlinked_runtime_and_truncated_binary_are_rejected(self):
        files = fixture(); files["Companion"] = binary()
        with self.assertRaisesRegex(ValueError, "not linked"):
            self.check(files)
        files["Companion"] = binary(linked=True)[:40]
        with self.assertRaisesRegex(ValueError, "truncated"):
            self.check(files)

    def test_widget_mismatch_and_accidentally_bundled_weights_are_rejected(self):
        files = fixture(); name = "PlugIns/MiraWidgets.appex/Info.plist"
        info = plistlib.loads(files[name]); info["CFBundleVersion"] = "old"
        files[name] = plistlib.dumps(info)
        with self.assertRaisesRegex(ValueError, "mismatch"):
            self.check(files)
        files = fixture(); files["model.gguf"] = b"weights"
        with self.assertRaisesRegex(ValueError, "must not embed"):
            self.check(files)


if __name__ == "__main__":
    unittest.main()
