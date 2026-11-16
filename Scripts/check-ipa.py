#!/usr/bin/env python3
"""Check the single-file iPhone package. This does not certify its code signature."""
import argparse
import hashlib
import json
import pathlib
import plistlib
import struct
import zipfile


def device_binary(data, label):
    if len(data) < 32:
        raise ValueError(f"{label}: missing Mach-O executable")
    magic, cpu, _, _, commands, size, _, _ = struct.unpack_from("<8I", data)
    if magic != 0xFEEDFACF or cpu != 0x0100000C:
        raise ValueError(f"{label}: expected an arm64 iPhone binary")
    if 32 + size > len(data):
        raise ValueError(f"{label}: truncated load commands")
    offset, platform, libraries = 32, None, []
    for _ in range(commands):
        if offset + 8 > 32 + size:
            raise ValueError(f"{label}: invalid load command")
        command, length = struct.unpack_from("<2I", data, offset)
        if length < 8 or offset + length > 32 + size:
            raise ValueError(f"{label}: invalid load-command length")
        if command == 0x32 and length >= 24:  # LC_BUILD_VERSION
            platform = struct.unpack_from("<I", data, offset + 8)[0]
        elif command == 0x25 and platform is None:  # LC_VERSION_MIN_IPHONEOS
            platform = 2
        if command in (0xC, 0x80000018, 0x8000001F, 0x80000023) and length >= 24:
            start = struct.unpack_from("<I", data, offset + 8)[0]
            if start < 24 or start >= length:
                raise ValueError(f"{label}: invalid library path")
            libraries.append(data[offset + start:offset + length].split(b"\0", 1)[0].decode())
        offset += length
    if platform != 2:
        raise ValueError(f"{label}: not an iOS device binary (platform={platform})")
    return libraries


def validate(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        if any(n.startswith("/") or ".." in pathlib.PurePosixPath(n).parts for n in names):
            raise ValueError("Invalid archive path")
        if archive.testzip() is not None:
            raise ValueError("Damaged ZIP data")
        roots = {n.split("/")[1] for n in names if n.startswith("Payload/") and len(n.split("/")) > 2}
        if len(roots) != 1 or not next(iter(roots)).endswith(".app"):
            raise ValueError("IPA must contain exactly one app in Payload")
        root = "Payload/" + next(iter(roots)) + "/"

        def read(relative):
            name = root + relative
            if name not in names:
                raise ValueError(f"Missing bundled component: {relative}")
            data = archive.read(name)
            if not data:
                raise ValueError(f"Empty bundled component: {relative}")
            return data

        info = plistlib.loads(read("Info.plist"))
        libraries = device_binary(read(info["CFBundleExecutable"]), "App")
        device_binary(read("Frameworks/llama.framework/llama"), "Local AI runtime")
        if "@rpath/llama.framework/llama" not in libraries:
            raise ValueError("App is not linked to its bundled local AI runtime")
        for relative in ("Web/index.html", "Web/avatar.js", "Web/ASSET-LICENSE.md", "Web/avatar.js.LEGAL.txt"):
            read(relative)
        if not read("Web/character.vrm").startswith(b"glTF"):
            raise ValueError("Character is not a binary glTF/VRM asset")
        widget_root = "PlugIns/MiraWidgets.appex/"
        widget = plistlib.loads(read(widget_root + "Info.plist"))
        device_binary(read(widget_root + widget["CFBundleExecutable"]), "Widgets")
        if widget["CFBundleIdentifier"] != info["CFBundleIdentifier"] + ".widgets":
            raise ValueError("Widget/app bundle IDs do not match")
        if widget.get("NSExtension", {}).get("NSExtensionPointIdentifier") != "com.apple.widgetkit-extension":
            raise ValueError("Widget extension declaration missing")
        for key in ("CFBundleVersion", "CFBundleShortVersionString"):
            if widget.get(key) != info.get(key):
                raise ValueError(f"Widget/app {key} mismatch")
        for key in ("NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription"):
            if not info.get(key):
                raise ValueError(f"Missing privacy description: {key}")
        if info.get("NSSupportsLiveActivities") is not True or "audio" not in info.get("UIBackgroundModes", []):
            raise ValueError("Live Activities/background audio configuration missing")
        if any(n.lower().endswith(".gguf") for n in names):
            raise ValueError("This compact IPA must not embed model weights")
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return {"bundle_id": info["CFBundleIdentifier"], "version": info["CFBundleShortVersionString"],
                "minimum_ios": info["MinimumOSVersion"], "bytes": pathlib.Path(path).stat().st_size,
                "sha256": digest.hexdigest(),
                "components": ["iPhone app", "VRM character", "renderer", "local AI runtime", "WidgetKit extension"],
                "model_weights": "downloaded in app", "signature": "not validated by this checker"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=pathlib.Path)
    parser.add_argument("--report", type=pathlib.Path)
    args = parser.parse_args()
    result = validate(args.ipa)
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.write_text(output)
    print(output, end="")
