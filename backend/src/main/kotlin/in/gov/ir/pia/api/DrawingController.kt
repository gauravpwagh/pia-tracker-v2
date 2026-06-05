package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.workflow.AddApproverRequest
import `in`.gov.ir.pia.workflow.DrawingApproverListResponse
import `in`.gov.ir.pia.workflow.DrawingApproverResponse
import `in`.gov.ir.pia.workflow.DrawingService
import `in`.gov.ir.pia.workflow.UpdateApprovalRequest
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
 * REST controller for the drawing approver checklist.
 *
 * Approving authorities (SR_DEN, DY_CEE, CBE, etc.) do NOT log in to the system.
 * DY CE/C or Nodal DY CE/C records the date of physical sign-off against each slot.
 *
 * Endpoint catalogue:
 *   GET    /api/v1/activity-records/{id}/drawing-approvers              — list approvers + allApproved flag
 *   PATCH  /api/v1/activity-records/{id}/drawing-approvers/{aid}        — record / clear approval date
 *   POST   /api/v1/activity-records/{id}/drawing-approvers              — add an approver slot
 *   DELETE /api/v1/activity-records/{id}/drawing-approvers/{aid}        — remove a slot (only if not approved)
 */
@RestController
@Tag(name = "Drawing Approvals", description = "Drawing checklist approval operations")
class DrawingController(
    private val drawingService: DrawingService,
) {
    /** List all approver slots for a drawing record. */
    @GetMapping("/api/v1/activity-records/{id}/drawing-approvers")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.OWN')")
    @Operation(summary = "List drawing approvers", description = "Returns all slots with approval dates and allApproved flag.")
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "List returned"),
        ApiResponse(responseCode = "404", description = "Record not found"),
    )
    fun listApprovers(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): DrawingApproverListResponse = drawingService.listApprovers(id, principal)

    /**
     * Record (or clear) the date of physical sign-off for an approver slot.
     * Called by DY CE/C or Nodal DY CE/C when approval is received from the authority.
     */
    @PatchMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.UPDATE.OWN')")
    @Operation(
        summary = "Record approval date",
        description = "Sets or clears the approvedOn date for an approver slot. approvedOn null clears the approval.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Slot updated"),
        ApiResponse(responseCode = "404", description = "Record or slot not found"),
    )
    fun updateApproval(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @RequestBody request: UpdateApprovalRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): DrawingApproverResponse = drawingService.updateApproval(id, approverId, request, principal)

    /** Add an approver slot. designationCode must be an approval-role designation. */
    @PostMapping("/api/v1/activity-records/{id}/drawing-approvers")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.EDIT_APPROVERS')")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add an approver slot")
    @ApiResponses(
        ApiResponse(responseCode = "201", description = "Slot added"),
        ApiResponse(responseCode = "422", description = "Not a valid approval-role designation"),
    )
    fun addApprover(
        @PathVariable id: UUID,
        @RequestBody request: AddApproverRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): DrawingApproverResponse = drawingService.addApprover(id, request, principal)

    /** Remove an approver slot (only allowed if approvedOn is null). */
    @DeleteMapping("/api/v1/activity-records/{id}/drawing-approvers/{approverId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'DRAWING.EDIT_APPROVERS')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove an approver slot", description = "Cannot remove an already-approved slot.")
    @ApiResponses(
        ApiResponse(responseCode = "204", description = "Slot removed"),
        ApiResponse(responseCode = "409", description = "Slot already approved"),
    )
    fun removeApprover(
        @PathVariable id: UUID,
        @PathVariable approverId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        drawingService.removeApprover(id, approverId, principal)
    }
}
