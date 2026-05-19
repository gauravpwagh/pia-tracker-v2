package `in`.gov.ir.pia.service.form

import com.fasterxml.jackson.databind.JsonNode
import `in`.gov.ir.pia.domain.form.FormDefinition
import `in`.gov.ir.pia.forms.JsonSchemaValidationService
import `in`.gov.ir.pia.repository.FormDefinitionRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Application service for [FormDefinition] reads and data validation.
 *
 * All reads are read-only transactions; writes (admin form editor) are added
 * in a later phase and will have their own transactional service methods.
 */
@Service
@Transactional(readOnly = true)
class FormDefinitionService(
    private val formDefinitionRepository: FormDefinitionRepository,
    private val jsonSchemaValidationService: JsonSchemaValidationService,
) {
    /** Returns all active form definitions ordered by activity type then code. */
    fun listActive(): List<FormDefinition> = formDefinitionRepository.findAllByIsActiveTrueOrderByActivityTypeCodeAscCodeAsc()

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
     * Validates [data] against the JSON Schema of the form definition
     * identified by [code] (latest active version).
     *
     * @return empty list if valid.
     * @throws ResponseStatusException(404) if the form definition is not found.
     */
    fun validate(
        code: String,
        data: JsonNode,
    ): List<String> {
        val formDefinition = getLatestActive(code)
        return jsonSchemaValidationService.validate(formDefinition.schemaJson, data)
    }
}
