# backend/workflow — Workflow engine and drawings checklist

This package owns the workflow engine (docs/workflow.md) and the drawings checklist model.

## Components

- `WorkflowService` — the **only** entry point for state changes on workflow-engine entities. Direct writes to `workflow_instances.current_state_id` are forbidden.
- `WorkflowDefinitionService` — CRUD on definitions, version management.
- `WorkflowEngine` — internal — applies transitions, validates roles, writes history.
- `DrawingService` — the parallel service for drawings. Drawings do NOT use the engine; they use the `drawing_approvers` checklist.
- `DrawingStateDeriver` — pure function: given a list of approver rows, return the derived state (`DRAFT` / `IN_APPROVAL` / `SENT_BACK` / `APPROVED`).
- `SlaBreachDetectionJob` — scheduled every 15 min; bumps summary counters and fires SLA_BREACH notifications for newly-breached instances.

## Rules

- **Single mutation entry point.** All state changes go through `WorkflowService.transition()` (engine) or `DrawingService.approve / sendBack / reapprove` (drawings).
- **One transaction per transition.** History write, state update, summary update, and notification emission all happen in one DB transaction; rollback is atomic.
- **Workflow versioning.** Existing instances stay on their original `workflow_definitions` version forever. New instances use the latest active version.
- **Drawings != engine.** Don't try to unify them. The checklist model exists for good reasons (per-approver parallelism, independent send-backs); see `docs/workflow.md` § 5.

## When you're touching this

Re-read `docs/workflow.md` — especially § 5 (drawings) and § 6 (SLA model). And make sure the property tests still pass.
