# Duplicate-activity cleanup + permanent guard

**Rule:** a project may hold at most **one non-deleted activity of each type** (one
Land Acquisition, one Utility Shifting, …). Variation within a type — villages,
sections, award phases — is modelled as *records* inside that single activity, never
as a second activity.

One-off operational fix for projects that ended up with **more than one activity of
the same type** (e.g. two "Land Acquisition" or four "Utility Shifting" activities on
one project). These came from a client-side stale-cache race in the "create the
activity on first record / first scope save" path; the symptom is multiple Activity
Progress cards of the same type on the project Overview while the Records page only
shows one of them.

## What these scripts do

| File | What it does | Writes? |
|---|---|---|
| `01_report.sql` | Lists every duplicate group and the KEEP/MERGE plan. | No (read-only) |
| `02_apply.sql` | Folds records into the keeper, soft-deletes the losers, **creates a unique index** so it can never happen again. | Yes (one transaction) |

**Keeper rule:** within each group (one group per project + type) keep the activity
with the **most non-deleted records** (ties → earliest `created_at` → `id`). Grouping
always includes `project_id`, so nothing is ever merged across different projects.

> ⚠ Because grouping is by type only, two *differently-named* same-type activities on
> one project will also be merged, keeping only the keeper's name and scope docs. Check
> the `name` column in the report first; for the accidental same-named duplicates this
> is exactly what you want.

## How to run (VM, rootful Podman)

The postgres container is `pia-postgres` (confirm with
`sudo podman ps -a --filter name=postgres`).

```bash
# 1. Review the plan first — nothing changes.
sudo podman exec -i pia-postgres psql -U pia -d pia < 01_report.sql

# 2. If the plan looks right, apply it.
sudo podman exec -i pia-postgres psql -U pia -d pia < 02_apply.sql
```

`02_apply.sql` is transactional and idempotent — re-running it is a no-op once the
data is clean, and the index creation uses `IF NOT EXISTS`.

## After running

The orphan records from the merged-away activities now sit under the single
surviving activity, so they appear in that activity's **record list**. Review them
there and delete the junk ones through the normal record UI — the merge only
consolidated the *activities*, it does not decide which *records* are unwanted.

## Prevention going forward

Three layers now stop duplicates:
1. **DB unique index** `ux_pact_project_type` on `(project_id, activity_type_code)`
   (created by `02_apply.sql`) — the physical guarantee. Race-proof across concurrent
   tabs and multiple users on the same project.
2. **Backend guard** in `ActivityService.create()` — returns a clean `409` instead
   of a raw constraint error.
3. **Frontend** — refetches the activity list from the backend before creating and
   reuses an existing activity instead of creating a second one (self-heals a stale
   cache / double click / second tab).
