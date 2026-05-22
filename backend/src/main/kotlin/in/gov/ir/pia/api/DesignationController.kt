package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.domain.Designation
import `in`.gov.ir.pia.repository.DesignationRepository
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class DesignationResponse(
    val code: String,
    val name: String,
    val shortLabel: String,
    val category: String,
    val isApprovalRole: Boolean,
    val isDataEntryRole: Boolean,
    val displayOrder: Int,
)

/**
 * Reference data endpoints for the [Designation] catalogue.
 *
 *   GET /api/v1/designations/approval-roles — all designations where is_approval_role = true,
 *                                              ordered by display_order.
 *                                              Used by the "Add Approver" picker on drawing records.
 */
@RestController
@Tag(name = "Designations", description = "Reference data: designation catalogue")
class DesignationController(
    private val designationRepository: DesignationRepository,
) {
    @GetMapping("/api/v1/designations/approval-roles")
    @PreAuthorize("isAuthenticated()")
    @Operation(
        summary = "List approval-role designations",
        description = "Returns all designations flagged is_approval_role = true, ordered by display_order. " +
            "Used as the source list for the drawing 'Add Approver' picker (Phase 2.7).",
        responses = [
            ApiResponse(responseCode = "200", description = "List returned successfully"),
            ApiResponse(responseCode = "401", description = "Not authenticated"),
        ],
    )
    fun listApprovalRoles(): List<DesignationResponse> =
        designationRepository
            .findAllByIsApprovalRoleTrueOrderByDisplayOrder()
            .map { it.toResponse() }

    private fun Designation.toResponse() =
        DesignationResponse(
            code = code,
            name = name,
            shortLabel = shortLabel,
            category = category,
            isApprovalRole = isApprovalRole,
            isDataEntryRole = isDataEntryRole,
            displayOrder = displayOrder,
        )
}
