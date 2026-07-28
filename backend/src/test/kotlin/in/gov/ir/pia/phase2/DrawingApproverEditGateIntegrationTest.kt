package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
import `in`.gov.ir.pia.service.project.ProjectDetailResponse
import `in`.gov.ir.pia.workflow.AddApproverRequest
import `in`.gov.ir.pia.workflow.DrawingApproverListResponse
import `in`.gov.ir.pia.workflow.DrawingApproverResponse
import `in`.gov.ir.pia.workflow.UpdateApprovalRequest
import io.minio.MinioClient
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.LocalDate
import java.util.UUID

/**
 * Phase 2.7 Gate — Drawing approver edit flow (phasing.md § 2.7).
 *
 * Rewritten against the record-keeping model shipped by V029 (see
 * [DrawingGateIntegrationTest] for the full rationale): approver slots are
 * designation-only (no user_id, no reassignment, no per-approver
 * notifications — `DrawingService` never writes to the `notifications`
 * table). What V029 *did* keep is the add/remove surface and the
 * already-approved protection, so this test covers:
 *
 *   1. CE/C adds an unlisted approval-role designation ("CBE") as a new slot.
 *   2. Dy CE/C records an approval date on one of the original default slots
 *      (stand-in for "has acted").
 *   3. Nodal removes the still-pending "CBE" slot → soft-deleted (is_deleted=true).
 *   4. Nodal tries to remove the now-approved slot → 409 CONFLICT
 *      (decision BBBB: approved rows are preserved on approver-list edits).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data,classpath:db/test-data",
        "pia.clamav.host=127.0.0.1",
        "pia.clamav.port=19999",
        "pia.clamav.timeout-ms=200",
    ],
)
class DrawingApproverEditGateIntegrationTest {
    companion object {
        @JvmField
        @Container
        val postgres: PostgreSQLContainer<*> =
            PostgreSQLContainer("postgres:16-alpine")
                .withInitScript("testcontainers/init-roles.sql")

        @JvmStatic
        @DynamicPropertySource
        fun overrideProps(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("spring.flyway.url", postgres::getJdbcUrl)
            registry.add("spring.flyway.user", postgres::getUsername)
            registry.add("spring.flyway.password", postgres::getPassword)
        }

        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111113")
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111114")
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105") // Nodal

        /** An is_approval_role designation NOT in ESP_DRAWING_V1's default_approver_designations. */
        const val UNLISTED_DESIGNATION = "CBE"
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockkBean lateinit var minioClient: MinioClient

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun loginAs(userId: UUID): List<String> {
        val resp =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(userId),
                Void::class.java,
            )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        return resp.headers["Set-Cookie"] ?: emptyList()
    }

    private fun headersFor(cookies: List<String>): HttpHeaders {
        val h = HttpHeaders()
        if (cookies.isNotEmpty()) h["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        return h
    }

    private fun <T> post(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    private fun delete(
        url: String,
        cookies: List<String>,
    ) = restTemplate.exchange(url, HttpMethod.DELETE, HttpEntity<Void>(headersFor(cookies)), Void::class.java)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.PATCH, HttpEntity(body, headersFor(cookies)), type)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-7 Drawing approver edit — add and remove, with BBBB protection for approved slots`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold ──────────────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Approver Edit Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
            cao,
            ProjectDetailResponse::class.java,
        )

        val ce = loginAs(CE_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)),
            ce,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project.id}/designate-nodal",
            DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID),
            ce,
            ProjectDetailResponse::class.java,
        )

        val dyce1 = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)

        // ── Step 1: Create ESP drawing record ─────────────────────────────────
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(activityTypeCode = "DRAWING_APPROVAL", name = "Approver Edit Gate Activity"),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        val record =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = "ESP"),
                dyce1,
                ActivityRecordDetailResponse::class.java,
            ).body!!

        // ── Step 2: CE/C adds an unlisted approver slot ("CBE") ───────────────
        val addResp =
            post(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                AddApproverRequest(designationCode = UNLISTED_DESIGNATION),
                ce,
                DrawingApproverResponse::class.java,
            )
        assertThat(addResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val newSlot = addResp.body!!
        assertThat(newSlot.approvalDesignationCode).isEqualTo(UNLISTED_DESIGNATION)
        assertThat(newSlot.approvedOn)
            .`as`("A newly added slot has no approval recorded yet")
            .isNull()

        val newSlotExists =
            jdbc.queryForObject(
                """SELECT count(*) FROM drawing_approvers
                   WHERE id = ? AND approval_designation_code = ?
                     AND NOT is_deleted""",
                Long::class.java,
                newSlot.id,
                UNLISTED_DESIGNATION,
            )!!
        assertThat(newSlotExists).`as`("$UNLISTED_DESIGNATION slot must be created in DB").isEqualTo(1L)

        // ── Step 3: Dy CE/C records an approval date on one of the default slots ─
        val approvers =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!
        val approvedSlot = approvers.approvers.first { it.id != newSlot.id }

        patch(
            "/api/v1/activity-records/${record.id}/drawing-approvers/${approvedSlot.id}",
            UpdateApprovalRequest(approvedOn = LocalDate.now()),
            dyce1,
            DrawingApproverResponse::class.java,
        ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.OK) }

        val approvedOnInDb =
            jdbc.queryForObject(
                "SELECT approved_on FROM drawing_approvers WHERE id = ?",
                LocalDate::class.java,
                approvedSlot.id,
            )
        assertThat(approvedOnInDb).`as`("Slot must have an approved_on date recorded").isEqualTo(LocalDate.now())

        // ── Step 4: Nodal removes the still-pending "CBE" slot ────────────────
        val deleteResp =
            delete(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${newSlot.id}",
                nodal,
            )
        assertThat(deleteResp.statusCode)
            .`as`("Nodal removing a not-yet-approved slot must succeed")
            .isEqualTo(HttpStatus.NO_CONTENT)

        val removedIsDeleted =
            jdbc.queryForObject(
                "SELECT is_deleted FROM drawing_approvers WHERE id = ?",
                Boolean::class.java,
                newSlot.id,
            )!!
        assertThat(removedIsDeleted)
            .`as`("Removed slot must be soft-deleted (is_deleted = true)")
            .isTrue()

        // ── Step 5: Nodal tries to remove the now-approved slot → 409 ────────
        val removeApprovedResp =
            delete(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${approvedSlot.id}",
                nodal,
            )
        assertThat(removeApprovedResp.statusCode)
            .`as`("Removing an already-approved slot must return 409 (decision BBBB)")
            .isEqualTo(HttpStatus.CONFLICT)

        val approvedSlotStillPresent =
            jdbc.queryForObject(
                "SELECT approved_on FROM drawing_approvers WHERE id = ? AND NOT is_deleted",
                LocalDate::class.java,
                approvedSlot.id,
            )
        assertThat(approvedSlotStillPresent)
            .`as`("Approved slot must be preserved, with its approval date intact, after a failed removal attempt")
            .isEqualTo(LocalDate.now())

        // ── Final: the removed slot no longer appears in the approver list ───
        val finalList =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!
        assertThat(finalList.approvers.none { it.id == newSlot.id })
            .`as`("Soft-deleted $UNLISTED_DESIGNATION slot must not appear in the approver list")
            .isTrue()
        assertThat(finalList.approvers.any { it.id == approvedSlot.id && it.approvedOn != null })
            .`as`("Approved slot must still appear, still approved")
            .isTrue()
    }
}
