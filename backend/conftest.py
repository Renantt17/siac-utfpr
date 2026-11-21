import os
from pathlib import Path
import shutil

import psycopg
import pytest
from django.core.management import call_command
from django.db import connections


@pytest.fixture(autouse=True)
def _isolated_media_and_headers(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / 'media'
    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    settings.USE_X_ACCEL_REDIRECT = False
    yield
    shutil.rmtree(settings.MEDIA_ROOT, ignore_errors=True)


@pytest.fixture(scope='session')
def django_db_setup(django_db_blocker):
    """Inicializa o banco de teste PostgreSQL executando BD/schema.sql oficial."""
    from django.conf import settings

    db_cfg = settings.DATABASES['default']
    test_db_name = f"test_{db_cfg['NAME']}"
    admin_user = os.environ.get('POSTGRES_USER', 'postgres')
    admin_password = os.environ.get('POSTGRES_PASSWORD', db_cfg['PASSWORD'])
    host = db_cfg['HOST']
    port = db_cfg['PORT']

    with psycopg.connect(
        dbname='postgres',
        user=admin_user,
        password=admin_password,
        host=host,
        port=port,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                  FROM pg_stat_activity
                 WHERE datname = %s AND pid <> pg_backend_pid()
                """,
                [test_db_name],
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{test_db_name}"')
            cur.execute(f'CREATE DATABASE "{test_db_name}"')

    schema_path = Path(__file__).resolve().parent.parent / 'db' / 'init' / '02_schema.sql'
    grants_path = Path(__file__).resolve().parent.parent / 'db' / 'init' / '03_public_grants.sql'

    with psycopg.connect(
        dbname=test_db_name,
        user=admin_user,
        password=admin_password,
        host=host,
        port=port,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            from psycopg import sql as pg_sql
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'siac_owner'")
            if not cur.fetchone():
                cur.execute('CREATE ROLE siac_owner NOLOGIN')
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'siac_app'")
            if not cur.fetchone():
                cur.execute(
                    pg_sql.SQL('CREATE ROLE siac_app LOGIN PASSWORD {}').format(
                        pg_sql.Literal(db_cfg['PASSWORD'])
                    )
                )
            cur.execute(schema_path.read_text(encoding='utf-8'))
            cur.execute(grants_path.read_text(encoding='utf-8'))

    settings.DATABASES['default']['NAME'] = test_db_name
    connections.close_all()

    with django_db_blocker.unblock():
        call_command('migrate', verbosity=0)

    yield

    connections.close_all()
    with psycopg.connect(
        dbname='postgres',
        user=admin_user,
        password=admin_password,
        host=host,
        port=port,
        autocommit=True,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                  FROM pg_stat_activity
                 WHERE datname = %s AND pid <> pg_backend_pid()
                """,
                [test_db_name],
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{test_db_name}"')
