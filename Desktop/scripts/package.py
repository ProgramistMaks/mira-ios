"""Build Mira's portable Windows x64 directory and archive using pinned upstream releases."""

import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, tempfile, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "Desktop"
HF = "https://huggingface.co/"
GH = "https://github.com/"
PIPER = "rhasspy/piper-voices/resolve/0ca208afc2a2ee102b1e961e72e0a7e4907be3d0/ru/ru_RU/ruslan/medium/"
ASSETS = {
    "doom-v0.1.0.wasm": (
        GH + "jacobenget/doom.wasm/releases/download/v0.1.0/doom-v0.1.0.wasm",
        "8edfe49a7583fd975199969302d8e9adcf8e714d0af72bf3e672f991fd810faa",
    ),
    "chocolate-3.1.1-win64.zip": (
        GH
        + "chocolate-doom/chocolate-doom/releases/download/chocolate-doom-3.1.1/chocolate-doom-3.1.1-win64.zip",
        "58c34c61ae954493fce5ff01fd553898240a0de25658aa97b43ac9510c49581f",
    ),
    "chocolate-3.1.1-source.zip": (
        "https://codeload.github.com/chocolate-doom/chocolate-doom/zip/refs/tags/chocolate-doom-3.1.1",
        "74bcc04d2ca4156cfd2ad7c07c5a515ba96cd4714535439b4f6af417b20d7a6e",
    ),
    "doom-source.zip": (
        "https://codeload.github.com/jacobenget/doom.wasm/zip/24bb772900cc16f4c62e28ff16ea2d80f99389e6",
        "b2a6289df5fd5b12d288c1212a7f5fa3f780610a1c7d991ff04f0791b178194e",
    ),
    "freedoom-0.13.0.zip": (
        GH + "freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
        "3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59",
    ),
    "vclibs.appx": (
        "https://download.microsoft.com/download/4/7/c/47c6134b-d61f-4024-83bd-b9c9ea951c25/Microsoft.VCLibs.x64.14.00.Desktop.appx",
        "b56a9101f706f9d95f815f5b7fa6efbac972e86573d378b96a07cff5540c5961",
    ),
    "electron-v45.3.4-win32-x64.zip": (
        GH
        + "electron/electron/releases/download/v45.3.4/electron-v45.3.4-win32-x64.zip",
        "b177908b5c48dad990612d7861fc8f03f8c06be0ca3351383a83cc11dd8e9144",
    ),
    "llama-b12503-bin-win-vulkan-x64.zip": (
        GH
        + "ggml-org/llama.cpp/releases/download/b12503/llama-b12503-bin-win-vulkan-x64.zip",
        "6c83027548f989a4d5c9502b31b580dc5e1254998bd49c1d78e85f316900d118",
    ),
    "whisper-bin-x64.zip": (
        GH + "ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
        "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
    ),
    "ggml-base-q5_1.bin": (
        HF
        + "ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin",
        "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    ),
    "piper-windows.zip": (
        GH + "rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
        "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea",
    ),
    "ru_RU-ruslan-medium.onnx": (
        HF + PIPER + "ru_RU-ruslan-medium.onnx",
        "72a5f88e0b20928064eb45d88e1daa21f8af62d18613580d32cbb4aed48dcf7f",
    ),
    "ru_RU-ruslan-medium.onnx.json": (
        HF + PIPER + "ru_RU-ruslan-medium.onnx.json",
        "706a4fb17bc304abd07809b552deae615e64dcbffbfbd09854ba37ca59e88117",
    ),
    "MODEL_CARD": (
        HF + PIPER + "MODEL_CARD",
        "28f5c0381c1234eb17bfd77e77f893b008948c29bc351fb811abd2d6a69e7662",
    ),
}


def digest(file):
    with file.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def verified(item, cache):
    name, (url, sha) = item
    dest = cache / name
    if dest.exists() and digest(dest) == sha:
        return
    temp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as response, temp.open("wb") as out:
        shutil.copyfileobj(response, out)
    if digest(temp) != sha:
        raise ValueError("Checksum mismatch: " + name)
    os.replace(temp, dest)


def unpack(cache, name, folder, prefix="", allow=lambda name: True):
    with zipfile.ZipFile(cache / name) as z:
        for info in z.infolist():
            if info.is_dir() or not info.filename.startswith(prefix):
                continue
            sub = Path(info.filename[len(prefix) :])
            if sub.is_absolute() or ".." in sub.parts:
                raise ValueError("Bad archive member")
            if not allow(str(sub)):
                continue
            target = folder / sub
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, target.open("wb") as out:
                shutil.copyfileobj(src, out)


def prepare_game(cache, destination):
    """Supply the open Freedoom IWAD and omit the upstream fallback game data."""
    import struct

    destination.mkdir(parents=True, exist_ok=True)
    engine = bytearray((cache / "doom-v0.1.0.wasm").read_bytes())
    start = 301190
    if engine[start : start + 4] != b"IWAD":
        raise ValueError("Unexpected game image")
    count, directory = struct.unpack_from("<II", engine, start + 4)
    size = directory + 16 * count
    if size != 4196020:
        raise ValueError("Unexpected embedded IWAD length")
    engine[start : start + size] = bytes(size)
    (destination / "game.wasm").write_bytes(engine)
    unpack(
        cache,
        "freedoom-0.13.0.zip",
        destination,
        "freedoom-0.13.0/",
        lambda n: (
            n in {"freedoom2.wad", "COPYING.txt", "CREDITS.txt", "CREDITS-MUSIC.txt"}
        ),
    )
    with (
        zipfile.ZipFile(cache / "doom-source.zip") as src,
        zipfile.ZipFile(
            destination / "engine-source.zip", "w", zipfile.ZIP_DEFLATED
        ) as out,
    ):
        for item in src.infolist():
            if not item.is_dir() and not item.filename.lower().endswith(
                (".wad", ".png", ".wasm", ".exe", ".dylib", ".so")
            ):
                out.writestr(item.filename, src.read(item))
        out.write(__file__, "mira-build/package.py")


def build(cache, out, stage_only):
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(5) as ex:
        list(ex.map(lambda x: verified(x, cache), ASSETS.items()))
    stage = out / "Mira"
    if stage.exists():
        if not (stage / ".mira-portable-build").is_file():
            raise ValueError("Destination already exists: " + str(stage))
        shutil.rmtree(stage)
    stage.mkdir()
    (stage / ".mira-portable-build").touch()
    app = stage / "resources/app"
    engine = stage / "resources/engines"
    unpack(cache, "electron-v45.3.4-win32-x64.zip", stage)
    (stage / "electron.exe").replace(stage / "Mira.exe")
    (stage / "resources/default_app.asar").unlink(missing_ok=True)
    subprocess.run(
        [
            "node",
            DESKTOP / "scripts/brand.mjs",
            stage / "Mira.exe",
            DESKTOP / "ui/mira.ico",
        ],
        check=True,
    )
    app.mkdir(parents=True, exist_ok=True)
    for f in DESKTOP.glob("*.cjs"):
        shutil.copy2(f, app / f.name)
    shutil.copy2(DESKTOP / "package.json", app / "package.json")
    subprocess.run(["node", DESKTOP / "scripts/stage-mail.mjs", app], check=True)
    subprocess.run(["node", DESKTOP / "scripts/vendor.mjs"], check=True)
    shutil.copytree(DESKTOP / "ui", app / "ui", dirs_exist_ok=True)
    shutil.copytree(ROOT / "Resources/Web", app / "renderer", dirs_exist_ok=True)
    unpack(
        cache,
        "vclibs.appx",
        engine / "msvc",
        allow=lambda n: (
            n.startswith(("msvcp", "vcruntime", "concrt", "vcomp"))
            and n.endswith(".dll")
        ),
    )
    unpack(
        cache,
        "llama-b12503-bin-win-vulkan-x64.zip",
        engine / "llama",
        allow=lambda n: n.endswith(".dll") or n == "llama-server.exe" or "LICENSE" in n,
    )
    unpack(
        cache,
        "whisper-bin-x64.zip",
        engine / "whisper",
        "Release/",
        lambda n: n.endswith(".dll") or n == "whisper-cli.exe",
    )
    unpack(cache, "piper-windows.zip", engine / "piper", "piper/")
    (engine / "voices").mkdir(parents=True, exist_ok=True)
    for n in (
        "ggml-base-q5_1.bin",
        "ru_RU-ruslan-medium.onnx",
        "ru_RU-ruslan-medium.onnx.json",
        "MODEL_CARD",
    ):
        shutil.copy2(cache / n, engine / "voices" / n)
    prepare_game(cache, app / "game")
    unpack(cache, "chocolate-3.1.1-win64.zip", app / "game/native")
    shutil.copy2(cache / "chocolate-3.1.1-source.zip", app / "game/native/source.zip")
    shutil.copytree(DESKTOP / "licenses", stage / "licenses", dirs_exist_ok=True)
    shutil.copy2(DESKTOP / "START-RU.txt", stage / "НАЧАТЬ.txt")
    for target in [
        stage / "Mira.exe",
        engine / "llama/llama-server.exe",
        engine / "whisper/whisper-cli.exe",
        engine / "piper/piper.exe",
        app / "game/freedoom2.wad",
        app / "game/game.wasm",
        app / "game/native/chocolate-doom.exe",
        app / "ui/vendor/pdf.worker.min.mjs",
        app / "ui/vendor/chess.js",
        app / "renderer/character.vrm",
        app / "renderer/avatar.js",
    ]:
        if target.stat().st_size < 1000:
            raise ValueError(str(target))
    if stage_only:
        return
    zipfile_path = out / "Mira-Windows-x64.zip"
    tmp = zipfile_path.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
        for f in sorted(stage.rglob("*")):
            if f.is_file() and f.name != ".mira-portable-build":
                archive.write(f, "Mira/" + f.relative_to(stage).as_posix())
    with zipfile.ZipFile(tmp) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError("Corrupt ZIP member: " + bad)
    os.replace(tmp, zipfile_path)
    print(zipfile_path, zipfile_path.stat().st_size, digest(zipfile_path))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--cache", type=Path, default=ROOT / "build/desktop-cache")
    p.add_argument("--out", type=Path, default=ROOT / "build/desktop")
    p.add_argument("--stage-only", action="store_true")
    args = p.parse_args()
    build(args.cache, args.out, args.stage_only)
