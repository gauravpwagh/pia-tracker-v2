package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.workflow.ApproveRequest
import `in`.gov.ir.pia.workflow.DrawingApproverListResponse
import `in`.gov.ir.pia.workflow.DrawingService
import `in`.gov.ir.pia.workflow.ReapproveRequest
import `in`.gov.ir.pia.workflow.SendBackRequest
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * REST controller for the drawing checklist model (Phase 2.5).
 *
 * Drawings use the [DrawingService] checklist model, NOT the workflow engine.
 * There are no WorkflowInstance rows for drawing activity records.
 *
 * Endpoint catalogue:
 *   GET  /api/v1/activity-records/{id}/drawing-approvers          — list approvers + derived state
 *   POST /api/v1/activity-records/{id}/submit-drawing             — DRAFT → IN_APPROVAL
 *   POST /api/v1/activity-records/{id}/drawing-approvers/{aid}/approve   — approve one slot
 *   POST /api/v1/activity-records/{id}/drawing-approvers/{aid}/send-back — send back one slot
 *   POST /api/v1/activity-records/{id}/reapprove-drawing          — re-submit after send-back
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
}
