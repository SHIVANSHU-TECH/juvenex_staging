# Data Retention Policy

This document describes the data retention rules enforced by Juvenex and the
operational procedures required to keep the platform HIPAA-compliant.

## Regulatory Basis

- **HIPAA §164.316(b)(2)** — Covered entities must retain required
  documentation (including audit logs, access reports, and security incident
  records) for a minimum of **six (6) years** from the date of creation or the
  date when it was last in effect, whichever is later.
- **45 CFR §164.530(j)** — Policies and procedures implementing the HIPAA
  Privacy Rule must be retained under the same six-year rule.

## Retention Schedule

| Data class                       | Retention window                         | Purge mechanism                          |
| -------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `audit_logs`                     | 6 years (HIPAA §164.316(b)(2))           | `retention_purge_audit_logs()`           |
| `ai_conversations`               | 90 days after `last_message_at`          | `retention_purge_ai_conversations()`     |
| `patient_profiles` (active)      | Retained while account is active         | Manual — on account delete               |
| `patient_profiles` (deleted)     | Purged on account-delete request         | `retention_purge_deleted_patients()`     |
| `appointments.intake_data`       | Retained per provider contract (BAA)     | Handled by external telehealth provider  |
| Encrypted PHI at rest            | Lifetime of the associated patient       | Cascading delete with patient record     |

The purge SQL functions are defined in `supabase/migrations/007_retention.sql`.
Each function is idempotent, transactional, and emits a row into `audit_logs`
describing what was purged.

## Scheduling the Nightly Purge

The application does NOT run retention purges itself. An external scheduler
MUST call the purge functions at least once per 24 hours. Pick one:

1. **pg_cron** (preferred on managed Postgres / Supabase):
   ```sql
   SELECT cron.schedule('retention-nightly', '0 3 * * *', $$
     SELECT retention_purge_audit_logs();
     SELECT retention_purge_ai_conversations();
     SELECT retention_purge_deleted_patients();
   $$);
   ```
2. **Supabase Scheduled Functions** — invoke the three functions from an
   Edge Function scheduled daily at 03:00 UTC.
3. **GitHub Actions** — workflow on a `cron: '0 3 * * *'` schedule that runs
   `psql "$DATABASE_URL" -c "SELECT retention_purge_audit_logs(); ..."`.

## Account Deletion

When a patient requests account deletion (GDPR / CCPA / HIPAA right to access
and amend), the application:

1. Marks `patient_profiles.deleted_at = now()`.
2. Immediately revokes all active sessions and API tokens.
3. The next scheduled run of `retention_purge_deleted_patients()` removes the
   row and cascades to encrypted PHI, progress photos, and food logs.

Audit log entries referencing the deleted patient are **retained** for the
full six-year window as required by §164.316(b)(2); patient identifiers in
those rows are already pseudonymized.

## Verification

The retention scheduler is a compliance control. Operations should:

- Alert if no `retention_*` audit-log entry has been written in the last 26h.
- Include retention-function success rates in the monthly compliance report.
- Re-validate the schedule after any database migration or provider change.
