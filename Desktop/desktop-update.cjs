const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const repository = 'ProgramistMaks/mira-ios';
const releases = 'https://api.github.com/repos/' + repository + '/releases?per_page=30';
const releaseNotes = 'https://github.com/' + repository + '/releases/tag/';
const versionParts = (version) => version.split('.').map(Number);
function newer(candidate, current) {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const diff = left.map((component, i) => component - right[i]).find(Boolean);
  return diff > 0;
}
function releaseBuild(release) {
  const version = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
  if (!version || release.draft || release.prerelease) return;
  const name = 'Mira-PC-' + version + '-Windows-x64.zip';
  const notes = String(release.body || '');
  const prefix = 'https://github.com/' + repository + '/raw/';
  const pinned = notes.match(/https:\/\/github\.com\/ProgramistMaks\/mira-ios\/raw\/[a-f\d]{40}\/[\w.-]+/g)
    ?.find((url) => url.endsWith('/' + name));
  const hash = /SHA-256[^\n]*`([a-f\d]{64})`/i.exec(notes)?.[1].toLowerCase();
  const asset = release.assets?.find((a) => a.name === name);
  const assetUrl = 'https://github.com/' + repository + '/releases/download/' + release.tag_name + '/' + name;
  if (asset?.browser_download_url === assetUrl && /^sha256:[a-f\d]{64}$/.test(asset.digest || ''))
    return { version, url: assetUrl, hash: asset.digest.slice(7), page: releaseNotes + release.tag_name };
  if (pinned?.startsWith(prefix) && hash)
    return { version, url: pinned, hash, page: releaseNotes + release.tag_name };
}
async function checkUpdate(current, request = fetch) {
  const r = await request(releases, { signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!r.ok) throw Error('GitHub вернул HTTP ' + r.status);
  const items = await r.json();
  if (!Array.isArray(items)) throw Error('GitHub вернул неизвестный формат релизов');
  return items.map(releaseBuild).filter((build) => build && newer(build.version, current))
    .sort((a, b) => newer(a.version, b.version) ? -1 : 1)[0] || null;
}
async function getArchive(build, file, request = fetch) {
  const r = await request(build.url, { signal: AbortSignal.timeout(300000) });
  if (!r.ok || !r.body) throw Error('Не удалось скачать обновление (HTTP ' + r.status + ')');
  const hash = createHash('sha256');
  let length = 0;
  await pipeline(r.body, new Transform({
    transform(chunk, encoding, callback) {
      length += chunk.length;
      if (length > 1024 * 1024 * 1024) return callback(Error('Архив обновления слишком большой'));
      hash.update(chunk);
      callback(null, chunk);
    },
  }), createWriteStream(file, { flags: 'wx' }));
  if (hash.digest('hex') !== build.hash) throw Error('Контрольная сумма обновления не совпала');
}
const powershellArgs = (source) => ['-NoProfile', '-NonInteractive', '-EncodedCommand',
  Buffer.from(source, 'utf16le').toString('base64')];
const unpack = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($env:MIRA_UPDATE_ZIP)
try {
  [long]$size=0
  foreach($entry in $zip.Entries) {
    if($entry.FullName -notmatch '^Mira/[^:*?"<>|\\\\]+$' -or ($entry.FullName -split '/') -contains '..') { throw 'Invalid update path' }
    $size += $entry.Length
    if($size -gt 2500MB) { throw 'Update too large' }
  }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($env:MIRA_UPDATE_ZIP,$env:MIRA_UPDATE_STAGE)
$appDir=Join-Path $env:MIRA_UPDATE_STAGE 'Mira'
if(!(Test-Path -LiteralPath (Join-Path $appDir 'Mira.exe') -PathType Leaf)) { throw 'Mira.exe missing' }
$metadata=Get-Content -LiteralPath (Join-Path $appDir 'resources/app/package.json') -Raw | ConvertFrom-Json
if($metadata.name -ne 'mira-desktop' -or $metadata.version -ne $env:MIRA_UPDATE_VERSION) { throw 'Wrong update version' }
`;
const apply = `
$ErrorActionPreference='Stop'
$old=$env:MIRA_UPDATE_HOME
$new=Join-Path $env:MIRA_UPDATE_STAGE 'Mira'
$backup=$env:MIRA_UPDATE_STAGE+'-previous'
try {
  $process=Get-Process -Id ([int]$env:MIRA_UPDATE_PID) -ErrorAction SilentlyContinue
  if($process -and !$process.WaitForExit(60000)) { throw 'Mira did not close' }
  for($i=0;;$i++) {
    try { [IO.Directory]::Move($old,$backup); break }
    catch { if($i -ge 20) { throw }; Start-Sleep -Milliseconds 500 }
  }
  try { [IO.Directory]::Move($new,$old) }
  catch { [IO.Directory]::Move($backup,$old); throw }
  Start-Process -FilePath (Join-Path $old 'Mira.exe') -WorkingDirectory $old
  Remove-Item -LiteralPath $env:MIRA_UPDATE_ZIP -ErrorAction SilentlyContinue
  Set-Content -LiteralPath $env:MIRA_UPDATE_LOG -Value "Backup: $backup"
} catch {
  Set-Content -LiteralPath $env:MIRA_UPDATE_LOG -Value $_.Exception.Message
  if(Test-Path -LiteralPath (Join-Path $old 'Mira.exe')) {
    Start-Process -FilePath (Join-Path $old 'Mira.exe') -WorkingDirectory $old
  }
}
`;
async function installUpdate(build, executable, profile) {
  const root = path.dirname(executable);
  if (path.basename(executable).toLowerCase() !== 'mira.exe' || !process.env.SystemRoot ||
      path.relative(root, profile).split(path.sep)[0] !== '..' && path.parse(root).root === path.parse(profile).root)
    throw Error('Обновление доступно для распакованной Windows-версии Миры с отдельным профилем');
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Папка приложения должна быть обычным каталогом');
  const stage = await fs.mkdtemp(path.join(path.dirname(root), '.mira-update-'));
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const env = { ...process.env, MIRA_UPDATE_STAGE: stage, MIRA_UPDATE_ZIP: path.join(stage, 'update.zip'),
    MIRA_UPDATE_VERSION: build.version, MIRA_UPDATE_HOME: root, MIRA_UPDATE_PID: String(process.pid),
    MIRA_UPDATE_LOG: path.join(profile, 'last-update.log') };
  try {
    await getArchive(build, env.MIRA_UPDATE_ZIP);
    await promisify(execFile)(powershell, powershellArgs(unpack), { env, cwd: stage, windowsHide: true, timeout: 120000 });
    const job = spawn(powershell, powershellArgs(apply), { cwd: stage, env, detached: true, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { job.once('spawn', resolve); job.once('error', reject); });
    job.unref();
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { checkUpdate, getArchive, installUpdate, releaseBuild };
