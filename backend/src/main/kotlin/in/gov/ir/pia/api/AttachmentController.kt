package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.attachment.AttachmentDownloadDto
import `in`.gov.ir.pia.attachment.AttachmentDto
import `in`.gov.ir.pia.attachment.AttachmentService
import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

/**
 * File attachment endpoints.
 *
 *   GET    /api/v1/attachments?entityType=X&entityId=Y  — list attachments
 *   POST   /api/v1/attachments                          — upload (multipart/form-data)
 *   GET    /api/v1/attachments/{id}/download            — presigned download URL
 *   DELETE /api/v1/attachments/{id}                     — soft-delete
 */
@RestController
class AttachmentController(
    private val attachmentService: AttachmentService,
) {
    @GetMapping("/api/v1/attachments")
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.DOWNLOAD')")
    fun list(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
    ): List<AttachmentDto> = attachmentService.list(entityType, entityId)

    @PostMapping("/api/v1/attachments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("@pe.hasPermission(authentication, null, 'ATTACHMENT.UPLOAD.OWN_RECORDS')")
    fun upload(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
        @RequestParam("file") file: MultipartFile,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): AttachmentDto = attachmentService.upload(entityType, entityId, file, principal)

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
