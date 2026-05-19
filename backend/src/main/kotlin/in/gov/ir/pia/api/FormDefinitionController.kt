package `in`.gov.ir.pia.api

import com.fasterxml.jackson.databind.JsonNode
import `in`.gov.ir.pia.service.form.FormDefinitionService
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// ─── DTOs ──────────────────────────────────────────────────────────────────────

data class FormDefinitionSummaryResponse(
    val id: UUID,
    val code: String,
    val version: Int,
    val label: String,
    val activityTypeCode: String,
    val isActive: Boolean,
)

data class FormDefinitionDetailResponse(
    val id: UUID,
    val code: String,
    val version: Int,
    val label: String,
    val activityTypeCode: String,
    val schemaJson: JsonNode,
    val uiSchemaJson: JsonNode,
    val sectionCodes: List<String>,
    val isActive: Boolean,
)

data class ValidationResultResponse(
    val valid: Boolean,
    val errors: List<String>,
)

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * REST endpoints for the FormDefinition resource.
 *
 * All endpoints are gated by [FORM_DEFINITION.READ].  Write endpoints
 * (create draft, publish) are added in the admin form editor phase.
 *
 * Endpoints:
 *   GET  /api/v1/form-definitions          — list all active definitions
 *   GET  /api/v1/form-definitions/{code}   — latest active version by code
 *   POST /api/v1/form-definitions/{code}/validate
 *                                          — validate data against the schema;
 *                                            200 if valid, 422 if not
 */
@RestController
@RequestMapping("/api/v1/form-definitions")
class FormDefinitionController(
    private val formDefinitionService: FormDefinitionService,
) {
    /**
     * Lists all active form definitions.
     *
     * Returns summaries only (no schemaJson); use the detail endpoint to fetch
     * the full schema when building a form renderer.
     */
    @GetMapping
    @PreAuthorize("@pe.hasPermission(authentication, null, 'FORM_DEFINITION.READ')")
    fun list(): List<FormDefinitionSummaryResponse> =
        formDefinitionService.listActive().map { fd ->
            FormDefinitionSummaryResponse(
                id = fd.id,
                code = fd.code,
                version = fd.version,
                label = fd.label,
                activityTypeCode = fd.activityTypeCode,
                isActive = fd.isActive,
            )
        }

    /**
     * Returns the latest active version of a form definition by its code,
     * including the full JSON Schema and RJSF ui-schema.
     */
    @GetMapping("/{code}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'FORM_DEFINITION.READ')")
    fun get(
        @PathVariable code: String,
    ): FormDefinitionDetailResponse {
        val fd = formDefinitionService.getLatestActive(code)
        return FormDefinitionDetailResponse(
            id = fd.id,
            code = fd.code,
            version = fd.version,
            label = fd.label,
            activityTypeCode = fd.activityTypeCode,
            schemaJson = fd.schemaJson,
            uiSchemaJson = fd.uiSchemaJson,
            sectionCodes = fd.sectionCodes.toList(),
            isActive = fd.isActive,
        )
    }

    /**
     * Returns a form definition by its UUID, including the full JSON Schema
     * and RJSF ui-schema.
     *
     * This endpoint is used by the Record Edit Page to fetch the form schema
     * needed to render RJSF.  It is gated on [ACTIVITY_RECORD.READ.OWN] so
     * that Dy CE/C and other data-entry roles can load their form schemas
     * without needing the admin-only [FORM_DEFINITION.READ] permission.
     */
    @GetMapping("/by-id/{id}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.OWN')")
    fun getById(
        @PathVariable id: java.util.UUID,
    ): FormDefinitionDetailResponse {
        val fd = formDefinitionService.getById(id)
        return FormDefinitionDetailResponse(
            id = fd.id,
            code = fd.code,
            version = fd.version,
            label = fd.label,
            activityTypeCode = fd.activityTypeCode,
            schemaJson = fd.schemaJson,
            uiSchemaJson = fd.uiSchemaJson,
            sectionCodes = fd.sectionCodes.toList(),
            isActive = fd.isActive,
        )
    }

    /**
     * Validates [data] against the JSON Schema of the form definition
     * identified by [code] (latest active version).
     *
     * Returns 200 with `{ valid: true, errors: [] }` on success.
     * Returns 422 with `{ valid: false, errors: [...] }` on schema violations.
     */
    @PostMapping("/{code}/validate")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'FORM_DEFINITION.READ')")
    fun validate(
        @PathVariable code: String,
        @RequestBody data: JsonNode,
    ): ValidationResultResponse {
        val errors = formDefinitionService.validate(code, data)
        if (errors.isNotEmpty()) throw ValidationException(errors)
        return ValidationResultResponse(valid = true, errors = emptyList())
    }

    /**
     * Handles validation failures from [validate] — returns 422 with structured
     * error body rather than the default 500.
     *
     * Note: [ApiExceptionHandler] also handles [ValidationException] globally;
     * this method-level handler returns the simpler [ValidationResultResponse]
     * shape for this endpoint specifically.
     */
    @org.springframework.web.bind.annotation.ExceptionHandler(ValidationException::class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    fun handleValidation(ex: ValidationException): ValidationResultResponse = ValidationResultResponse(valid = false, errors = ex.errors)
}
