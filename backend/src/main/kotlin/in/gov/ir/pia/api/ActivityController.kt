package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.security.PiaPrincipal
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityService
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.PatchActivityRecordRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * REST endpoints for activities and their records.
 *
 * ## URL structure
 *
 * Activities are nested under projects:
 *   `GET/POST /api/v1/projects/{projectId}/activities`
 *   `GET       /api/v1/activities/{activityId}`
 *
 * Records are nested under activities:
 *   `GET/POST /api/v1/activities/{activityId}/records`
 *   `GET       /api/v1/activity-records/{recordId}`
 *
 * ## Permission model
 *
 * - Creating activities: `ACTIVITY.CREATE.ASSIGNED` (must hold DY_CE_C or
 *   NODAL_DY_CE_C assignment on the project — checked in [ActivityService]).
 * - Reading activities: `ACTIVITY.READ.OWN` (zone-filtered list; service
 *   verifies zone access on the parent project).
 * - Creating records: `ACTIVITY_RECORD.CREATE.ASSIGNED`.
 * - Reading records: `ACTIVITY_RECORD.READ.OWN`.
 *
 * All methods carry `@PreAuthorize`.
 */
@RestController
class ActivityController(
    private val activityService: ActivityService,
) {
    // ── Activities ────────────────────────────────────────────────────────────

    /**
     * Lists all non-deleted activities on a project.
     */
    @GetMapping("/api/v1/projects/{projectId}/activities")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY.READ.OWN')")
    fun listActivities(
        @PathVariable projectId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): List<ActivityDetailResponse> =
        activityService.listForProject(projectId, principal).map { a ->
            ActivityDetailResponse(
                id = a.id,
                projectId = a.projectId,
                activityTypeCode = a.activityTypeCode,
                name = a.name,
                scopeNotes = a.scopeNotes,
                targetCompletionDate = a.targetCompletionDate,
                primaryDyceUserId = a.primaryDyceUserId,
                status = a.status,
                defaultFormDefinitionId = a.defaultFormDefinitionId,
                createdByUserId = a.createdByUserId,
                createdAt = a.createdAt,
                updatedAt = a.updatedAt,
                version = a.version,
            )
        }

    /**
     * Creates a new activity on a project.
     *
     * The caller must hold an active DY_CE_C or NODAL_DY_CE_C assignment on
     * the project; [ActivityService.create] enforces this and returns 403 if not.
     *
     * Multiple activities of the same type are permitted (decision YYY).
     */
    @PostMapping("/api/v1/projects/{projectId}/activities")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY.CREATE.ASSIGNED')")
    fun createActivity(
        @PathVariable projectId: UUID,
        @RequestBody request: CreateActivityRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ActivityDetailResponse = activityService.create(projectId, request, principal)

    /**
     * Returns a single activity by its own ID.
     */
    @GetMapping("/api/v1/activities/{activityId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY.READ.OWN')")
    fun getActivity(
        @PathVariable activityId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ActivityDetailResponse {
        val a = activityService.getForPrincipal(activityId, principal)
        return ActivityDetailResponse(
            id = a.id,
            projectId = a.projectId,
            activityTypeCode = a.activityTypeCode,
            name = a.name,
            scopeNotes = a.scopeNotes,
            targetCompletionDate = a.targetCompletionDate,
            primaryDyceUserId = a.primaryDyceUserId,
            status = a.status,
            defaultFormDefinitionId = a.defaultFormDefinitionId,
            createdByUserId = a.createdByUserId,
            createdAt = a.createdAt,
            updatedAt = a.updatedAt,
            version = a.version,
        )
    }

    // ── Activity Records ──────────────────────────────────────────────────────

    /**
     * Lists all non-deleted records for an activity.
     */
    @GetMapping("/api/v1/activities/{activityId}/records")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.OWN')")
    fun listRecords(
        @PathVariable activityId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): List<ActivityRecordDetailResponse> =
        activityService.listRecordsForActivity(activityId, principal).map { it.toResponse() }

    /**
     * Creates an empty record for an activity.
     *
     * Phase 1.8: the record is created with empty `data_json = {}`.  Data
     * entry via RJSF is wired up in Phase 1.9.
     *
     * Returns 422 if the activity has no form definition seeded yet.
     * Returns `ETag: "{version}"` on the response for the client to carry into PATCHes.
     */
    @PostMapping("/api/v1/activities/{activityId}/records")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.CREATE.ASSIGNED')")
    fun createRecord(
        @PathVariable activityId: UUID,
        @RequestBody(required = false) request: CreateActivityRecordRequest?,
        @AuthenticationPrincipal principal: PiaPrincipal,
        response: HttpServletResponse,
    ): ActivityRecordDetailResponse {
        val record = activityService.createRecord(activityId, request ?: CreateActivityRecordRequest(), principal)
        response.setHeader("ETag", "\"${record.version}\"")
        return record
    }

    /**
     * Returns a single activity record by its own ID.
     *
     * Emits `ETag: "{version}"` so the client can carry the version through
     * subsequent PATCH (autosave) calls.
     */
    @GetMapping("/api/v1/activity-records/{recordId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.READ.OWN')")
    fun getRecord(
        @PathVariable recordId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
        response: HttpServletResponse,
    ): ActivityRecordDetailResponse {
        val r = activityService.getRecordForPrincipal(recordId, principal)
        response.setHeader("ETag", "\"${r.version}\"")
        return r.toResponse()
    }

    /**
     * Autosave PATCH — replaces the record's `data_json` with the submitted payload.
     *
     * The client must send `If-Match: "{currentVersion}"` (ETag from the last
     * GET or PATCH response).  A version mismatch returns 409 Conflict.
     *
     * Schema validation is **not** performed on autosave — partial / in-progress
     * data is accepted.  Validation is enforced on the workflow Submit action.
     *
     * Returns the updated record with a new `ETag: "{newVersion}"` header.
     */
    @PatchMapping("/api/v1/activity-records/{recordId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ACTIVITY_RECORD.UPDATE.OWN')")
    fun patchRecord(
        @PathVariable recordId: UUID,
        @RequestBody request: PatchActivityRecordRequest,
        @RequestHeader("If-Match") ifMatch: String,
        @AuthenticationPrincipal principal: PiaPrincipal,
        response: HttpServletResponse,
    ): ActivityRecordDetailResponse {
        val expectedVersion =
            ifMatch.trim('"').toIntOrNull()
                ?: throw ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "If-Match header must be a quoted integer, e.g. \"3\"",
                )
        val updated = activityService.patchRecord(recordId, request, expectedVersion, principal)
        response.setHeader("ETag", "\"${updated.version}\"")
        return updated
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun `in`.gov.ir.pia.domain.activity.ActivityRecord.toResponse(): ActivityRecordDetailResponse =
        ActivityRecordDetailResponse(
            id = id,
            projectActivityId = projectActivityId,
            formDefinitionId = formDefinitionId,
            schemaVersionAtSave = schemaVersionAtSave,
            dataJson = dataJson,
            recordState = recordState,
            recordSubtype = recordSubtype,
            createdByUserId = createdByUserId,
            createdAt = createdAt,
            updatedAt = updatedAt,
            version = version,
        )
}
