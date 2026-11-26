#!/bin/sh
# Database tests: a fresh database, stand-ins for Supabase (auth, storage, roles), the real schema, then the tests.
# Needs PostgreSQL 14+ running locally. Usage:  PGHOST=/var/run/postgresql PGUSER=postgres tests/db/run.sh
D=$(cd "$(dirname "$0")" && pwd)
psql -q -c "drop database if exists cp_test" -c "create database cp_test"
psql -d cp_test -q -f "$D/supabase_stubs.sql"
psql -d cp_test -q -v ON_ERROR_STOP=1 -f "$D/../../supabase/schema.sql" 2>&1 | grep -v NOTICE
psql -d cp_test -At -f "$D/checkin_test.sql"
