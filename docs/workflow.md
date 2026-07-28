# PIA Tracker — Workflow

**Status:** Draft v1.
**See also:** `architecture.md` § 4.2 (engine), § 4.6 (drawings); `database.md` § 6 (schema), § 7 (drawings).

This document specifies the workflow engine — what it does, how states and transitions are configured, the three usage patterns, the SLA model, and the separate checklist model for drawings.

---

## 1. Engine overview

One generic engine handles three patterns. The pattern is determined by `workflow_definitions.applies_to`:

- `PROJECT` — one instance per project; states represent the project lifecycle.
- `RECORD` — one instance per `activity_record`; states represent the record's draft → submitted → verified → authenticated progression.
- `SECTION` — N instances per `activity_record`, one per section code (e.g., nine for Land Acquisition); same states as RECORD but scoped to a section.

Drawings do **not** use the engine. They use the checklist model in § 5 below.

---

## 2. Service API

All state changes go through `WorkflowService`. Direct writes to `workflow_instances.current_state_id` are forbidden (architecture § 15).

```kotlin
interface WorkflowService {
    fun start(definition: WorkflowDefinition, entityType: String, entityId: UUID,
              sectionCode: String? = null): WorkflowInstance

    fun transition(instanceId: UUID, actionCode: String, actor: Principal,
                   comment: String? = null, observation: JsonNode? = null): WorkflowInstance

    fun currentState(entityType: String, entityId: UUID, sectionCode: String? = null): WorkflowState

    fun history(instanceId: UUID): List<WorkflowHistoryEntry>

    fun isSlaBreached(instanceId: UUID): Boolean
}
```

`transition()` is the single mutation entry point. It:

1. Loads the instance + current state + the transition matching `actionCode` from current state.
2. Validates the actor has the required role and any required comment is present.
3. Inserts a `workflow_history` row.
4. Updates `workflow_instances.current_state_id` and `entered_state_at`.
5. Fires a domain event (`WorkflowStateChanged`) that the `SummaryUpdater` listens to.
6. Updates `activity_records.record_state` cache if applicable.
7. Returns the new instance. All within the same DB transaction.

Failed validation throws a typed exception (`WorkflowTransitionNotAllowedException`, `InsufficientRoleException`, `MissingCommentException`) that the API layer maps to HTTP 403/422.

---

## 3. Project lifecycle workflow

One workflow_definition, one instance per project. Configured at startup via Flyway data migration.

| Code | Label | Initial | Terminal | Role required | SLA days |
|---|---|---|---|---|---|
| `DRAFT` | Draft | ✓ | | `EDGS_CI` | — |
| `AWAITING_CAO_ALLOCATION` | Awaiting allocation | | | `CAO_C` | 14 |
| `AWAITING_CEC_ASSIGNMENT` | Awaiting Dy CE/C assignment | | | `CE_C` | 7 |
| `ACTIVE` | Active | | | — | — |
| `ON_HOLD` | On hold | | | — | — |
| `COMPLETED` | Completed | | ✓ | — | — |
| `DROPPED` | Dropped | | ✓ | — | — |

Transitions:

| From | To | Action | Required role | Requires comment |
|---|---|---|---|---|
| `DRAFT` | `AWAITING_CAO_ALLOCATION` | submit | `EDGS_CI` | no |
| `AWAITING_CAO_ALLOCATION` | `AWAITING_CEC_ASSIGNMENT` | allocate | `CAO_C` | no |
| `AWAITING_CEC_ASSIGNMENT` | `ACTIVE` | assign_dyces | `CE_C` | no |
| `ACTIVE` | `ON_HOLD` | hold | `CE_C` or higher | yes |
| `ON_HOLD` | `ACTIVE` | resume | `CE_C` or higher | yes |
| `ACTIVE` | `COMPLETED` | complete | `CE_C` | yes |
| `ACTIVE` | `DROPPED` | drop | `EDGS_CI` | yes |
| `DRAFT` | `DROPPED` | drop | `EDGS_CI` | yes |

`COMPLETED` is **suggested** (not auto) when all `project_activities.status = COMPLETED`. The UI surfaces a "Mark project complete" prompt to the CE/C; the action remains manual.

---

## 4. Record and section workflows

The standard record-level workflow definition (used by short forms — Tender Packaging, Temporary Office Space, Utility Shifting records, Forest Clearance stages, Land Acquisition sections):

| Code | Label | Role required | SLA days |
|---|---|---|---|
| `DRAFT` | Draft | `DY_CE_C` (owning) | — |
| `SUBMITTED_FOR_VERIFICATION` | Submitted | `NODAL_DY_CE_C` | 7 |
| `VERIFIED` | Verified | `CE_C` | 5 |
| `AUTHENTICATED` | Authenticated (terminal) | — | — |
| `SENT_BACK_TO_DYCE` | Sent back to Dy CE/C | `DY_CE_C` (owning) | 3 |
| `SENT_BACK_TO_NODAL` | Sent back to Nodal | `NODAL_DY_CE_C` | 3 |

Transitions:

| From | To | Action | Role |
|---|---|---|---|
| `DRAFT` | `SUBMITTED_FOR_VERIFICATION` | submit | owning Dy CE/C |
| `SUBMITTED_FOR_VERIFICATION` | `VERIFIED` | verify | Nodal Dy CE/C |
| `SUBMITTED_FOR_VERIFICATION` | `SENT_BACK_TO_DYCE` | send_back | Nodal Dy CE/C (comment required) |
| `SENT_BACK_TO_DYCE` | `SUBMITTED_FOR_VERIFICATION` | resubmit | owning Dy CE/C |
| `VERIFIED` | `AUTHENTICATED` | authenticate | CE/C |
| `VERIFIED` | `SENT_BACK_TO_NODAL` | send_back | CE/C (comment required) |
| `SENT_BACK_TO_NODAL` | `VERIFIED` | re_verify | Nodal Dy CE/C |

The same definition handles Land Acquisition's section-level workflow — the engine just instantiates nine instances per record, one per section code (SRP, CALA, SECTION_20A, JMR, SECTION_20D, SECTION_20E, SECTION_20F_G, SECTION_20H_I, MUTATION).

When all section instances under a record reach `AUTHENTICATED`, a derived `record_state = COMPLETE` is set on `activity_records`. This is computed by a service method invoked after every section transition.

---

## 5. Drawings: checklist model (separate from engine)

Drawings live outside the workflow engine entirely. The model is in `database.md` § 7 (`drawing_approvers` table). Implementation: `DrawingService.kt` / `DrawingController.kt`.

**This section originally described a per-user approve/send-back workflow (status column, `sendBack()`/`reapprove()`, per-approver notifications and inbox). `V029__simplify_drawing_approvers.sql` deliberately replaced that with a much simpler record-keeping model early in Phase 2 — approving authorities never log in to the system, so the workflow machinery around them was dropped. What follows describes the model actually shipped.**

**Lifecycle states (derived).** A drawing's overall state is computed from its `drawing_approvers` rows and cached onto `activity_records.record_state`:

| If... | Then `record_state` is |
|---|---|
| Any non-deleted row has `approved_on IS NULL` | `DRAFT` |
| Every non-deleted row has `approved_on` set | `AUTHENTICATED` |

The computation lives in `DrawingService.deriveAndCacheState(recordId)`, called after every write to a record's approver slots (recording/clearing an approval date, or removing a slot).

**Schema (post-V029, plus V110).** Each `drawing_approvers` row is a designation-only slot — no `user_id`, no `status` enum:

```
id, activity_record_id, approval_designation_code, position,
sent_for_review_on DATE, reviewed_on DATE, approved_on DATE, remarks TEXT, is_deleted
```

`daysTakenForApproval` (API-only, not stored) is computed on read as `approved_on - sent_for_review_on` when both are set.

**Operations** (`DrawingController.kt`, all under `/api/v1/activity-records/{id}/drawing-approvers`):

```kotlin
class DrawingService {
    fun listApprovers(recordId: UUID, principal: PiaPrincipal): DrawingApproverListResponse
    fun updateApproval(recordId: UUID, approverId: UUID, request: UpdateApprovalRequest, actor: PiaPrincipal): DrawingApproverResponse
    fun seedDefaultApprovers(recordId: UUID, formDef: FormDefinition, projectZoneId: UUID?)   // called from record creation
    fun addApprover(recordId: UUID, request: AddApproverRequest, actor: PiaPrincipal): DrawingApproverResponse
    fun removeApprover(recordId: UUID, approverId: UUID, actor: PiaPrincipal)
}
```

There is no `submit`, `approve`, `sendBack`, or `reapprove` — recording (or clearing, by passing `approvedOn = null`) a sign-off date via `updateApproval` is the only state-changing action besides adding/removing slots.

**Creation flow.** On record creation, `seedDefaultApprovers()` reads `form_definitions.default_approver_designations` for the drawing subtype's form definition and inserts one `drawing_approvers` row per designation code, in declared order (`position` = index). No user matching, no zone lookup — slots are designation-only.

**Approver list edits.** Permission gate: `DRAWING.EDIT_APPROVERS` — currently CE/C, Nodal Dy CE/C, and Super Admin (decision AAAA still holds for who, even though the mechanics changed). `addApprover` inserts a new row with `approved_on = null`. `removeApprover` soft-deletes (`is_deleted = true`) — but is rejected with `409 CONFLICT` if the slot already has `approved_on` set, so an approved sign-off can't be edited away (the surviving half of decision BBBB; there is no longer an "APPROVED rows preserved on edit" nuance to preserve beyond that, since there's no status to preserve).

**No per-approver inbox or notifications.** Because slots are designation-only (no `user_id`), there is no way to compute "drawings pending my action" — `DrawingService` never writes to the `notifications` table. Progress is visible only via the record's `allApproved` flag and the approver list itself (each slot's `approved_on`/`remarks`).

---

## 6. SLA model

Each `workflow_states` row carries `sla_days` and `sla_warning_days`.

**Computation.** Real-time, no precomputation: `now() - entered_state_at`. If this exceeds `sla_days`, the instance is breached. If it exceeds `sla_warning_days` but not `sla_days`, it's in warning. Otherwise nominal.

**Effects.** Breach surfaces in three places:

1. **Dashboard counters.** A `sla_breach_count` column on every `project_*_summary` table, updated by the `SummaryUpdater` when any underlying instance crosses the threshold. A scheduled job (every 15 min) sweeps for instances that crossed during quiet periods and bumps summaries.
2. **Visual indicators.** Red badge on the tree node for breaches; amber for warning. Bubbles up: a record-level breach surfaces on its parent activity and parent project nodes.
3. **In-app notification.** When an instance first breaches, a `SLA_BREACH` notification is created for the role-required user and the project's CE/C.

**No auto-escalation, no auto-transition** (decision AA).

**Defaults.** Per § 3 (project) and § 4 (record). Drawings don't have SLA per-state (no states); instead, each `drawing_approvers` row carries a derived "pending since" = `now() - created_at` if pending, surfaced on the approver's inbox.

---

## 7. Bulk transitions

The engine supports bulk transitions within one HTTP request. The API exposes `POST /api/v1/workflow/bulk-transition` accepting a list of instance IDs + action code. The service iterates, applying each transition in its own subtransaction; failures are reported per instance without rolling back successful ones.

UI surface: checkbox column on record lists, action bar on top. CE/C selecting 10 records and clicking "Authenticate" sends one bulk request.

Bulk transitions audit each underlying transition individually — one audit_log row per record.

---

## 8. Workflow versioning

`workflow_definitions` is versioned like `form_definitions`. Existing `workflow_instances` reference the version they were started against; they continue to use that version's states and transitions until the instance terminates. New instances use the latest active version.

Editing a workflow definition (state list, transitions, SLAs) means inserting a new `workflow_definitions` row with `version` incremented and re-inserting the related `workflow_states` and `workflow_transitions`. The previous version becomes `is_active = false` but remains queryable for historical instances.

There is no schema-diff classifier for workflows the way there is for forms — workflow versions are independent universes. An admin tool surfaces "instances on outdated versions" so they can be reviewed and (optionally) migrated.

---

## 9. Workflow seeding

Initial seed data (Flyway `db/data/`):

- `workflow_definitions`: `PROJECT_LIFECYCLE_V1`, `RECORD_STANDARD_V1`, `SECTION_STANDARD_V1` (the latter two are usually the same definition; aliased for clarity in references).
- `workflow_states` and `workflow_transitions` for each.
- `form_definitions` for each activity type reference one of these workflow_definitions via the `workflow_definition_id` FK.

Drawing form definitions have `workflow_definition_id = null` because drawings don't use the engine. Their state derives from `drawing_approvers`.

---

## 10. Test obligations

Every workflow change must be accompanied by:

- Unit tests on `WorkflowService.transition()` for the new states/transitions (happy path + each forbidden actor + each missing requirement).
- A property-based test (jqwik) asserting: from every state, only the configured transitions are allowed.
- A migration test: starting an instance on the old version and confirming it remains usable after the new version ships.

For drawings:

- Unit tests on `DrawingService.deriveState()` covering all transitions of the `drawing_approvers.status` matrix.
- Test: editing approver list preserves APPROVED rows.
- Test: send-back doesn't reset PENDING / APPROVED rows.
- Property test: any sequence of approve/send-back operations terminates in either `APPROVED` or stays in `IN_APPROVAL`/`SENT_BACK`.

See `testing.md` for the broader test strategy.
