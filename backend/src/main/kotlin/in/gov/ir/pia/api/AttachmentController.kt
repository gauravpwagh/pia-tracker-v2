package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.attachment.AttachmentDownloadDto
import `in`.gov.ir.pia.attachment.AttachmentDto
import `in`.gov.ir.pia.attachment.AttachmentService
import `in`.gov.ir.pia.attachment.CompleteMultipartRequest
import `in`.gov.ir.pia.attachment.InitiateMultipartResponse
import `in`.gov.ir.pia.attachment.InitiateUploadRequest
import `in`.gov.ir.pia.attachment.InitiateUploadResponse
import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * File attachment endpoints — presigned URL upload flow.
 *
 * Single-part (≤ 100 MB):
 *   POST /api/v1/attachments/initiate       → presigned PUT URL + attachmentId
 *   PUT  <presigned URL>                    → browser uploads directly to MinIO
 *   POST /api/v1/attachments/{id}/confirm   → trigger async scan
 *
 * Multipart (> 100 MB):
 *   POST /api/v1/attachments/initiate-multipart    → per-part presigned URLs + uploadId
 *   PUT  <each part presigned URL>                 → browser uploads each part to MinIO
 *   POST /api/v1/attachments/{id}/complete-multipart → assemble + trigger async scan
 *
 * Read / manage:
 *   GET    /api/v1/attachments?entityType=X&entityId=Y  — list
 *   GET    /api/v1/attachments/{id}/download            — presigned GET URL
 *   DELETE /api/v1/attachments/{id}                     — soft-delete
 */
@RestController
class AttachmentController(
    private val attachmentService: AttachmentService,
) {
    // ── List ─────────────────────────────────────────────────────────────────

    @GetMapping("/api/v1/attachments")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.DOWNLOAD')")
    fun list(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
    ): List<AttachmentDto> = attachmentService.list(entityType, entityId)

    // ── Single-part upload ────────────────────────────────────────────────────

    @PostMapping("/api/v1/attachments/initiate")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.UPLOAD.OWN_RECORDS')")
    fun initiate(
        @RequestBody request: InitiateUploadRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): InitiateUploadResponse = attachmentService.initiate(request, principal)

    @PostMapping("/api/v1/attachments/{id}/confirm")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.UPLOAD.OWN_RECORDS')")
    fun confirm(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): AttachmentDto = attachmentService.confirm(id, principal)

    // ── Multipart upload ──────────────────────────────────────────────────────

    @PostMapping("/api/v1/attachments/initiate-multipart")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.UPLOAD.OWN_RECORDS')")
    fun initiateMultipart(
        @RequestBody request: InitiateUploadRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): InitiateMultipartResponse = attachmentService.initiateMultipart(request, principal)

    @PostMapping("/api/v1/attachments/{id}/complete-multipart")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.UPLOAD.OWN_RECORDS')")
    fun completeMultipart(
        @PathVariable id: UUID,
        @RequestBody request: CompleteMultipartRequest,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): AttachmentDto = attachmentService.completeMultipart(id, request, principal)

    // ── Download / Delete ─────────────────────────────────────────────────────

    @GetMapping("/api/v1/attachments/{id}/download")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.DOWNLOAD')")
    fun download(
        @PathVariable id: UUID,
    ): AttachmentDownloadDto = attachmentService.presignedDownloadUrl(id)

    @DeleteMapping("/api/v1/attachments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(
        "@pe.hasPermission(authentication, null, 'ATTACHMENT.DELETE.OWN') or " +
            "@pe.hasPermission(authentication, null, 'ATTACHMENT.DELETE.ANY')",
    )
    fun delete(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        val canDeleteAny = principal.hasPermission("ATTACHMENT.DELETE.ANY")
        attachmentService.delete(id, principal, canDeleteAny)
    }
}
