#!/usr/bin/env python3
"""Validate the archived app, including its embedded WidgetKit extension."""
import pathlib
import plistlib
import sys


def validate(app):
    def plist(path):
        with path.open("rb") as stream:
            return plistlib.load(stream)

    info = plist(app / "Info.plist")
    assert info.get("NSSupportsLiveActivities") is True, "Live Activities not enabled in archived app"
    assert "audio" in info.get("UIBackgroundModes", []), "Background speech playback mode missing"
    schemes = [scheme for entry in info.get("CFBundleURLTypes", []) for scheme in entry.get("CFBundleURLSchemes", [])]
    assert "mira" in schemes, "Widget deep-link scheme missing"
    extension = app / "PlugIns" / "MiraWidgets.appex"
    widget = plist(extension / "Info.plist")
    assert widget["CFBundleIdentifier"] == info["CFBundleIdentifier"] + ".widgets", "Wrong widget bundle ID"
    assert widget["NSExtension"]["NSExtensionPointIdentifier"] == "com.apple.widgetkit-extension"
    for key in ("CFBundleVersion", "CFBundleShortVersionString"):
        assert widget[key] == info[key], f"Extension {key} must match containing app"
    assert (extension / widget["CFBundleExecutable"]).is_file(), "Widget executable missing"
    print("PASS: archived WidgetKit extension, versions, Live Activities and widget URLs")


if __name__ == "__main__":
    validate(pathlib.Path(sys.argv[1]))
