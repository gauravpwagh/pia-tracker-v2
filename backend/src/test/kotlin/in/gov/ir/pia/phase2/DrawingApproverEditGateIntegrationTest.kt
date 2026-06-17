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
import `in`.gov.ir.pia.workflow.ReassignApproverRequest
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
import java.util.UUID

/**
 * Phase 2.7 Gate — Drawing approver edit flow (phasing.md § 2.7).
 *
 * Gate: "A CE/C adds an unlisted Sr DEN to a drawing. The Sr DEN sees it in
 *        their inbox. A Nodal removes an approver who hasn't acted yet; the row
 *        goes to is_deleted=true. APPROVED rows preserved on approver-list edits
 *        (decision BBBB)."
 *
 * Test flow:
 *   1.  Create an ESP drawing record → 2 default slots: SR_DEN (109), DY_CEE (110).
 *   2.  CE/C adds user 111 (DY_CE, unlisted) as a 3rd approver slot.
 *       ↳ Verify the new row exists and is PENDING.
 *       ↳ Verify user 111 has a DRAWING_APPROVER_ADDED notification in their inbox.
 *   3.  Submit the drawing (Dy CE/C) → IN_APPROVAL.
 *   4.  SR_DEN (109) approves their slot → APPROVED.
 *   5.  Nodal (DYCE_2 / 105) removes user 111's DY_CE slot (PENDING).
 *       ↳ Verify is_deleted = true on that row.
 *   6.  Nodal tries to remove SR_DEN's APPROVED slot → 409 CONFLICT (decision BBBB).
 *   7.  CE/C reassigns DY_CEE's PENDING slot to user 111 (DRAWING.REASSIGN_APPROVER).
 *       ↳ Verify user_id updated + user 111 gets a second notification.
 *   8.  Verify the derived drawing state is still IN_APPROVAL (SR_DEN APPROVED,
 *       DY_CEE PENDING/reassigned, unlisted slot removed).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data",
        "pia.clamav.host=127.0.0.1",
        "pia.clamav.port=19999",
        "pia.clamav.timeout-ms=200",
    ],
)
class DrawingApproverEditGateIntegrationTest {
    companion object {
        @JvmField
        @Container
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

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

        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101")
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102")
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105") // Nodal
        val SR_DEN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111109")
        val DY_CEE_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111110")
        val DY_CE_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111111") // unlisted approver
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
    ) =
        restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> postEmpty(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.postForEntity(url, HttpEntity<Void>(headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    private fun delete(
        url: String,
        cookies: List<String>,
    ) =
        restTemplate.exchange(url, HttpMethod.DELETE, HttpEntity<Void>(headersFor(cookies)), Void::class.java)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.PATCH, HttpEntity(body, headersFor(cookies)), type)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-7 Drawing approver edit — add, remove, reassign with BBBB protection`() {
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
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
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
        val srDen = loginAs(SR_DEN_USER_ID)
        val dyCe = loginAs(DY_CE_USER_ID)

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

        // ── Step 2: CE/C adds user 111 (DY_CE) as an unlisted 3rd approver ───
        val addResp =
            post(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                AddApproverRequest(designationCode = "DY_CE", userId = DY_CE_USER_ID),
                ce,
                DrawingApproverResponse::class.java,
            )
        assertThat(addResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val newSlot = addResp.body!!
        assertThat(newSlot.approvalDesignationCode).isEqualTo("DY_CE")
        assertThat(newSlot.userId).isEqualTo(DY_CE_USER_ID)
        assertThat(newSlot.status).isEqualTo("PENDING")

        // Verify the row exists in the DB
        val newSlotExists =
            jdbc.queryForObject(
                """SELECT count(*) FROM drawing_approvers
               WHERE id = ? AND approval_designation_code = 'DY_CE'
                 AND user_id = ? AND NOT is_deleted""",
                Long::class.java,
                newSlot.id,
                DY_CE_USER_ID,
            )!!
        assertThat(newSlotExists).`as`("DY_CE slot must be created in DB").isEqualTo(1L)

        // Verify user 111 has a DRAWING_APPROVER_ADDED notification
        val dyCeNotifCount =
            jdbc.queryForObject(
                """SELECT count(*) FROM notifications
               WHERE recipient_user_id = ? AND notification_type = 'DRAWING_APPROVER_ADDED'
                 AND NOT is_read""",
                Long::class.java,
                DY_CE_USER_ID,
            )!!
        assertThat(dyCeNotifCount)
            .`as`("User 111 (DY_CE) must have a DRAWING_APPROVER_ADDED notification after being added")
            .isGreaterThanOrEqualTo(1L)

        // ── Step 3: Submit drawing (DRAFT → IN_APPROVAL) ──────────────────────
        postEmpty("/api/v1/activity-records/${record.id}/submit-drawing", dyce1, Void::class.java)
            .also { assertThat(it.statusCode).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT, HttpStatus.CREATED) }

        // ── Step 4: SR_DEN approves their slot ────────────────────────────────
        val approvers =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                srDen,
                DrawingApproverListResponse::class.java,
            ).body!!

        val srDenSlot = approvers.approvers.find { it.approvalDesignationCode == "SR_DEN" }!!
        val dyCeeSlot = approvers.approvers.find { it.approvalDesignationCode == "DY_CEE" }!!

        postEmpty(
            "/api/v1/activity-records/${record.id}/drawing-approvers/${srDenSlot.id}/approve",
            srDen,
            Void::class.java,
        ).also { assertThat(it.statusCode).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT, HttpStatus.CREATED) }

        // Verify SR_DEN slot is now APPROVED
        val srDenStatus =
            jdbc.queryForObject(
                "SELECT status FROM drawing_approvers WHERE id = ?",
                String::class.java,
                srDenSlot.id,
            )
        assertThat(srDenStatus).`as`("SR_DEN slot must be APPROVED").isEqualTo("APPROVED")

        // ── Step 5: Nodal removes user 111's DY_CE slot (PENDING) ────────────
        val deleteResp =
            delete(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${newSlot.id}",
                nodal,
            )
        assertThat(deleteResp.statusCode)
            .`as`("Nodal removing a PENDING slot must succeed")
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

        // ── Step 6: Nodal tries to remove SR_DEN's APPROVED slot → 409 ───────
        val removeApprovedResp =
            delete(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${srDenSlot.id}",
                nodal,
            )
        assertThat(removeApprovedResp.statusCode)
            .`as`("Removing an APPROVED slot must return 409 (decision BBBB)")
            .isEqualTo(HttpStatus.CONFLICT)

        // SR_DEN slot must still exist and be APPROVED
        val srDenStillApproved =
            jdbc.queryForObject(
                "SELECT status FROM drawing_approvers WHERE id = ? AND NOT is_deleted",
                String::class.java,
                srDenSlot.id,
            )
        assertThat(srDenStillApproved)
            .`as`("SR_DEN APPROVED slot must be preserved after failed removal attempt")
            .isEqualTo("APPROVED")

        // ── Step 7: CE/C reassigns DY_CEE slot to user 111 ───────────────────
        val reassignResp =
            patch(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${dyCeeSlot.id}",
                ReassignApproverRequest(userId = DY_CE_USER_ID),
                ce,
                Void::class.java,
            )
        assertThat(reassignResp.statusCode)
            .`as`("Reassignment must succeed")
            .isIn(HttpStatus.OK, HttpStatus.NO_CONTENT)

        val reassignedUserId =
            jdbc.queryForObject(
                "SELECT user_id FROM drawing_approvers WHERE id = ?",
                UUID::class.java,
                dyCeeSlot.id,
            )
        assertThat(reassignedUserId)
            .`as`("DY_CEE slot must now point to DY_CE_USER_ID after reassignment")
            .isEqualTo(DY_CE_USER_ID)

        // User 111 must have a second notification for the reassignment
        val dyCeNotifCountAfter =
            jdbc.queryForObject(
                """SELECT count(*) FROM notifications
               WHERE recipient_user_id = ? AND notification_type = 'DRAWING_APPROVER_ADDED'""",
                Long::class.java,
                DY_CE_USER_ID,
            )!!
        assertThat(dyCeNotifCountAfter)
            .`as`("User 111 must have ≥ 2 DRAWING_APPROVER_ADDED notifications (add + reassign)")
            .isGreaterThanOrEqualTo(2L)

        // ── Step 8: Derived state is still IN_APPROVAL ────────────────────────
        val finalState =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyCe,
                DrawingApproverListResponse::class.java,
            ).body!!

        assertThat(finalState.derivedState)
            .`as`("Drawing must remain IN_APPROVAL (SR_DEN APPROVED, DY_CEE/reassigned PENDING)")
            .isEqualTo("IN_APPROVAL")

        // The removed DY_CE slot must not appear in the list
        assertThat(finalState.approvers.none { it.id == newSlot.id })
            .`as`("Soft-deleted DY_CE slot must not appear in the approver list")
            .isTrue()
    }
}
