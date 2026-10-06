"""Local-only Study Studio. Python standard library; no installation needed."""
import argparse
import json
import math
import sqlite3
import threading
import webbrowser
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
PORT = 8768
URL = f'http://127.0.0.1:{PORT}'
PLAN = json.loads((ROOT/'plan.json').read_text(encoding='utf-8'))
IDS = {t['id']: kind for kind, items in [('topic', PLAN['topics']), ('task', PLAN['tasks'])] for t in items}
DB = ROOT/'study-progress.sqlite3'

def initialize(db=DB):
    with closing(sqlite3.connect(db)) as connection, connection:
        connection.execute('CREATE TABLE IF NOT EXISTS study_progress (user_id TEXT NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,item_id))')

def validate(body):
    if not isinstance(body, dict) or body.get('id') not in IDS or not isinstance(body.get('value'), dict):
        raise ValueError('Unknown study item.')
    kind, value = IDS[body['id']], body['value']
    allowed = {'lesson','practice','pyqs','revision','notes'} if kind=='topic' else {'done','hours','notes'}
    if value.keys()-allowed:
        raise ValueError('Unknown progress field.')
    for key, val in value.items():
        if key=='notes':
            if not isinstance(val,str) or len(val)>2000:
                raise ValueError('Notes must be 2,000 characters or fewer.')
        elif key=='hours':
            if val is not None and (isinstance(val,bool) or not isinstance(val,(int,float)) or not math.isfinite(val) or not 0<=val<=24):
                raise ValueError('Enter hours between 0 and 24.')
        elif not isinstance(val,bool):
            raise ValueError('Completion must be checked or unchecked.')
    return kind

def write_progress(body, db=DB):
    kind=validate(body)
    with closing(sqlite3.connect(db,timeout=10)) as connection, connection:
        connection.execute('INSERT INTO study_progress VALUES (?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at', ('local',body['id'],kind,json.dumps(body['value']),datetime.now(timezone.utc).isoformat()))

def read_progress(db=DB):
    with closing(sqlite3.connect(db,timeout=10)) as connection:
        return {row[0]:json.loads(row[1]) for row in connection.execute('SELECT item_id,payload FROM study_progress WHERE user_id=?',('local',))}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def allowed(self):
        return self.headers.get('Host') in {f'127.0.0.1:{PORT}',f'localhost:{PORT}'}
    def reply(self,body,status=200,mime='application/json; charset=utf-8'):
        data=body if isinstance(body,bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if not self.allowed():
            return self.reply({'error':'Invalid host.'},403)
        route=self.path.split('?')[0]
        if route=='/api/health':
            return self.reply({'app':'gate-da-study-studio','storage':'local'})
        if route=='/api/progress':
            try:
                return self.reply({'progress':read_progress()})
            except sqlite3.Error:
                return self.reply({'error':'Your progress could not be loaded. Please retry.'},503)
        files={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/app.css':('app.css','text/css; charset=utf-8'),'/favicon.svg':('favicon.svg','image/svg+xml')}
        if route in files:
            name,mime=files[route]
            return self.reply((ROOT/name).read_bytes(),mime=mime)
        self.reply({'error':'Not found.'},404)
    def do_PUT(self):
        if not self.allowed() or self.headers.get('Origin') not in {URL,f'http://localhost:{PORT}'}:
            return self.reply({'error':'This request is not allowed.'},403)
        if self.path!='/api/progress':
            return self.reply({'error':'Not found.'},404)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=20000:
                raise ValueError('Invalid request size.')
            body=json.loads(self.rfile.read(size))
            write_progress(body)
            return self.reply({'ok':True})
        except (ValueError,TypeError,UnicodeError):
            return self.reply({'error':'Invalid entry. Check the hours, notes and completion fields.'},400)
        except sqlite3.Error:
            return self.reply({'error':'Could not save. Please retry; your previous saved progress is unchanged.'},503)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--open',action='store_true')
    args=parser.parse_args()
    try:
        server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    except OSError:
        with urlopen(URL+'/api/health',timeout=3) as response:
            assert json.load(response)['app']=='gate-da-study-studio','Port is in use by another app.'
        if args.open:
            webbrowser.open(URL)
    else:
        initialize()
        if args.open:
            threading.Timer(0.5,lambda:webbrowser.open(URL)).start()
        server.serve_forever()
