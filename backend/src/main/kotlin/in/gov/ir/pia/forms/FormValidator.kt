package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.JsonNode

/**
 * Cross-field validation error produced by a [FormValidator].
 *
 * [field] is a dot-separated path to the failing field (e.g.
 * `"section_20e.declaration_gazette.published_on"`); used by the frontend
 * to highlight the correct field.
 *
 * [message] is a human-readable English description of the violation.
 */
data class ValidationError(
    val field: String,
    val message: String,
)

/**
 * Implemented per activity type to enforce business rules that span multiple
 * form fields — rules that JSON Schema cannot express.
 *
 * ## Discovery
 *
 * Spring DI auto-discovers all [FormValidator] beans.  [FormDefinitionService]
 * iterates the registered validators and runs the one whose [activityTypeCode]
 * and [formCode] match the form being validated.
 *
 * ## When to add a new validator
 *
 * Only add cross-field validators for rules that cannot be expressed in
 * JSON Schema (e.g., date ordering across two distinct section objects).
 * Single-field rules (type, range, pattern, required) belong in the schema.
 *
 * ## Validation order
 *
 * JSON Schema validation runs first.  Cross-field validators only run when
 * the schema is satisfied.  This keeps the error messages clean — you won't
 * see both a type error and a date-ordering error for the same field.
 *
 * ## Input
 *
 * [validate] receives the **complete** record `data_json` (not a section
 * slice).  Validators must navigate the full object tree themselves.
 * Absent sections (null / missing keys) should be gracefully skipped —
 * autosave can produce partial data.
 */
interface FormValidator {
    /** The activity type this validator applies to (e.g. "LAND_ACQUISITION"). */
    val activityTypeCode: String

    /** The form code this validator applies to (e.g. "LAND_ACQUISITION_V1"). */
    val formCode: String

    /**
     * Returns an empty list when [data] passes all cross-field rules.
     * Returns one or more [ValidationError] instances when rules are violated.
     *
     * Must **not** throw — capture all errors and return them together.
     */
    fun validate(data: JsonNode): List<ValidationError>
}
