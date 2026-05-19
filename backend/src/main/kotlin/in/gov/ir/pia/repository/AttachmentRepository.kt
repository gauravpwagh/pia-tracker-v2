package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.attachment.Attachment
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface AttachmentRepository : JpaRepository<Attachment, UUID> {

    /** All non-deleted attachments for a given entity, newest first. */
    fun findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
        entityType: String,
        entityId: UUID,
    ): List<Attachment>

    /** All non-deleted attachments uploaded by a user on a specific entity. */
    fun findByEntityTypeAndEntityIdAndUploadedByUserId(
        entityType: String,
        entityId: UUID,
        uploadedByUserId: UUID,
    ): List<Attachment>
}
