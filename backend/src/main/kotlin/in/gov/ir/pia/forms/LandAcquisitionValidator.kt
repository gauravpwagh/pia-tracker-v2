package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.JsonNode
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Cross-field validator for `LAND_ACQUISITION_V1`.
 *
 * ## Rules enforced
 *
 * 1. **20A-before-20E** (`section_20e.declaration_gazette.published_on`
 *    must be ≥ `section_20a.notification_date`).
 *    Missing either date is not an error (autosave partial data is allowed).
 *
 * 2. **Chainage ordering** (`village_chainage_to` ≥ `village_chainage_from`).
 *    Missing either value is not an error.
 *
 * ## Validation timing
 *
 * This validator runs only when the entire JSON Schema is satisfied — i.e.,
 * on explicit Submit (Phase 1.11), not on autosave PATCH.  The service layer
 * is responsible for the ordering.
 */
@Component
class LandAcquisitionValidator : FormValidator {
    override val activityTypeCode: String = "LAND_ACQUISITION"
    override val formCode: String = "LAND_ACQUISITION_V1"

    override fun validate(data: JsonNode): List<ValidationError> {
        val errors = mutableListOf<ValidationError>()

        // ── Rule 1: 20A notification date ≤ 20E declaration date ─────────────
        val notificationDate: LocalDate? =
            data
                .path("section_20a")
                .path("notification_date")
                .textOrNull()
                ?.parseDate()

        val declarationDate: LocalDate? =
            data
                .path("section_20e")
                .path("declaration_gazette")
                .path("published_on")
                .textOrNull()
                ?.parseDate()

        if (notificationDate != null &&
            declarationDate != null &&
            declarationDate.isBefore(notificationDate)
        ) {
            errors +=
                ValidationError(
                    field = "section_20e.declaration_gazette.published_on",
                    message =
                        "Section 20E declaration date ($declarationDate) must be on or " +
                            "after the Section 20A notification date ($notificationDate)",
                )
        }

        // ── Rule 2: chainage_from ≤ chainage_to ──────────────────────────────
        val chainageFrom = data.path("village_chainage_from").textOrNull()?.parseChainage()
        val chainageTo = data.path("village_chainage_to").textOrNull()?.parseChainage()

        if (chainageFrom != null && chainageTo != null && chainageTo < chainageFrom) {
            errors +=
                ValidationError(
                    field = "village_chainage_to",
                    message =
                        "Village chainage-to (${data.path("village_chainage_to").asText()}) " +
                            "must be ≥ chainage-from (${data.path("village_chainage_from").asText()})",
                )
        }

        return errors
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun JsonNode.textOrNull(): String? = if (this.isMissingNode || this.isNull) null else this.asText().takeIf { it.isNotBlank() }

    private fun String.parseDate(): LocalDate? =
        try {
            LocalDate.parse(this)
        } catch (_: DateTimeParseException) {
            null
        }

    /**
     * Parse a chainage string `"132+450"` to an integer representing total
     * metres: `132 * 1000 + 450 = 132450`.  Returns null for malformed values.
     */
    private fun String.parseChainage(): Int? {
        val match = Regex("""^(\d+)\+(\d{3})$""").matchEntire(this) ?: return null
        val km = match.groupValues[1].toIntOrNull() ?: return null
        val m = match.groupValues[2].toIntOrNull() ?: return null
        return km * 1000 + m
    }
}
