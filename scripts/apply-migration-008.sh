#!/usr/bin/env bash
# Apply migration 008 to Supabase.
#
# Run it from a host with direct IPv4 access to the Supabase database, or paste
# the migration file into the Supabase SQL editor instead. A host that can only
# reach Supabase over IPv6 will not connect.
#
# The password comes from the environment and must never be written into this
# file — an earlier revision of this comment carried a real one. Take it from
# the Supabase dashboard (Project settings → Database) or from `.env.local`:
#
# Usage:
#   PGPASSWORD='<db password>' ./scripts/apply-migration-008.sh
#
# The same shape applies to any other migration — swap MIGRATION_FILE below.
set -euo pipefail

MIGRATION_FILE="$(dirname "$0")/../supabase/migrations/008_encrypt_phi_columns.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE" >&2
  exit 1
fi

: "${PGPASSWORD:?PGPASSWORD env var required}"

psql \
  -h db.sbjcztlplbzcsyvljouf.supabase.co \
  -U postgres \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -f "$MIGRATION_FILE"

echo "Migration 008 applied."
