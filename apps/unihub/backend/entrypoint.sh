#!/bin/bash
set -e

# Create the database if it doesn't exist.
if [ -n "$DATABASE_URL" ]; then
    python -c "
import os, re, subprocess, sys

url = os.environ['DATABASE_URL']
m = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', url)
if not m:
    print('Could not parse DATABASE_URL, skipping db creation check')
    sys.exit(0)

user, password, host, port, dbname = m.groups()
env = {**os.environ, 'PGPASSWORD': password}
result = subprocess.run(
    ['psql', '-h', host, '-p', port, '-U', user, '-d', 'postgres',
     '-tAc', f\"SELECT 1 FROM pg_database WHERE datname='{dbname}'\"],
    capture_output=True, text=True, env=env
)
if result.stdout.strip() != '1':
    print(f'Creating database {dbname}...')
    subprocess.run(
        ['createdb', '-h', host, '-p', port, '-U', user, dbname],
        check=True, env=env
    )
else:
    print(f'Database {dbname} already exists')
"
fi

echo "Running migrations..."
python manage.py migrate --noinput

echo "Starting gunicorn..."
exec gunicorn unihub.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --access-logformat '%(h)s "%(r)s" %(s)s %(b)s %(D)sus'
