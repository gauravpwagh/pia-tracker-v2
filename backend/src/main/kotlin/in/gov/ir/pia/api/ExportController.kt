package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.export.DownloadResult
import `in`.gov.ir.pia.export.ExportJobStatusResponse
import `in`.gov.ir.pia.export.ExportJobSubmitResponse
import `in`.gov.ir.pia.export.ExportService
import `in`.gov.ir.pia.security.PiaPrincipal
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * Excel export endpoints.
 *
 * Endpoint catalogue:
 *   GET  /api/v1/export/projects/{projectId}        — synchronous project xlsx
 *   POST /api/v1/export/zone/{zoneId}               — submit async zone xlsx job → 202
 *   GET  /api/v1/export/jobs/{jobId}                — job status (non-downloading)
 *   GET  /api/v1/export/jobs/{jobId}/download       — one-time xlsx download
 *
 * Permission model (mirrors the EXPORT.* codes from the permission catalogue):
 *   EXPORT.PROJECT   — CE/C and above (project-scope export)
 *   EXPORT.ZONE      — CAO/C (zone-scope export)
 *   EXPORT.PAN_INDIA — EDGS/C-I, Board Viewer, Super Admin (system-grant)
 */
@RestController
@RequestMapping("/api/v1/export")
@Tag(name = "Export", description = "Excel export endpoints")
class ExportController(
    private val exportService: ExportService,
) {
    // ── Project export (synchronous) ──────────────────────────────────────────

    @GetMapping("/projects/{projectId}")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'EXPORT.PROJECT')")
    @Operation(
        summary = "Export project data",
        description =
            "Generates and returns an xlsx workbook for the given project synchronously. " +
                "Sheet 1 (Summary): project metadata + per-activity-type record counts. " +
                "Sheet 2 (Activity Records): flat list of all activity records. " +
                "Gated to EXPORT.PROJECT.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "xlsx workbook returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Project not found"),
    )
    fun exportProject(
        @PathVariable projectId: UUID,
    ): ResponseEntity<ByteArray> {
        val (bytes, fileName) = exportService.exportProject(projectId)
        return ResponseEntity.ok()
            .headers(xlsxHeaders(fileName))
            .body(bytes)
    }

    // ── Zone export (asynchronous) ────────────────────────────────────────────

    @PostMapping("/zone/{zoneId}")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'EXPORT.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'EXPORT.PAN_INDIA')",
    )
    @Operation(
        summary = "Submit zone export job",
        description =
            "Queues an asynchronous export job for the given zone and returns 202 Accepted " +
                "with the job ID. The job is processed in the background; the caller can poll " +
                "GET /api/v1/export/jobs/{jobId} for status. When COMPLETED, the file is " +
                "available for one-time download via GET /api/v1/export/jobs/{jobId}/download. " +
                "An in-app notification (EXPORT_READY) fires when the job completes. " +
                "Gated to EXPORT.ZONE or EXPORT.PAN_INDIA.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "202", description = "Export job queued"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
    )
    fun submitZoneExport(
        @PathVariable zoneId: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): ResponseEntity<ExportJobSubmitResponse> {
        val response = exportService.submitZoneExport(zoneId, principal.userId)
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response)
    }

    // ── Job status ────────────────────────────────────────────────────────────

    @GetMapping("/jobs/{jobId}")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'EXPORT.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'EXPORT.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'EXPORT.PAN_INDIA')",
    )
    @Operation(
        summary = "Get export job status",
        description =
            "Returns status and metadata for an export job without consuming the download. " +
                "Use this to poll until status == COMPLETED, then call the download endpoint.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Job status returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Job not found"),
    )
    fun getJobStatus(
        @PathVariable jobId: UUID,
    ): ExportJobStatusResponse = exportService.getJobStatus(jobId)

    // ── One-time download ─────────────────────────────────────────────────────

    @GetMapping("/jobs/{jobId}/download")
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'EXPORT.PROJECT') or " +
            "@pe.hasPermission(authentication, null, 'EXPORT.ZONE') or " +
            "@pe.hasPermission(authentication, null, 'EXPORT.PAN_INDIA')",
    )
    @Operation(
        summary = "One-time xlsx download",
        description =
            "Returns the generated xlsx file for a COMPLETED export job. " +
                "The link is one-time: a second request (or after expires_at) returns 410 Gone. " +
                "If the job is still QUEUED or PROCESSING, returns 409 Conflict.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "xlsx file returned"),
        ApiResponse(responseCode = "403", description = "Insufficient permission"),
        ApiResponse(responseCode = "404", description = "Job not found"),
        ApiResponse(responseCode = "409", description = "Job not yet completed"),
        ApiResponse(responseCode = "410", description = "Already downloaded or expired"),
    )
    fun download(
        @PathVariable jobId: UUID,
    ): ResponseEntity<ByteArray> =
        when (val result = exportService.download(jobId)) {
            is DownloadResult.Ready ->
                ResponseEntity.ok()
                    .headers(xlsxHeaders(result.fileName))
                    .body(result.bytes)

            is DownloadResult.NotReady ->
                throw ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Export job is not yet complete (status: ${result.status})",
                )

            DownloadResult.NotFound ->
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Export job $jobId not found")

            DownloadResult.AlreadyDownloaded ->
                throw ResponseStatusException(
                    HttpStatus.GONE,
                    "Export job $jobId has already been downloaded",
                )

            DownloadResult.Expired ->
                throw ResponseStatusException(
                    HttpStatus.GONE,
                    "Export job $jobId has expired",
                )
        }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun xlsxHeaders(fileName: String): HttpHeaders =
        HttpHeaders().apply {
            contentType = MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            contentDisposition = ContentDisposition.attachment().filename(fileName).build()
        }
}
