# backend/workflow — Workflow engine and drawings checklist

This package owns the workflow engine (docs/workflow.md) and the drawings checklist model.

## Components

- `WorkflowService` — the **only** entry point for state changes on workflow-engine entities. Direct writes to `workflow_instances.current_state_id` are forbidden.
- `WorkflowDefinitionService` — CRUD on definitions, version management.
- `WorkflowEngine` — internal — applies transitions, validates roles, writes history.
- `DrawingService` — the parallel service for drawings. Drawings do NOT use the engine; they use the `drawing_approvers` checklist — a designation-only, record-keeping model (no per-user status/send-back; see `docs/workflow.md` § 5). State derivation (`DRAFT`/`AUTHENTICATED`) is a private function inside `DrawingService`, not a separate class.

## Rules

- **Single mutation entry point.** All state changes go through `WorkflowService.transition()` (engine) or `DrawingService.updateApproval / addApprover / removeApprover` (drawings).
- **One transaction per transition.** History write, state update, and summary update happen in one DB transaction; rollback is atomic.
- **Workflow versioning.** Existing instances stay on their original `workflow_definitions` version forever. New instances use the latest active version.
- **Drawings != engine.** Don't try to unify them. The checklist model exists because approving authorities never log in to the system — see `docs/workflow.md` § 5.

## When you're touching this

Re-read `docs/workflow.md` — especially § 5 (drawings) and § 6 (SLA model). And make sure the property tests still pass.
