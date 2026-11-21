#!/bin/bash
# Mantido com quebras de linha LF via .gitattributes
set -euo pipefail

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
