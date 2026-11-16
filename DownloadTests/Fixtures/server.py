import sys
print('fixture: Python started', file=sys.stderr, flush=True)
import http.server
import json
import pathlib
import signal
import socket
import socketserver
import threading
import time
import urllib.parse

# Foundation.Process can inherit blocked signals from Swift's worker thread.
# Restore normal termination for this test-only subprocess.
signal.pthread_sigmask(signal.SIG_SETMASK, [])
signal.signal(signal.SIGTERM, signal.SIG_DFL)
print('fixture: imports and signal setup complete', file=sys.stderr, flush=True)

SIZE = 1024 * 1024
CHUNK = 64 * 1024
DATA = bytes(range(256)) * (SIZE // 256)
requests = {}
lock = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        case = urllib.parse.parse_qs(parsed.query).get('case', [''])[0]
        if parsed.path == '/requests':
            with lock:
                body = json.dumps(requests.get(case, [])).encode()
            self.send_response(200)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        with lock:
            log = requests.setdefault(case, [])
            log.append({'range': self.headers.get('Range', ''), 'ifRange': self.headers.get('If-Range', '')})
            attempt = len(log)
        mode = parsed.path.strip('/')
        if mode == 'redirect':
            self.send_response(302)
            self.send_header('Location', '/resume?case=' + urllib.parse.quote(case + '-target'))
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if mode == 'unavailable' and attempt > 1:
            self.send_response(503)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        offset = int(self.headers.get('Range', 'bytes=0-').split('=')[1].split('-')[0])
        status = 206 if offset else 200
        etag = '"v1"'
        payload = DATA
        if mode in ['ignore-range', 'replace', 'empty-restart'] and attempt > 1:
            status = 200
            offset = 0
        if mode == 'replace':
            payload = b'B' * SIZE if attempt > 1 else b'A' * SIZE
            etag = '"v2"' if attempt > 1 else '"v1"'
        if mode == 'changed-206' and attempt > 1:
            etag = '"v2"'
        self.send_response(status)
        self.send_header('ETag', etag)
        if mode != 'oversize':
            self.send_header('Content-Length', str(SIZE - offset))
        self.send_header('Connection', 'close')
        if status == 206:
            start = 0 if mode == 'bad-range' else offset
            total = SIZE + 1 if mode == 'bad-total' else SIZE
            self.send_header('Content-Range', f'bytes {start}-{SIZE - 1}/{total}')
        self.end_headers()
        try:
            if mode == 'empty-restart' and attempt > 1:
                self.connection.shutdown(socket.SHUT_RDWR)
            elif mode == 'oversize':
                self.wfile.write(payload + b'overflow')
            elif attempt == 1 and mode not in ['slow', 'complete']:
                self.wfile.write(payload[:2 * CHUNK])
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
            else:
                for start in range(offset, SIZE, CHUNK):
                    self.wfile.write(payload[start:start + CHUNK])
                    self.wfile.flush()
                    if mode == 'slow':
                        time.sleep(0.04)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        self.close_connection = True


class LoopbackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer calls getfqdn() here. A fixture bound to numeric loopback
        # needs no DNS, and macOS resolver startup can otherwise block readiness.
        socketserver.TCPServer.server_bind(self)
        self.server_name = 'localhost'
        self.server_port = self.server_address[1]


server = LoopbackServer(('127.0.0.1', 0), Handler)
print('fixture: loopback bound', file=sys.stderr, flush=True)
pathlib.Path(sys.argv[1]).write_text(str(server.server_port))
print('fixture: ready', file=sys.stderr, flush=True)
server.serve_forever()
