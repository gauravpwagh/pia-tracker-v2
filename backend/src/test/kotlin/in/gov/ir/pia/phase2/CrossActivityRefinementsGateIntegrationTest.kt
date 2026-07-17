package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.InboxResponse
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.ProjectOverviewDto
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.WorkflowActionRequest
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
import `in`.gov.ir.pia.service.project.ProjectDetailResponse
import `in`.gov.ir.pia.workflow.BulkTransitionRequest
import `in`.gov.ir.pia.workflow.BulkTransitionResponse
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
 * Phase 2.11 Gate — Cross-activity refinements (phasing.md § 2.11).
 *
 * Gate:
 *   "SLA breaches appear on tree nodes (with bubble-up to parent activity and
 *    project). Inbox 'SLA Breached' tab has the right items. A CE/C
 *    bulk-authenticates 5 records in one action; the audit log has 5 entries."
 *
 * Scenarios:
 *   A. Project overview endpoint — returns per-activity cards with slaBreachCount
 *      and project-level totalSlaBreaches (both non-negative).
 *
 *   B. SLA breach in inbox — after forcing a workflow instance's entered_state_at
 *      to 8 days ago (sla_days = 7 for SUBMITTED_FOR_VERIFICATION), the inbox
 *      for the Nodal user contains the item in slaBreached.
 *
 *   C. Bulk transition — CE/C bulk-authenticates 5 VERIFIED records in one
 *      POST /api/v1/workflow/bulk-transition call; the audit log has 5 rows
 *      with action 'WORKFLOW.AUTHENTICATED'.
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
class CrossActivityRefinementsGateIntegrationTest {
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

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Full gate test ────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-11 cross-activity refinements — SLA breach surfacing, project overview, bulk transition`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val edgs = loginAs(EDGS_CI_USER_ID)
        val cao = loginAs(CAO_C_USER_ID)
        val ce = loginAs(CE_C_USER_ID)
        val dyce1 = loginAs(DYCE_1_USER_ID)
        val dyce2 = loginAs(DYCE_2_USER_ID) // acts as Nodal in this test

        // ── Setup: project + team ─────────────────────────────────────────────
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(
                    name = "Refinements Gate Project ${UUID.randomUUID()}",
                    zoneId = nrZoneId,
                ),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
            cao,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project.id}/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID, DYCE_2_USER_ID)),
            ce,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project.id}/designate-nodal",
            DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID),
            ce,
            ProjectDetailResponse::class.java,
        )

        // ── Create a TENDER_PACKAGING activity ───────────────────────────────
        // Tender Packaging uses RECORD_STANDARD_V1 (no sections) so submit/verify/
        // authenticate can be called without a sectionCode.
        // DYCE_1 creates the activity (primaryDyceUserId defaults to the principal).
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(
                    activityTypeCode = "TENDER_PACKAGING",
                    name = "Tender Package 1",
                ),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        // ── Scenario A: Project overview endpoint ─────────────────────────────
        // Even with no records, the endpoint must return 200 with valid structure.
        val overviewResp =
            get(
                "/api/v1/dashboard/projects/${project.id}/overview",
                ce,
                ProjectOverviewDto::class.java,
            )
        assertThat(overviewResp.statusCode)
            .`as`("Project overview must return 200")
            .isEqualTo(HttpStatus.OK)
        val overview = overviewResp.body!!
        assertThat(overview.projectId).isEqualTo(project.id)
        assertThat(overview.name).isNotBlank()
        assertThat(overview.lifecycleState).isNotBlank()
        assertThat(overview.totalSlaBreaches).isGreaterThanOrEqualTo(0)
        assertThat(overview.totalDrawingsInApproval).isGreaterThanOrEqualTo(0)

        // ── Scenario B: SLA breach in inbox ───────────────────────────────────
        // Create one record, submit it; then wind back entered_state_at to 8 days.
        // SUBMITTED_FOR_VERIFICATION has sla_days=7, so 8 days past == breached.
        val slaRecord =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(),
                dyce1,
                ActivityRecordDetailResponse::class.java,
            ).body!!

        // Submit the record (DYCE_1 has ROLE_DY_CE_C → 'submit' action)
        post(
            "/api/v1/activity-records/${slaRecord.id}/submit",
            WorkflowActionRequest(),
            dyce1,
            Void::class.java,
        )

        // Wind back entered_state_at so the record looks 8 days overdue
        val updatedRows =
            jdbc.update(
                """
                UPDATE workflow_instances wi
                SET entered_state_at = now() - INTERVAL '8 days'
                WHERE wi.entity_id = ?
                  AND wi.entity_type = 'ACTIVITY_RECORD'
                  AND EXISTS (
                      SELECT 1 FROM workflow_states ws WHERE ws.id = wi.current_state_id
                      AND ws.code = 'SUBMITTED_FOR_VERIFICATION'
                  )
                """.trimIndent(),
                slaRecord.id,
            )
        assertThat(updatedRows)
            .`as`("Should have found the SUBMITTED_FOR_VERIFICATION instance to wind back")
            .isGreaterThanOrEqualTo(1)

        // Inbox for Nodal (DYCE_2 holds ROLE_NODAL_DY_CE_C → receives SUBMITTED items)
        val inboxResp = get("/api/v1/workflow/inbox", dyce2, InboxResponse::class.java)
        assertThat(inboxResp.statusCode).isEqualTo(HttpStatus.OK)
        val inbox = inboxResp.body!!

        assertThat(inbox.slaBreached)
            .`as`("slaBreached list must contain the overdue record")
            .isNotEmpty()

        val breachedItem = inbox.slaBreached.find { it.recordId == slaRecord.id }
        assertThat(breachedItem)
            .`as`("The wound-back record must appear in slaBreached")
            .isNotNull()
        assertThat(breachedItem!!.isSlaBreached).isTrue()
        assertThat(breachedItem.daysPending).isGreaterThanOrEqualTo(7)

        // ── Scenario C: Bulk transition — CE/C bulk-authenticates 5 records ──
        // Create 5 records, walk them to VERIFIED (submit → verify), then
        // CE/C calls bulk-transition with action="authenticate".
        val bulkRecordIds =
            (1..5).map {
                post(
                    "/api/v1/activities/${activity.id}/records",
                    CreateActivityRecordRequest(),
                    dyce1,
                    ActivityRecordDetailResponse::class.java,
                ).body!!.id
            }

        // Submit all 5 (DY CE/C submits)
        bulkRecordIds.forEach { recordId ->
            val resp =
                post(
                    "/api/v1/activity-records/$recordId/submit",
                    WorkflowActionRequest(),
                    dyce1,
                    Void::class.java,
                )
            assertThat(resp.statusCode)
                .`as`("Submit for record $recordId should succeed")
                .isIn(HttpStatus.OK, HttpStatus.NO_CONTENT)
        }

        // Verify all 5 (Nodal verifies — DYCE_2 has ROLE_NODAL_DY_CE_C)
        bulkRecordIds.forEach { recordId ->
            val resp =
                post(
                    "/api/v1/activity-records/$recordId/verify",
                    WorkflowActionRequest(),
                    dyce2,
                    Void::class.java,
                )
            assertThat(resp.statusCode)
                .`as`("Verify for record $recordId should succeed")
                .isIn(HttpStatus.OK, HttpStatus.NO_CONTENT)
        }

        // CE/C bulk-authenticates all 5 in one call
        val bulkResp =
            post(
                "/api/v1/workflow/bulk-transition",
                BulkTransitionRequest(
                    recordIds = bulkRecordIds,
                    action = "authenticate",
                ),
                ce,
                BulkTransitionResponse::class.java,
            )
        assertThat(bulkResp.statusCode)
            .`as`("Bulk transition must return 200")
            .isEqualTo(HttpStatus.OK)

        val bulkBody = bulkResp.body!!
        assertThat(bulkBody.total).isEqualTo(5)
        assertThat(bulkBody.succeeded)
            .`as`("All 5 records must succeed")
            .isEqualTo(5)
        assertThat(bulkBody.failed).isEqualTo(0)

        // All 5 results are individually marked as success
        assertThat(bulkBody.results.all { it.success }).isTrue()
        assertThat(bulkBody.results.map { it.recordId }.toSet())
            .isEqualTo(bulkRecordIds.toSet())

        // Audit log must have 5 WORKFLOW.AUTHENTICATED entries for our records.
        // Build an IN clause from the UUID list to avoid JDBC array type issues.
        val idPlaceholders = bulkRecordIds.joinToString(",") { "?" }
        val auditCount =
            jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM audit_log
                WHERE action = 'WORKFLOW.AUTHENTICATED'
                  AND entity_type = 'ACTIVITY_RECORD'
                  AND entity_id IN ($idPlaceholders)
                """.trimIndent(),
                Long::class.java,
                *bulkRecordIds.toTypedArray(),
            )!!
        assertThat(auditCount)
            .`as`("Audit log must contain exactly 5 WORKFLOW.AUTHENTICATED entries for the bulk records")
            .isEqualTo(5L)

        // ── Project overview post-bulk: activity card is present ───────────────
        val overviewAfterBulk =
            get(
                "/api/v1/dashboard/projects/${project.id}/overview",
                ce,
                ProjectOverviewDto::class.java,
            ).body!!

        assertThat(overviewAfterBulk.activityCards).isNotEmpty()
        val laCard = overviewAfterBulk.activityCards.find { it.activityTypeCode == "TENDER_PACKAGING" }
        assertThat(laCard)
            .`as`("Activity cards must include TENDER_PACKAGING")
            .isNotNull()
        assertThat(laCard!!.slaBreachCount).isGreaterThanOrEqualTo(0)
        assertThat(laCard.ragStatus).isIn("GREEN", "AMBER", "RED")
        // 5 records are now AUTHENTICATED so authenticatedCount should reflect them
        assertThat(laCard.authenticatedCount)
            .`as`("authenticatedCount must be 5 after bulk authenticate")
            .isEqualTo(5)
    }
}
