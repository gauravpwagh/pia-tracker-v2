package `in`.gov.ir.pia.domain.attachment

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.SQLRestriction
import java.time.Instant
import java.util.UUID

/**
 * Metadata record for a file attachment stored in MinIO.
 *
 * Schema: V010__attachments.sql.
 *
 * The binary content lives in MinIO under [objectKey] in the `pia-attachments`
 * bucket.  This entity only stores metadata; presigned URLs for download are
 * generated on demand by [AttachmentService].
 *
 * Soft-deleted rows are hidden from default queries via [SQLRestriction].
 *
 * No `@Version` — attachments are created once and soft-deleted; no in-place
 * updates except the soft-delete fields, which are not contended.
 */
@Entity
@Table(name = "attachments")
@SQLRestriction("is_deleted = false")
class Attachment(
    @Id
    val id: UUID = UUID.randomUUID(),
    /** Polymorphic owner: ACTIVITY_RECORD | PROJECT | ACTIVITY */
    @Column(name = "entity_type", nullable = false, length = 32)
    val entityType: String,
    @Column(name = "entity_id", nullable = false)
    val entityId: UUID,
    @Column(name = "uploaded_by_user_id", nullable = false)
    val uploadedByUserId: UUID,
    @Column(name = "original_filename", nullable = false, length = 512)
    val originalFilename: String,
    @Column(name = "content_type", nullable = false, length = 128)
    val contentType: String,
    @Column(name = "file_size_bytes", nullable = false)
    val fileSizeBytes: Long,
    /** MinIO object key in the `pia-attachments` bucket. */
    @Column(name = "object_key", nullable = false, length = 1024)
    val objectKey: String,
    /** PENDING | SCANNING | CLEAN | INFECTED | SCAN_FAILED | EXEMPT */
    @Column(name = "scan_status", nullable = false, length = 16)
    var scanStatus: String = "PENDING",
    /** SHA-256 hex digest stored for EXEMPT files (large video). */
    @Column(name = "sha256", length = 64)
    var sha256: String? = null,
    /** MinIO multipart upload ID; cleared on completeMultipart. */
    @Column(name = "multipart_upload_id", length = 128)
    var multipartUploadId: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    @Column(name = "is_deleted", nullable = false)
    var isDeleted: Boolean = false,
    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,
    @Column(name = "deleted_by_user_id")
    var deletedByUserId: UUID? = null,
) {
    override fun equals(other: Any?): Boolean = other is Attachment && id == other.id

    override fun hashCode(): Int = id.hashCode()
}
