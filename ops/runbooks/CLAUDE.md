# ops/runbooks — Operational runbooks

Skeleton folder for production runbooks. Real content lands as the project enters Phase 3 and production operational experience accumulates.

## Planned runbooks

- `incident-s0.md` — data exfiltration, integrity breach, full outage > 1 hour.
- `incident-s1.md` — integrity check failure, suspected unauthorized access, partial outage.
- `incident-s2.md` — account compromise, dependency CVE.
- `incident-s3.md` — pentest findings (low/medium), unusual access pattern.
- `disaster-recovery.md` — full DR runbook per docs/deployment.md § 10.
- `drill-log.md` — record of restore drills (quarterly).
- `permission-grant.md` — procedure for SUPER_ADMIN to grant ad-hoc permissions; double-sign-off requirements.
- `schema-rollback.md` — emergency rollback procedure for a bad migration.
- `clamav-down.md` — what to do when ClamAV is unreachable; attachments can't be saved.
- `audit-integrity-failure.md` — response procedure when the audit hash chain breaks.

## Template

Every runbook follows:

```
# Runbook: <title>

## Severity
S0 | S1 | S2 | S3

## Symptoms
What you see.

## Detection signal
Where the alert came from.

## Triage
First 5 minutes — what to confirm.

## Containment
Stop the bleeding. Specific commands and decisions.

## Forensic preservation
Snapshots, logs to capture before further action.

## Recovery
Steps to restore service.

## Communication
Who to notify, what to say, when.

## Post-incident review
Template for the retrospective.
```

See docs/security.md § 6 for the broader incident response model.
