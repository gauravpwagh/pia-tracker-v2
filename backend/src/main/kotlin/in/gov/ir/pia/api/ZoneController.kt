package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.domain.Zone
import `in`.gov.ir.pia.repository.ZoneRepository
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class ZoneResponse(
    val id: UUID,
    val code: String,
    val name: String,
    val shortName: String,
    val displayOrder: Int,
)

/**
 * Reference data endpoint for the zone catalogue.
 *
 *   GET /api/v1/zones — all active zones ordered by display_order.
 *                       Used by the "Create Project" form zone picker.
 */
@RestController
@Tag(name = "Zones", description = "Reference data: zone catalogue")
class ZoneController(
    private val zoneRepository: ZoneRepository,
) {
    @GetMapping("/api/v1/zones")
    @PreAuthorize("isAuthenticated()")
    @Operation(
        summary = "List active zones",
        description = "Returns all active Indian Railways zones ordered by display_order. " +
            "Used as the zone picker source for the Create Project form.",
        responses = [
            ApiResponse(responseCode = "200", description = "Zone list returned"),
            ApiResponse(responseCode = "401", description = "Not authenticated"),
        ],
    )
    fun list(): List<ZoneResponse> =
        zoneRepository
            .findAllByIsActiveTrueOrderByDisplayOrder()
            .map { it.toResponse() }

    private fun Zone.toResponse() =
        ZoneResponse(
            id = id,
            code = code,
            name = name,
            shortName = shortName,
            displayOrder = displayOrder,
        )
}
