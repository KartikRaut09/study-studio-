"""Create a consistent local progress backup, including while the app runs."""
import sqlite3
from datetime import datetime
from pathlib import Path
root=Path(__file__).resolve().parent
source=root/'study-progress.sqlite3'
if not source.exists():
    raise SystemExit('No progress database yet. Open the local app first.')
folder=root/'progress-backups';folder.mkdir(exist_ok=True)
target=folder/f'progress-{datetime.now():%Y%m%d-%H%M%S}.sqlite3'
src=sqlite3.connect(source);dst=sqlite3.connect(target)
try:src.backup(dst)
finally:dst.close();src.close()
print(f'Backup saved: {target}')
