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
import `in`.gov.ir.pia.workflow.DrawingApproverListResponse
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
 * Phase 2.5 Gate — Drawing checklist model (phasing.md § 2.5).
 *
 * Gate: "A drawing is created with default approvers (computed from the form
 *        definition). Each approver can approve independently. A send-back
 *        from one approver flips only that row to SENT_BACK; others unchanged
 *        (decision CCCC). Re-submit after addressing the issue sends back to
 *        PENDING."
 *
 * Test flow:
 *   1. Create an ESP_DRAWING_V1 activity record.
 *   2. Assert exactly 2 drawing_approvers rows created: SR_DEN (user 109)
 *      and DY_CEE (user 110), both in NR zone — single-match, user_id populated.
 *   3. Submit drawing (DRAFT → IN_APPROVAL).
 *   4. SR_DEN (109) approves → their slot APPROVED; DY_CEE slot still PENDING.
 *   5. DY_CEE (110) sends back → their slot SENT_BACK; SR_DEN slot still APPROVED.
 *      ↳ Decision CCCC verified.
 *   6. Dy CE/C reapproves → DY_CEE slot SENT_BACK → PENDING; SR_DEN stays APPROVED.
 *      ↳ Decision BBBB verified.
 *   7. Final state: IN_APPROVAL (DY_CEE PENDING, SR_DEN APPROVED).
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
class DrawingGateIntegrationTest {
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
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")
        val SR_DEN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111109")
        val DY_CEE_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111110")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockkBean
    lateinit var minioClient: MinioClient

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

    private fun <T> postEmpty(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.postForEntity(url, HttpEntity<Void>(headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-5 Drawing gate — checklist model with independent approve and send-back`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold (same pattern as other gate tests) ────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Drawing Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
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
        val srDen = loginAs(SR_DEN_USER_ID)
        val dyCee = loginAs(DY_CEE_USER_ID)

        // ── Step 1: Create Drawing Approval activity + ESP drawing record ──────
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(
                    activityTypeCode = "DRAWING_APPROVAL",
                    name = "Phase 2.5 Drawing Gate Activity",
                ),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        val createResp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(recordSubtype = "ESP"), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createResp.body!!

        // ── Step 2: Verify exactly 2 drawing_approvers rows created ───────────
        // Both SR_DEN (109) and DY_CEE (110) are in NR zone → single match → user_id populated.
        val approverCount =
            jdbc.queryForObject(
                "SELECT count(*) FROM drawing_approvers WHERE activity_record_id = ? AND NOT is_deleted",
                Long::class.java,
                record.id,
            )!!
        assertThat(approverCount)
            .`as`("ESP drawing must create exactly 2 approver rows (SR_DEN + DY_CEE)")
            .isEqualTo(2L)

        val srDenRowCount =
            jdbc.queryForObject(
                """SELECT count(*) FROM drawing_approvers
                   WHERE activity_record_id = ? AND approval_designation_code = 'SR_DEN'
                     AND user_id = ? AND NOT is_deleted""",
                Long::class.java,
                record.id,
                SR_DEN_USER_ID,
            )!!
        assertThat(srDenRowCount)
            .`as`("SR_DEN approver slot must have user_id = SR_DEN_USER_ID (single match)")
            .isEqualTo(1L)

        val dyCeeRowCount =
            jdbc.queryForObject(
                """SELECT count(*) FROM drawing_approvers
                   WHERE activity_record_id = ? AND approval_designation_code = 'DY_CEE'
                     AND user_id = ? AND NOT is_deleted""",
                Long::class.java,
                record.id,
                DY_CEE_USER_ID,
            )!!
        assertThat(dyCeeRowCount)
            .`as`("DY_CEE approver slot must have user_id = DY_CEE_USER_ID (single match)")
            .isEqualTo(1L)

        // ── Step 3: Submit drawing (DRAFT → IN_APPROVAL) ──────────────────────
        val submitResp = postEmpty("/api/v1/activity-records/${record.id}/submit-drawing", dyce1, Void::class.java)
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT, HttpStatus.CREATED)

        // Verify record_state is IN_APPROVAL after submit
        val stateAfterSubmit =
            jdbc.queryForObject(
                "SELECT record_state FROM activity_records WHERE id = ?",
                String::class.java,
                record.id,
            )!!
        assertThat(stateAfterSubmit)
            .`as`("record_state after submit must be IN_APPROVAL")
            .isEqualTo("IN_APPROVAL")

        // ── Step 4: SR_DEN approves their slot ─────────────────────────────────
        // Fetch approver IDs
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

        // After SR_DEN approves: SR_DEN = APPROVED, DY_CEE = PENDING → state still IN_APPROVAL
        val afterSrDenApprove =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                srDen,
                DrawingApproverListResponse::class.java,
            ).body!!

        assertThat(afterSrDenApprove.approvers.find { it.id == srDenSlot.id }!!.status)
            .`as`("SR_DEN slot must be APPROVED after SR_DEN approves")
            .isEqualTo("APPROVED")
        assertThat(afterSrDenApprove.approvers.find { it.id == dyCeeSlot.id }!!.status)
            .`as`("DY_CEE slot must remain PENDING — each approver acts independently")
            .isEqualTo("PENDING")
        assertThat(afterSrDenApprove.derivedState)
            .`as`("Drawing state must be IN_APPROVAL (one PENDING remains)")
            .isEqualTo("IN_APPROVAL")

        // ── Step 5: DY_CEE sends back (decision CCCC) ─────────────────────────
        post(
            "/api/v1/activity-records/${record.id}/drawing-approvers/${dyCeeSlot.id}/send-back",
            mapOf("comment" to "Cross-section details need revision"),
            dyCee,
            Void::class.java,
        ).also { assertThat(it.statusCode).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT, HttpStatus.CREATED) }

        val afterSendBack =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyCee,
                DrawingApproverListResponse::class.java,
            ).body!!

        // DY_CEE slot = SENT_BACK; SR_DEN slot still APPROVED (decision CCCC)
        assertThat(afterSendBack.approvers.find { it.id == dyCeeSlot.id }!!.status)
            .`as`("DY_CEE slot must be SENT_BACK")
            .isEqualTo("SENT_BACK")
        assertThat(afterSendBack.approvers.find { it.id == srDenSlot.id }!!.status)
            .`as`("SR_DEN slot must remain APPROVED after DY_CEE send-back (decision CCCC)")
            .isEqualTo("APPROVED")
        assertThat(afterSendBack.derivedState)
            .`as`("Drawing derived state must be SENT_BACK (any SENT_BACK row → SENT_BACK)")
            .isEqualTo("SENT_BACK")

        // ── Step 6: Dy CE/C reapproves (decision BBBB) ───────────────────────
        postEmpty(
            "/api/v1/activity-records/${record.id}/reapprove-drawing",
            dyce1,
            Void::class.java,
        ).also { assertThat(it.statusCode).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT, HttpStatus.CREATED) }

        val afterReapprove =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyCee,
                DrawingApproverListResponse::class.java,
            ).body!!

        // DY_CEE slot: SENT_BACK → PENDING; SR_DEN slot: stays APPROVED (decision BBBB)
        assertThat(afterReapprove.approvers.find { it.id == dyCeeSlot.id }!!.status)
            .`as`("DY_CEE slot must return to PENDING after reapprove")
            .isEqualTo("PENDING")
        assertThat(afterReapprove.approvers.find { it.id == srDenSlot.id }!!.status)
            .`as`("SR_DEN slot must remain APPROVED after reapprove (decision BBBB: no re-approval needed)")
            .isEqualTo("APPROVED")
        assertThat(afterReapprove.derivedState)
            .`as`("Drawing derived state must be IN_APPROVAL after reapprove")
            .isEqualTo("IN_APPROVAL")
    }
}
