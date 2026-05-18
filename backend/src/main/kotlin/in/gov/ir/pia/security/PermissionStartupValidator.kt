package `in`.gov.ir.pia.security

import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/**
 * Fails fast at startup if any permission code referenced in the application's
 * `@PreAuthorize` annotations is missing from the `permissions` table.
 *
 * All permission codes used in this codebase must be enumerated in
 * [ALL_PERMISSION_CODES].  Adding a new code to that set without a
 * corresponding Flyway data migration will cause the app to refuse to start.
 *
 * This check runs in all profiles (dev, beta, prod) so that integration tests
 * and production deployments both catch missing seed data early.
 */
@Component
class PermissionStartupValidator(
    private val jdbc: JdbcTemplate,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun run(args: ApplicationArguments) {
        val seeded = jdbc.queryForList("SELECT code FROM permissions", String::class.java).toSet()
        val missing = ALL_PERMISSION_CODES - seeded
        if (missing.isNotEmpty()) {
            throw IllegalStateException(
                "Permission codes used in @PreAuthorize are missing from the permissions table. " +
                    "Add a Flyway data migration to seed them. Missing: $missing",
            )
        }
        log.info("Permission startup check passed — all {} codes present in DB.", ALL_PERMISSION_CODES.size)
    }

    companion object {
        /**
         * Canonical set of every permission code used in the application.
         *
         * Keep this list in sync with:
         *   - `V001_005__seed_permissions.sql` (DB seed)
         *   - Every `@PreAuthorize` annotation in `api/` packages
         *
         * Sorted alphabetically within each category for easy review.
         */
        val ALL_PERMISSION_CODES: Set<String> =
            setOf(
                // ── Activity ───────────────────────────────────────────────────────
                "ACTIVITY.CREATE.ASSIGNED",
                "ACTIVITY.DELETE",
                "ACTIVITY.READ.ALL",
                "ACTIVITY.READ.OWN",
                "ACTIVITY.READ.ZONE",
                "ACTIVITY.UPDATE.OWN",
                // ── Activity Record ────────────────────────────────────────────────
                "ACTIVITY_RECORD.AUTHENTICATE",
                "ACTIVITY_RECORD.BULK_TRANSITION",
                "ACTIVITY_RECORD.CREATE.ASSIGNED",
                "ACTIVITY_RECORD.DELETE",
                "ACTIVITY_RECORD.READ.ALL",
                "ACTIVITY_RECORD.READ.OWN",
                "ACTIVITY_RECORD.READ.ZONE",
                "ACTIVITY_RECORD.SEND_BACK",
                "ACTIVITY_RECORD.SUBMIT",
                "ACTIVITY_RECORD.UPDATE.OWN",
                "ACTIVITY_RECORD.VERIFY",
                // ── Attachment ─────────────────────────────────────────────────────
                "ATTACHMENT.DELETE.ANY",
                "ATTACHMENT.DELETE.OWN",
                "ATTACHMENT.DOWNLOAD",
                "ATTACHMENT.UPLOAD.OWN_RECORDS",
                // ── Audit Log ──────────────────────────────────────────────────────
                "AUDIT_LOG.READ.ALL",
                "AUDIT_LOG.READ.OWN",
                // ── Comment ────────────────────────────────────────────────────────
                "COMMENT.CREATE",
                "COMMENT.DELETE.ANY",
                "COMMENT.DELETE.OWN",
                // ── Dashboard ──────────────────────────────────────────────────────
                "DASHBOARD.VIEW.PAN_INDIA",
                "DASHBOARD.VIEW.PROJECT",
                "DASHBOARD.VIEW.ZONE",
                // ── Drawing ────────────────────────────────────────────────────────
                "DRAWING.APPROVE",
                "DRAWING.EDIT_APPROVERS",
                "DRAWING.REASSIGN_APPROVER",
                "DRAWING.SEND_BACK",
                // ── Export ─────────────────────────────────────────────────────────
                "EXPORT.PAN_INDIA",
                "EXPORT.PROJECT",
                "EXPORT.ZONE",
                // ── Feature Flag ───────────────────────────────────────────────────
                "FEATURE_FLAG.MANAGE",
                // ── Form Definition ────────────────────────────────────────────────
                "FORM_DEFINITION.CREATE",
                "FORM_DEFINITION.PUBLISH",
                "FORM_DEFINITION.READ",
                "FORM_DEFINITION.UPDATE",
                // ── Permission ─────────────────────────────────────────────────────
                "PERMISSION.GRANT",
                // ── Project ────────────────────────────────────────────────────────
                "PROJECT.ALLOCATE",
                "PROJECT.ASSIGN_DYCE",
                "PROJECT.COMPLETE",
                "PROJECT.CREATE",
                "PROJECT.DELETE",
                "PROJECT.DESIGNATE_NODAL",
                "PROJECT.DROP",
                "PROJECT.HOLD_RESUME",
                "PROJECT.READ.ALL",
                "PROJECT.READ.OWN",
                "PROJECT.READ.ZONE",
                "PROJECT.UPDATE.ALL",
                "PROJECT.UPDATE.OWN",
                // ── Role ───────────────────────────────────────────────────────────
                "ROLE.MANAGE",
                // ── User ───────────────────────────────────────────────────────────
                "USER.CREATE",
                "USER.DEACTIVATE",
                "USER.READ",
                "USER.UPDATE",
            )
    }
}
