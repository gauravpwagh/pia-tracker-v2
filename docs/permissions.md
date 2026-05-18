# PIA Tracker — Permissions and User Picker

**Status:** Draft v1.
**See also:** `architecture.md` § 4.4 (user model), § 8 (auth); `database.md` § 2 (users), § 3 (permissions).

This document specifies the permission catalog, the designation registry, designation-to-permission mappings, the user picker filter matrix, and the rules for cross-zone access and system grants.

---

## 1. Designation registry

Seeded by Flyway. Every user has exactly one designation; designation determines default capabilities. The registry below is the v1 seed; new designations are added via Flyway data migration.

### Construction / engineering (data entry)

| Code | Name | Short | Category | Approval role | Data entry role |
|---|---|---|---|---|---|
| `EDGS_CI` | Executive Director General, Strategy / Construction-Infrastructure | EDGS/C-I | ADMIN | no | yes |
| `CAO_C` | Chief Administrative Officer (Construction) | CAO/C | CONSTRUCTION | no | yes |
| `CE_C` | Chief Engineer (Construction) | CE/C | CONSTRUCTION | no | yes |
| `CE_PLANNING` | Chief Engineer (Planning) | CE/Planning | PLANNING | yes | yes |
| `DY_CE_C` | Deputy Chief Engineer (Construction) | Dy CE/C | CONSTRUCTION | no | yes |
| `DY_CE_PLANNING` | Deputy Chief Engineer (Planning) | Dy CE/Planning | PLANNING | yes | no |
| `DY_CE_DESIGN` | Deputy Chief Engineer (Design) | Dy CE/Design | PLANNING | yes | no |

### Drawing approval — engineering

| Code | Name | Short | Category | Approval role |
|---|---|---|---|---|
| `DY_CE` | Deputy Chief Engineer | Dy CE | CONSTRUCTION | yes |
| `SR_DEN` | Senior Divisional Engineer | Sr DEN | CONSTRUCTION | yes |
| `SR_DEN_CO` | Senior Divisional Engineer (Coordination) | Sr DEN/Co | CONSTRUCTION | yes |
| `CBE` | Chief Bridge Engineer | CBE | BRIDGE | yes |
| `DY_CE_BRIDGE` | Deputy Chief Engineer (Bridge) | Dy CE/Bridge | BRIDGE | yes |
| `CTE` | Chief Track Engineer | CTE | TRACK | yes |
| `DY_CE_TRACK` | Deputy Chief Engineer (Track) | Dy CE/Track | TRACK | yes |
| `CPDE` | Chief Planning and Design Engineer | CPDE | PLANNING | yes |
| `PCE` | Principal Chief Engineer | PCE | CONSTRUCTION | yes |

### Drawing approval — S&T

| Code | Name | Short | Approval role |
|---|---|---|---|
| `DY_CSTE` | Deputy Chief Signal & Telecom Engineer | Dy CSTE | yes |
| `SR_DSTE` | Senior Divisional Signal & Telecom Engineer | Sr DSTE | yes |
| `CSTE_CON` | Chief Signal & Telecom Engineer (Construction) | CSTE/Con | yes |
| `CSTE_OL` | Chief Signal & Telecom Engineer (Open Line) | CSTE/OL | yes |
| `PSCTE` | Principal Chief Signal & Telecom Engineer | PSCTE | yes |

### Drawing approval — Electrical

| Code | Name | Short | Approval role |
|---|---|---|---|
| `DY_CEE` | Deputy Chief Electrical Engineer | Dy CEE | yes |
| `SR_DEE_TRD` | Senior Divisional Electrical Engineer (Traction) | Sr DEE/TRD | yes |
| `CEE_CON` | Chief Electrical Engineer (Construction) | CEE/Con | yes |
| `PCEE` | Principal Chief Electrical Engineer | PCEE | yes |

### Drawing approval — Operations / Commercial / Safety

| Code | Name | Short | Approval role |
|---|---|---|---|
| `SR_DOM` | Senior Divisional Operations Manager | Sr DOM | yes |
| `PCOM` | Principal Chief Operations Manager | PCOM | yes |
| `SR_DCM` | Senior Divisional Commercial Manager | Sr DCM | yes |
| `ADRM` | Additional Divisional Railway Manager | ADRM | yes |
| `DRM` | Divisional Railway Manager | DRM | yes |
| `CTPM` | Chief Track Project Manager | CTPM | yes |
| `PCSO` | Principal Chief Safety Officer | PCSO | yes |
| `CRS` | Commissioner of Railway Safety | CRS | yes |
| `GM` | General Manager | GM | yes |

### System

| Code | Name |
|---|---|
| `ADMIN` | System Administrator |
| `SUPER_ADMIN` | Super Administrator |

The `SUPER_ADMIN` designation should be assigned sparingly (one or two users in production). It bypasses zone filtering entirely.

---

## 2. Permission catalog

Permission codes are `RESOURCE.ACTION` or `RESOURCE.ACTION.SCOPE`. Scope suffixes follow the implication rule (architecture § 8, decision EE): `ALL` ⊇ `ZONE` ⊇ `OWN`.

### Project

```
PROJECT.CREATE
PROJECT.READ.OWN
PROJECT.READ.ZONE
PROJECT.READ.ALL
PROJECT.UPDATE.OWN
PROJECT.UPDATE.ALL
PROJECT.DELETE
PROJECT.ALLOCATE                      -- CAO/C action
PROJECT.ASSIGN_DYCE                   -- CE/C action
PROJECT.DESIGNATE_NODAL               -- CE/C action
PROJECT.HOLD_RESUME
PROJECT.COMPLETE
PROJECT.DROP
```

### Activity

```
ACTIVITY.CREATE.ASSIGNED              -- on projects I'm a Dy CE/C on
ACTIVITY.READ.OWN
ACTIVITY.READ.ZONE
ACTIVITY.READ.ALL
ACTIVITY.UPDATE.OWN
ACTIVITY.DELETE
```

### Activity records

```
ACTIVITY_RECORD.CREATE.ASSIGNED
ACTIVITY_RECORD.READ.OWN
ACTIVITY_RECORD.READ.ZONE
ACTIVITY_RECORD.READ.ALL
ACTIVITY_RECORD.UPDATE.OWN
ACTIVITY_RECORD.SUBMIT                -- Dy CE/C
ACTIVITY_RECORD.VERIFY                -- Nodal Dy CE/C
ACTIVITY_RECORD.AUTHENTICATE          -- CE/C
ACTIVITY_RECORD.SEND_BACK
ACTIVITY_RECORD.DELETE
ACTIVITY_RECORD.BULK_TRANSITION
```

### Drawings

```
DRAWING.APPROVE                       -- any approval role on a drawing they're listed for
DRAWING.SEND_BACK
DRAWING.EDIT_APPROVERS                -- Admin, CE/C, Nodal Dy CE/C
DRAWING.REASSIGN_APPROVER             -- swap one user for another
```

### Forms

```
FORM_DEFINITION.READ
FORM_DEFINITION.CREATE
FORM_DEFINITION.UPDATE
FORM_DEFINITION.PUBLISH               -- promote a draft version to active
```

### Dashboards and exports

```
DASHBOARD.VIEW.PROJECT
DASHBOARD.VIEW.ZONE
DASHBOARD.VIEW.PAN_INDIA              -- system grant, not designation-derived
EXPORT.PROJECT
EXPORT.ZONE
EXPORT.PAN_INDIA
```

### Comments

```
COMMENT.CREATE
COMMENT.DELETE.OWN
COMMENT.DELETE.ANY                    -- admin only
```

### Attachments

```
ATTACHMENT.UPLOAD.OWN_RECORDS
ATTACHMENT.DOWNLOAD
ATTACHMENT.DELETE.OWN
ATTACHMENT.DELETE.ANY
```

### User management and system

```
USER.READ
USER.CREATE
USER.UPDATE
USER.DEACTIVATE
ROLE.MANAGE
PERMISSION.GRANT                      -- grant ad-hoc permissions to users
FEATURE_FLAG.MANAGE
AUDIT_LOG.READ.OWN
AUDIT_LOG.READ.ALL
```

---

## 3. Designation → default roles (and roles → permissions)

The mapping is two-step: designation gets default roles, roles bundle permissions. Both layers are in the database; the second is the bigger table.

### Designation → role defaults (seed)

```
EDGS_CI         -> ROLE_EDGS_CI
CAO_C           -> ROLE_CAO_C
CE_C            -> ROLE_CE_C
DY_CE_C         -> ROLE_DY_CE_C
                   (and gets ROLE_NODAL_DY_CE_C added on a per-project basis,
                    not by default — handled at assignment time)
ADMIN           -> ROLE_ADMIN
SUPER_ADMIN     -> ROLE_SUPER_ADMIN
All approval designations (SR_DEN, DY_CSTE, ...) -> ROLE_APPROVER_GENERIC
```

The `ROLE_APPROVER_GENERIC` is a placeholder bundle granting `DRAWING.APPROVE` and `DRAWING.SEND_BACK`. The actual *which drawings* gate is enforced at runtime by the `PermissionEvaluator` checking the `drawing_approvers` table — the role permission alone is necessary but not sufficient.

### Role → permission bundles (excerpt)

```
ROLE_EDGS_CI:
  PROJECT.CREATE, PROJECT.READ.ALL, PROJECT.UPDATE.OWN, PROJECT.DROP,
  DASHBOARD.VIEW.PAN_INDIA, EXPORT.PAN_INDIA, COMMENT.CREATE,
  AUDIT_LOG.READ.OWN

ROLE_CAO_C:
  PROJECT.READ.ZONE, PROJECT.ALLOCATE, PROJECT.HOLD_RESUME,
  ACTIVITY.READ.ZONE, ACTIVITY_RECORD.READ.ZONE,
  DASHBOARD.VIEW.ZONE, EXPORT.ZONE,
  COMMENT.CREATE, AUDIT_LOG.READ.OWN

ROLE_CE_C:
  PROJECT.READ.OWN, PROJECT.ASSIGN_DYCE, PROJECT.DESIGNATE_NODAL,
  PROJECT.HOLD_RESUME, PROJECT.COMPLETE,
  ACTIVITY.READ.OWN, ACTIVITY.UPDATE.OWN,
  ACTIVITY_RECORD.READ.OWN, ACTIVITY_RECORD.UPDATE.OWN,
  ACTIVITY_RECORD.AUTHENTICATE, ACTIVITY_RECORD.SEND_BACK,
  ACTIVITY_RECORD.BULK_TRANSITION,
  DRAWING.EDIT_APPROVERS, DRAWING.REASSIGN_APPROVER,
  DASHBOARD.VIEW.PROJECT, EXPORT.PROJECT,
  ATTACHMENT.DOWNLOAD, COMMENT.CREATE, AUDIT_LOG.READ.OWN

ROLE_NODAL_DY_CE_C:
  (includes everything in ROLE_DY_CE_C plus:)
  ACTIVITY_RECORD.VERIFY, ACTIVITY_RECORD.SEND_BACK,
  DRAWING.EDIT_APPROVERS

ROLE_DY_CE_C:
  PROJECT.READ.OWN, ACTIVITY.CREATE.ASSIGNED, ACTIVITY.READ.OWN,
  ACTIVITY_RECORD.CREATE.ASSIGNED, ACTIVITY_RECORD.READ.OWN,
  ACTIVITY_RECORD.UPDATE.OWN, ACTIVITY_RECORD.SUBMIT,
  ATTACHMENT.UPLOAD.OWN_RECORDS, ATTACHMENT.DOWNLOAD,
  COMMENT.CREATE, DASHBOARD.VIEW.PROJECT, AUDIT_LOG.READ.OWN

ROLE_APPROVER_GENERIC:
  DRAWING.APPROVE, DRAWING.SEND_BACK, ATTACHMENT.DOWNLOAD,
  COMMENT.CREATE

ROLE_ADMIN:
  USER.READ, USER.CREATE, USER.UPDATE, USER.DEACTIVATE,
  ROLE.MANAGE, FORM_DEFINITION.READ, FORM_DEFINITION.UPDATE,
  FORM_DEFINITION.PUBLISH, FEATURE_FLAG.MANAGE,
  AUDIT_LOG.READ.ALL, COMMENT.DELETE.ANY, ATTACHMENT.DELETE.ANY
  (does NOT include PERMISSION.GRANT — that requires SUPER_ADMIN)

ROLE_SUPER_ADMIN:
  All permissions, all scopes.

ROLE_BOARD_VIEWER (granted by ad-hoc permission, not by designation):
  PROJECT.READ.ALL, ACTIVITY.READ.ALL, ACTIVITY_RECORD.READ.ALL,
  DASHBOARD.VIEW.PAN_INDIA, EXPORT.PAN_INDIA,
  ATTACHMENT.DOWNLOAD, AUDIT_LOG.READ.OWN
```

Full bundles are in `db/data/V010__seed_role_permissions.sql`.

---

## 4. Scope evaluation

The `PermissionEvaluator.hasPermission(principal, target, permission)` resolves scopes:

```
Check 1: Does principal hold the exact permission code? (e.g., PROJECT.READ.ZONE)
Check 2: If permission has a scope suffix, does principal hold a broader-scope variant? (READ.ALL covers READ.ZONE)
Check 3: If permission requires ownership/assignment, does it hold?
         - OWN: target.zoneId matches principal's accessible zones AND
                principal has a project_assignment on target.projectId
         - ZONE: target.zoneId in principal's accessible zones
         - ALL: always passes
```

Accessible zones = `{primary_zone_id} ∪ {active user_zone_assignments.zone_id}` plus, if principal is SUPER_ADMIN, all zones.

The evaluator runs on every `@PreAuthorize` invocation and on every service method that exposes data. List endpoints additionally apply a query-level filter so users see only what they're permitted to see (preventing the "200 OK with empty list, 403 on detail" anti-pattern).

---

## 5. Picker filter matrix

Every user-selection picker uses `UserPickerService` with a context discriminator. The query templates:

### A. CAO/C → CE/C allocation

```sql
select u.* from users u
where u.designation_code = 'CE_C'
  and u.is_active and not u.is_deleted
  and (u.primary_zone_id = :project_zone_id
       or exists (select 1 from user_zone_assignments uza
                  where uza.user_id = u.id and uza.zone_id = :project_zone_id
                    and uza.is_active and (uza.expires_at is null or uza.expires_at > now())))
order by u.name;
```

### B. CE/C → Dy CE/C assignment

```sql
select u.* from users u
where u.designation_code = 'DY_CE_C'
  and u.is_active and not u.is_deleted
  and (u.primary_zone_id = :project_zone_id or cross_zone_grant)
order by u.name;
```

Multi-select. The picker excludes Dy CE/Cs already assigned to the project.

### C. CE/C → designate Nodal

Source: existing `project_assignments` where `project_id = :project_id AND assignment_role = 'DY_CE_C'`. No external query — only users already assigned to the project are candidates.

### D. Activity → primary Dy CE/C

Same source as C — only Dy CE/Cs assigned to the project. Default selection is the current user if they're a Dy CE/C on the project; otherwise the Nodal.

### E. Comment @mention

```sql
select u.* from users u
where u.is_active and not u.is_deleted
  and (u.primary_zone_id = :project_zone_id or cross_zone_grant
       or u.id in (select user_id from project_assignments
                   where project_id = :project_id and is_active))
  and u.name ilike :search_term || '%'
order by u.name
limit 10;
```

Typeahead with limit. Same-project users + zone users.

### F. Drawing approver add

```sql
select u.* from users u
where u.designation_code in (:approval_designations_for_this_drawing_type)
  and u.is_active and not u.is_deleted
  and (u.primary_zone_id = :project_zone_id or cross_zone_grant)
order by u.designation_code, u.name;
```

Grouped by designation in the UI. The "approval_designations_for_this_drawing_type" set comes from the form definition's `default_approver_designations` (decision DDDD allows any approval-role to be added beyond the defaults).

### G. Send-back recipient

No picker — fixed to the original sender of the workflow transition that brought the record to the current state. Returned implicitly by the `send_back` action.

### H. Admin / Super admin pickers (user management)

```sql
select u.* from users u
where u.is_active and not u.is_deleted
  -- no zone filter; admin operates globally
order by u.zone, u.designation_code, u.name;
```

Restricted to ADMIN / SUPER_ADMIN designations.

---

## 6. System grants (non-designation-derived)

A small set of capabilities aren't tied to designation. Granted via `user_permissions` rows by SUPER_ADMIN.

| Permission | Typical grantees |
|---|---|
| `DASHBOARD.VIEW.PAN_INDIA` | Railway Board members, EDGS/C-I (already has via role), specific HQ officers |
| `EXPORT.PAN_INDIA` | Same as above |
| `AUDIT_LOG.READ.ALL` | Admins, security/audit team |
| `PROJECT.READ.ALL` | Same as PAN_INDIA viewers |

Granting `DASHBOARD.VIEW.PAN_INDIA` is itself audited as a SECURITY_EVENT.

---

## 7. Transfer policy

When a user's `primary_zone_id` or `primary_division_id` changes:

1. The change writes to `audit_log` with action `USER_TRANSFER` and full before/after.
2. Existing `project_assignments` rows are NOT modified — historical work continues to belong to the user.
3. Existing `drawing_approvers` rows where `user_id = the user` are NOT modified — they can still approve in-flight drawings.
4. New picker queries reflect the new zone immediately.

Manual remediation: Admin can deactivate specific assignments or swap approvers if the transfer is permanent and the user shouldn't continue work elsewhere.

---

## 8. Audit and security events

The following actions write `audit_log` rows with `action = 'SECURITY_EVENT'`:

- Successful and failed logins (when real auth lands)
- Permission grant / revoke
- Role membership change
- Approver list edit on a drawing
- Project state transitions to `DROPPED` or `COMPLETED`
- Data export (which user exported what scope, when)
- Soft-delete and restore of any entity by Admin
- Schema migration applied
- Permission-denied responses on sensitive endpoints (configurable allowlist)

Security events are queried separately from data audit by `AUDIT_LOG.READ.ALL` holders. See `security.md`.

---

## 9. Implementation notes

The `Principal` interface (architecture § 8) is the single carrier of identity:

```kotlin
interface Principal {
    val userId: UUID
    val designationCode: String
    val primaryZoneId: UUID?
    val primaryDivisionId: UUID?
    val crossZoneIds: Set<UUID>
    val accessibleZoneIds: Set<UUID>      // primary + cross
    val roleCodes: Set<String>
    val permissions: Set<String>           // union of role-derived and ad-hoc
    val isSuperAdmin: Boolean

    fun hasPermission(code: String): Boolean
    fun canAccessZone(zoneId: UUID): Boolean
}
```

Built once per request by `AuthenticationProvider`. Spring caches it for the request scope. Methods annotated `@PreAuthorize` use a Spring SpEL expression hitting `@permissionEvaluator.hasPermission(authentication, #target, 'CODE')` which delegates to our `PermissionEvaluator` bean. The `PermissionEvaluator` is the only place that knows the scope-implication rules.

User code never inspects roles directly. Always:

```kotlin
@PreAuthorize("@pe.hasPermission(authentication, #recordId, 'ACTIVITY_RECORD.AUTHENTICATE')")
fun authenticate(@PathVariable recordId: UUID, @RequestBody body: ActionRequest): RecordResponse
```

Not:

```kotlin
if (principal.roleCodes.contains("ROLE_CE_C")) { ... }   // forbidden
```

CI lints for inline role checks via a Detekt custom rule.
