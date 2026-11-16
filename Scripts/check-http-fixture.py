"""Run the same HTTP fixture outside XCTest to distinguish host/setup failures."""
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

script = pathlib.Path(__file__).resolve().parents[1] / 'DownloadTests/Fixtures/server.py'
with tempfile.TemporaryDirectory(prefix='mira-fixture-probe-') as folder:
    port = pathlib.Path(folder) / 'port'
    log = pathlib.Path(folder) / 'server.log'
    with log.open('w') as output:
        process = subprocess.Popen([sys.executable, '-u', str(script), str(port)],
                                   env={'PATH': os.environ.get('PATH', '/usr/bin:/bin')},
                                   stdin=subprocess.DEVNULL, stdout=output, stderr=output)
        try:
            deadline = time.monotonic() + 20
            number = ''
            while process.poll() is None and time.monotonic() < deadline:
                number = port.read_text() if port.exists() else ''
                if number.isdigit() and 0 < int(number) <= 65535:
                    break
                time.sleep(0.02)
            if not (number.isdigit() and 0 < int(number) <= 65535):
                raise RuntimeError('Fixture startup failed: ' + log.read_text())
            address = 'http://127.0.0.1:' + number + '/requests?case=probe'
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(address, timeout=5) as response:
                assert response.read() == b'[]'
            print('PASS: standalone loopback HTTP fixture starts and answers requests')
        finally:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=3)
