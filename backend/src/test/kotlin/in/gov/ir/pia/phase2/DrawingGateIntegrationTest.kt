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
 * Phase 2.5 Gate — Drawing checklist model (phasing.md § 2.5).
 *
 * Rewritten against the record-keeping model shipped by V029 (`docs/workflow.md`
 * § 5, `DrawingService.kt`): approvers are designation-only slots (no user_id, no
 * PENDING/APPROVED/SENT_BACK status) — Dy CE/C records the date a physical
 * sign-off was received. There is no approve/send-back/reapprove action; the
 * derived `record_state` is DRAFT while any slot's `approvedOn` is null, and
 * AUTHENTICATED once every slot has one.
 *
 * Gate assertions:
 *   1. Creating an ESP drawing record seeds one approver slot per designation
 *      in ESP_DRAWING_V1's `default_approver_designations`.
 *   2. Recording an approval date on one slot leaves the others — and the
 *      overall record_state — untouched (each slot acts independently).
 *   3. Once every slot has an approvedOn date, allApproved flips true and
 *      record_state becomes AUTHENTICATED.
 *   4. Clearing a slot's approvedOn (re-open for correction) drops allApproved
 *      and reverts record_state to DRAFT without disturbing other slots.
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
class DrawingGateIntegrationTest {
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
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")
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

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.PATCH, HttpEntity(body, headersFor(cookies)), type)

    private fun recordState(recordId: UUID): String =
        jdbc.queryForObject(
            "SELECT record_state FROM activity_records WHERE id = ?",
            String::class.java,
            recordId,
        )!!

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-5 Drawing gate — checklist model records independent approval dates per designation`() {
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

        // ── Step 2: default approver slots mirror ESP_DRAWING_V1's designations ─
        val expectedDesignations =
            jdbc.queryForList(
                "SELECT unnest(default_approver_designations) FROM form_definitions WHERE code = 'ESP_DRAWING_V1'",
                String::class.java,
            ).toSet()
        assertThat(expectedDesignations).`as`("ESP_DRAWING_V1 must declare at least one default approver").isNotEmpty()

        val initial =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!

        assertThat(initial.approvers.map { it.approvalDesignationCode }.toSet())
            .`as`("Seeded approver slots must exactly match the form's default_approver_designations")
            .isEqualTo(expectedDesignations)
        assertThat(initial.allApproved)
            .`as`("A freshly created drawing has no approvals recorded yet")
            .isFalse()
        assertThat(recordState(record.id))
            .`as`("record_state must be DRAFT while any approver slot is pending")
            .isEqualTo("DRAFT")

        // ── Step 3: recording one slot's approval date leaves the rest pending ──
        val firstSlot = initial.approvers.first()
        val remainingSlots = initial.approvers.drop(1)

        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${firstSlot.id}",
                UpdateApprovalRequest(
                    sentForReviewOn = LocalDate.now().minusDays(3),
                    reviewedOn = LocalDate.now().minusDays(1),
                    approvedOn = LocalDate.now(),
                ),
                dyce1,
                DrawingApproverResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(patchResp.body!!.approvedOn).isEqualTo(LocalDate.now())
        assertThat(patchResp.body!!.daysTakenForApproval)
            .`as`("daysTakenForApproval is derived from (approvedOn - sentForReviewOn)")
            .isEqualTo(3)

        val afterFirst =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!
        assertThat(afterFirst.allApproved)
            .`as`("Other slots are still pending — allApproved must stay false")
            .isFalse()
        assertThat(afterFirst.approvers.filter { it.id != firstSlot.id }.all { it.approvedOn == null })
            .`as`("Recording one slot's approval must not affect the others — independent slots")
            .isTrue()
        assertThat(recordState(record.id)).isEqualTo("DRAFT")

        // ── Step 4: once every slot is approved, state flips to AUTHENTICATED ───
        remainingSlots.forEach { slot ->
            patch(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${slot.id}",
                UpdateApprovalRequest(approvedOn = LocalDate.now()),
                dyce1,
                DrawingApproverResponse::class.java,
            )
        }

        val afterAll =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!
        assertThat(afterAll.allApproved).isTrue()
        assertThat(recordState(record.id))
            .`as`("record_state must be AUTHENTICATED once every approver slot has an approvedOn date")
            .isEqualTo("AUTHENTICATED")

        // ── Step 5: clearing one slot re-opens it without disturbing the rest ──
        val clearResp =
            patch(
                "/api/v1/activity-records/${record.id}/drawing-approvers/${firstSlot.id}",
                UpdateApprovalRequest(approvedOn = null),
                dyce1,
                DrawingApproverResponse::class.java,
            )
        assertThat(clearResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(clearResp.body!!.approvedOn).isNull()

        val afterClear =
            get(
                "/api/v1/activity-records/${record.id}/drawing-approvers",
                dyce1,
                DrawingApproverListResponse::class.java,
            ).body!!
        assertThat(afterClear.allApproved).isFalse()
        assertThat(afterClear.approvers.filter { it.id != firstSlot.id }.all { it.approvedOn != null })
            .`as`("Clearing one slot must not clear the others")
            .isTrue()
        assertThat(recordState(record.id))
            .`as`("record_state must revert to DRAFT once any slot's approval is cleared")
            .isEqualTo("DRAFT")
    }
}
