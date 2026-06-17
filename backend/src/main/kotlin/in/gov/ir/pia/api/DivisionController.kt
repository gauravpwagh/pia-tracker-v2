package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.domain.Division
import `in`.gov.ir.pia.repository.DivisionRepository
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class DivisionResponse(
    val id: UUID,
    val zoneId: UUID,
    val code: String,
    val name: String,
    val displayOrder: Int,
)

/**
 * Reference data endpoint for the division catalogue.
 *
 *   GET /api/v1/divisions            — all active divisions ordered by display_order.
 *   GET /api/v1/divisions?zoneId={} — active divisions for a specific zone.
 *
 * Used by the "Create Project" wizard Step 1 division picker.
 */
@RestController
@Tag(name = "Divisions", description = "Reference data: division catalogue")
class DivisionController(
    private val divisionRepository: DivisionRepository,
) {
    @GetMapping("/api/v1/divisions")
    @PreAuthorize("isAuthenticated()")
    @Operation(
        summary = "List active divisions",
        description =
            "Returns active Indian Railways divisions ordered by display_order. " +
                "Pass zoneId to filter to a specific zone (used by the Create Project wizard).",
        responses = [
            ApiResponse(responseCode = "200", description = "Division list returned"),
            ApiResponse(responseCode = "401", description = "Not authenticated"),
        ],
    )
    fun list(
        @RequestParam(required = false) zoneId: UUID?,
    ): List<DivisionResponse> =
        if (zoneId != null) {
            divisionRepository.findAllByZoneIdAndIsActiveTrueOrderByDisplayOrder(zoneId)
        } else {
            divisionRepository.findAllByIsActiveTrueOrderByDisplayOrder()
        }.map { it.toResponse() }

    private fun Division.toResponse() =
        DivisionResponse(
            id = id,
            zoneId = zoneId,
            code = code,
            name = name,
            displayOrder = displayOrder,
        )
}
