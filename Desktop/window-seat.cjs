const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

// Query the chosen foreground window. Tracking its handle keeps the character on the
// same window when focus changes and avoids installing system-wide hooks.
const tracker = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MiraWindows {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect bounds);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect bounds, int size);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
try { [void][MiraWindows]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch {}
Start-Sleep -Milliseconds 900
for ($i=0; $i -lt 60; $i++) {
  $window=[MiraWindows]::GetForegroundWindow()
  [uint32]$owner=0
  [void][MiraWindows]::GetWindowThreadProcessId($window,[ref]$owner)
  if ($owner -and $owner -ne [uint32]$env:MIRA_OWNER -and (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName -notin @('ShellExperienceHost','StartMenuExperienceHost')) { break }
  $window=[IntPtr]::Zero
  Start-Sleep -Milliseconds 250
}
if ($window -eq [IntPtr]::Zero) { exit 2 }
$last=''
while ([MiraWindows]::IsWindow($window)) {
  $r=New-Object MiraWindows+Rect
  if ([MiraWindows]::IsIconic($window)) { $line='hidden' }
  elseif ([MiraWindows]::DwmGetWindowAttribute($window,9,[ref]$r,16) -eq 0 -or [MiraWindows]::GetWindowRect($window,[ref]$r)) { $line="$($r.left),$($r.top),$($r.right),$($r.bottom)" }
  else { break }
  if ($line -ne $last) { [Console]::WriteLine($line); $last=$line }
  Start-Sleep -Milliseconds 125
}
`;
function followWindow(position, finished) {
  const executable = path.join(
    process.env.SystemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const child = spawn(
    executable,
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(tracker, 'utf16le').toString('base64'),
    ],
    {
      windowsHide: true,
      env: { ...process.env, MIRA_OWNER: String(process.pid) },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const lines = readline.createInterface({ input: child.stdout });
  let active = true;
  lines.on('line', (line) => {
    if (!active) return;
    if (line === 'hidden') position(null);
    else if (/^-?\d+,-?\d+,-?\d+,-?\d+$/.test(line)) position(line.split(',').map(Number));
  });
  const end = () => {
    if (active) {
      active = false;
      finished();
    }
  };
  child.once('error', end);
  child.once('close', end);
  return () => {
    active = false;
    lines.close();
    child.kill();
  };
}
module.exports = { followWindow };
