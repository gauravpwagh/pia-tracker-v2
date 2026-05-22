package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.workflow.AddApproverRequest
import `in`.gov.ir.pia.workflow.ApproveRequest
import `in`.gov.ir.pia.workflow.DrawingApproverListResponse
import `in`.gov.ir.pia.workflow.DrawingApproverResponse
import `in`.gov.ir.pia.workflow.DrawingService
import `in`.gov.ir.pia.workflow.ReapproveRequest
import `in`.gov.ir.pia.workflow.ReassignApproverRequest
import `in`.gov.ir.pia.workflow.SendBackRequest
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * REST controller for the drawing checklist model (Phase 2.5).
 *
 * Drawings use the [DrawingService] checklist model, NOT the workflow engine.
 * There are no WorkflowInstance rows for drawing activity records.
 *
 * Endpoint catalogue:
 *   GET    /api/v1/activity-records/{id}/drawing-approvers              — list approvers + derived state
 *   POST   /api/v1/activity-records/{id}/submit-drawing                 — DRAFT → IN_APPROVAL
 *   POST   /api/v1/activity-records/{id}/drawing-approvers/{aid}/approve    — approve one slot
 *   POST   /api/v1/activity-records/{id}/drawing-approvers/{aid}/send-back  — send back one slot
 *   POST   /api/v1/activity-records/{id}/reapprove-drawing               — re-submit after send-back
 *   POST   /api/v1/activity-records/{id}/drawing-approvers               — add approver slot (Phase 2.7)
 *   DELETE /api/v1/activity-records/{id}/drawing-approvers/{aid}         — remove approver slot (Phase 2.7)
 *   PATCH  /api/v1/activity-records/{id}/drawing-approvers/{aid}         — reassign user on slot (Phase 2.7)
 */
@RestController
@Tag(name = "Drawing Approvals", description = "Drawing checklist approval operations")
class DrawingController(
    private val drawingService: DrawingService,
) {
    @GetMapping("/api/v1/activity-records/{id}/drawing-approvers")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.OWN') or " +
            "@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.ALL') or " +
            "@pe.hasPermission(authentication, null, 'DRAWING.APPROVE') or " +
            "@pe.hasPermission(authentication, null, 'DRAWING.SEND_BACK')",
    )
    @Operation(
        summary = "List drawing approvers",
        description = "Returns all approver slots for the drawing record and its derived overall state.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Approver list returned"),
        ApiResponse(responseCode = "404", description = "Record not found or not accessible"),
    )
    fun listApprovers(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): DrawingApproverListResponse = drawingService.listApprovers(id, principal)

    @PostMapping("/api/v1/activity-records/{id}/submit-drawing")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.SUBMIT')")
    @Operation(
        summary = "Submit drawing for approval",
        description =
            "Transitions the drawing from DRAFT to IN_APPROVAL. " +
                "Can only be called once; the drawing must be in DRAFT state.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Drawing submitted"),
        ApiResponse(responseCode = "404", description = "Record not found or not accessible"),
        ApiResponse(responseCode = "409", description = "Drawing not in DRAFT state"),
    )
    fun submitDrawing(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.submit(id, principal)
    }

    @PostMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}/approve")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.APPROVE')")
    @Operation(
        summary = "Approve a drawing slot",
        description =
            "Sets the specified approver slot to APPROVED. " +
                "The actor must be the user assigned to that slot.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Slot approved"),
        ApiResponse(responseCode = "403", description = "Not assigned to this approver slot"),
        ApiResponse(responseCode = "404", description = "Record or approver slot not found"),
        ApiResponse(responseCode = "409", description = "Slot is not in PENDING status"),
    )
    fun approve(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @RequestBody(required = false) request: ApproveRequest?,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.approve(id, approverId, principal, request?.comment)
    }

    @PostMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}/send-back")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.SEND_BACK')")
    @Operation(
        summary = "Send a drawing back for revision",
        description =
            "Sets the specified approver slot to SENT_BACK (decision CCCC: only that slot changes). " +
                "A non-blank comment is required. " +
                "The actor must be the user assigned to that slot.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Slot sent back"),
        ApiResponse(responseCode = "403", description = "Not assigned to this approver slot"),
        ApiResponse(responseCode = "404", description = "Record or approver slot not found"),
        ApiResponse(responseCode = "409", description = "Slot is not in PENDING status"),
        ApiResponse(responseCode = "422", description = "Comment is required"),
    )
    fun sendBack(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @RequestBody request: SendBackRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.sendBack(id, approverId, principal, request.comment)
    }

    @PostMapping("/api/v1/activity-records/{id}/reapprove-drawing")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.SUBMIT')")
    @Operation(
        summary = "Re-submit drawing after send-back",
        description =
            "Flips all SENT_BACK approver slots back to PENDING (decision BBBB: APPROVED slots stay). " +
                "If requestReApproval = true, APPROVED slots are also reset (substantive change).",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Drawing re-submitted"),
        ApiResponse(responseCode = "404", description = "Record not found or not accessible"),
        ApiResponse(responseCode = "409", description = "Drawing is not in SENT_BACK state"),
    )
    fun reapprove(
        @PathVariable id: UUID,
        @RequestBody(required = false) request: ReapproveRequest?,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.reapprove(id, principal, request?.requestReApproval ?: false)
    }

    // ── Phase 2.7 — approver edit flow ────────────────────────────────────────

    @PostMapping("/api/v1/activity-records/{id}/drawing-approvers")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.EDIT_APPROVERS')")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
        summary = "Add an approver slot",
        description =
            "Inserts a new PENDING approver slot on the drawing checklist. " +
                "The designationCode must be an approval-role designation. " +
                "If userId is supplied the named user receives an inbox notification. " +
                "Gated to DRAWING.EDIT_APPROVERS (CE/C, Nodal Dy CE/C, Super Admin).",
    )
    @ApiResponses(
        ApiResponse(responseCode = "201", description = "Approver slot added"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Record not found or not accessible"),
        ApiResponse(responseCode = "422", description = "designationCode is not a valid approval-role designation"),
    )
    fun addApprover(
        @PathVariable id: UUID,
        @RequestBody request: AddApproverRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): DrawingApproverResponse = drawingService.addApprover(id, request, principal)

    @DeleteMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.EDIT_APPROVERS')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
        summary = "Remove an approver slot",
        description =
            "Soft-deletes an approver slot (is_deleted = true). " +
                "Decision BBBB: APPROVED slots cannot be removed — throws 409. " +
                "Gated to DRAWING.EDIT_APPROVERS (CE/C, Nodal Dy CE/C, Super Admin).",
    )
    @ApiResponses(
        ApiResponse(responseCode = "204", description = "Approver slot removed"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Record or approver slot not found"),
        ApiResponse(responseCode = "409", description = "Slot is APPROVED and cannot be removed (decision BBBB)"),
    )
    fun removeApprover(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.removeApprover(id, approverId, principal)
    }

    @PatchMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.REASSIGN_APPROVER')")
    @Operation(
        summary = "Reassign an approver slot to a different user",
        description =
            "Swaps the userId on an existing PENDING or SENT_BACK slot. " +
                "Decision BBBB: APPROVED slots cannot be reassigned — throws 409. " +
                "If the new userId is non-null, the new user receives an inbox notification. " +
                "Gated to DRAWING.REASSIGN_APPROVER (CE/C, Super Admin).",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Approver slot reassigned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Record or approver slot not found"),
        ApiResponse(responseCode = "409", description = "Slot is APPROVED and cannot be reassigned (decision BBBB)"),
    )
    fun reassignApprover(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @RequestBody request: ReassignApproverRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.reassignApprover(id, approverId, request.userId, principal)
    }
}
