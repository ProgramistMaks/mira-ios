"""Build Mira's portable Windows x64 directory and archive using pinned upstream releases."""

import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, tempfile, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "Desktop"
HF = "https://huggingface.co/"
GH = "https://github.com/"
PIPER = "rhasspy/piper-voices/resolve/0ca208afc2a2ee102b1e961e72e0a7e4907be3d0/ru/ru_RU/ruslan/medium/"
ASSETS = {
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
    shutil.copytree(DESKTOP / "licenses", stage / "licenses", dirs_exist_ok=True)
    shutil.copy2(DESKTOP / "START-RU.txt", stage / "НАЧАТЬ.txt")
    for target in [
        stage / "Mira.exe",
        engine / "llama/llama-server.exe",
        engine / "whisper/whisper-cli.exe",
        engine / "piper/piper.exe",
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
