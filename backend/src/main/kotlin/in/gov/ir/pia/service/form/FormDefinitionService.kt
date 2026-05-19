package `in`.gov.ir.pia.service.form

import com.fasterxml.jackson.databind.JsonNode
import `in`.gov.ir.pia.domain.form.FormDefinition
import `in`.gov.ir.pia.forms.FormValidator
import `in`.gov.ir.pia.forms.JsonSchemaValidationService
import `in`.gov.ir.pia.forms.ValidationError
import `in`.gov.ir.pia.repository.FormDefinitionRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Application service for [FormDefinition] reads and data validation.
 *
 * ## Validation order
 *
 * 1. JSON Schema validation — type, range, pattern, required fields.
 * 2. Cross-field validators (Spring-discovered [FormValidator] beans) — business
 *    rules that span multiple fields (e.g. date ordering across sections).
 *    These only run if JSON Schema passes; partial-data autosave skips them.
 *
 * All reads are read-only transactions; writes (admin form editor) are added
 * in a later phase and will have their own transactional service methods.
 */
@Service
@Transactional(readOnly = true)
class FormDefinitionService(
    private val formDefinitionRepository: FormDefinitionRepository,
    private val jsonSchemaValidationService: JsonSchemaValidationService,
    /** All [FormValidator] beans auto-discovered by Spring DI. */
    private val crossFieldValidators: List<FormValidator>,
) {
    /** Returns all active form definitions ordered by activity type then code. */
    fun listActive(): List<FormDefinition> =
        formDefinitionRepository.findAllByIsActiveTrueOrderByActivityTypeCodeAscCodeAsc()

    /**
     * Returns the latest active version of the form definition with [code],
     * or throws 404 if no active version exists.
     */
    fun getLatestActive(code: String): FormDefinition =
        formDefinitionRepository.findLatestActiveByCode(code)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Form definition '$code' not found")

    /**
     * Returns the form definition with [id], or throws 404.
     *
     * Used by the Record Edit Page to load the full schema and ui-schema for
     * rendering RJSF.  The permission check on the calling endpoint is
     * `ACTIVITY_RECORD.READ.OWN` — anyone who can read records needs the schema.
     */
    fun getById(id: java.util.UUID): FormDefinition =
        formDefinitionRepository.findById(id).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Form definition $id not found")
        }

    /**
     * Validates [data] against the JSON Schema **and** cross-field business
     * rules of the form definition identified by [code] (latest active version).
     *
     * ## Validation order
     *
     * 1. JSON Schema errors are returned immediately if present — cross-field
     *    validators are skipped (they may produce misleading errors on
     *    type-invalid data).
     * 2. If JSON Schema passes, registered [FormValidator] beans matching
     *    [activityTypeCode] + [formCode] run in registration order.
     *
     * @return empty list if valid; combined list of messages on failure.
     * @throws ResponseStatusException(404) if the form definition is not found.
     */
    fun validate(
        code: String,
        data: JsonNode,
    ): List<String> {
        val formDefinition = getLatestActive(code)

        // Step 1 — JSON Schema
        val schemaErrors = jsonSchemaValidationService.validate(formDefinition.schemaJson, data)
        if (schemaErrors.isNotEmpty()) return schemaErrors

        // Step 2 — cross-field validators
        return crossFieldValidators
            .filter { it.activityTypeCode == formDefinition.activityTypeCode && it.formCode == formDefinition.code }
            .flatMap { it.validate(data) }
            .map { it.toMessage() }
    }

    /**
     * Cross-field validation only (no JSON Schema) — used internally when
     * the caller has already established schema validity and only wants to run
     * the business-rule layer (e.g. on workflow Submit).
     *
     * @return empty list if all cross-field rules pass.
     */
    fun validateCrossField(
        formDefinition: FormDefinition,
        data: JsonNode,
    ): List<ValidationError> =
        crossFieldValidators
            .filter { it.activityTypeCode == formDefinition.activityTypeCode && it.formCode == formDefinition.code }
            .flatMap { it.validate(data) }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun ValidationError.toMessage(): String = "[$field] $message"
}
