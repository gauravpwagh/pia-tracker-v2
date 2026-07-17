package `in`.gov.ir.pia.phase2

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.ProjectDashboardDto
import `in`.gov.ir.pia.notification.NotificationSummaryDto
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.PatchActivityRecordRequest
import `in`.gov.ir.pia.service.activity.SectionWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.WorkflowActionRequest
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
import `in`.gov.ir.pia.service.project.ProjectDetailResponse
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
import org.springframework.http.MediaType
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
 * Phase 2.1 Gate — Tender Packaging golden path (phasing.md § 2.1).
 *
 * Gate: "Dy CE/C creates a Tender Packaging activity and a record.
 *        Submit → verify → authenticate works. Dashboard widget shows count."
 *
 * Test structure mirrors Phase1GoldenPathIntegrationTest.
 *
 * Key difference from Phase 1: Tender Packaging uses RECORD_STANDARD_V1 —
 * a single record-level workflow_instance with sectionCode = null.
 * All WorkflowActionRequests therefore omit sectionCode (defaults to null).
 *
 * Send-back branch is included: DYCE_1 submits → DYCE_2 sends back →
 * DYCE_1 notified → resubmits → DYCE_2 verifies → CE authenticates.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data",
        // ClamAV unreachable: not tested here (covered by Phase1GoldenPathIntegrationTest)
        "pia.clamav.host=127.0.0.1",
        "pia.clamav.port=19999",
        "pia.clamav.timeout-ms=200",
    ],
)
class TenderPackagingGateIntegrationTest {
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

        /**
         * Valid Tender Packaging data satisfying the two required fields.
         * No conditional fields triggered (tender_finalized omitted → null → no date required).
         */
        private val TP_DATA_JSON =
            """
            {
              "package_name":      "Golden Path Earthworks Package",
              "scope_description": "Earthworks and embankment for the golden path project section"
            }
            """.trimIndent()
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    /** MinIO not available in CI — mock the client bean. */
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

    private fun headersFor(
        cookies: List<String>,
        extra: HttpHeaders? = null,
    ): HttpHeaders {
        val h = HttpHeaders()
        if (cookies.isNotEmpty()) h["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        extra?.forEach { key, values -> h[key] = values }
        return h
    }

    private fun <T> post(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        eTag: String,
        type: Class<T>,
    ) =
        restTemplate.exchange(
            url,
            HttpMethod.PATCH,
            HttpEntity(
                body,
                headersFor(cookies).apply {
                    contentType = MediaType.APPLICATION_JSON
                    set("If-Match", eTag)
                },
            ),
            type,
        )

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-1 Tender Packaging golden path — create, fill, submit, verify, authenticate, dashboard count, send-back branch`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── 1. EDGS_CI creates project ─────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "TP Golden Path ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        // ── 2. CAO_C allocates to CE_C ─────────────────────────────────────────
        val cao = loginAs(CAO_C_USER_ID)
        post("/api/v1/projects/${project.id}/allocate", AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)), cao, ProjectDetailResponse::class.java)

        // ── 3. CE_C assigns DYCE_1, designates DYCE_2 as Nodal ────────────────
        val ce = loginAs(CE_C_USER_ID)
        post("/api/v1/projects/${project.id}/assign-dyce", AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)), ce, ProjectDetailResponse::class.java)
        post("/api/v1/projects/${project.id}/designate-nodal", DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID), ce, ProjectDetailResponse::class.java)

        // ── 4. DYCE_1 creates Tender Packaging activity + record ──────────────
        val dyce1 = loginAs(DYCE_1_USER_ID)
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(activityTypeCode = "TENDER_PACKAGING", name = "Phase 2.1 TP Gate Activity"),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        val createRecordResp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createRecordResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createRecordResp.body!!
        val recordETag = createRecordResp.headers["ETag"]?.firstOrNull() ?: "\"${record.version}\""

        // ── 5. DYCE_1 fills the required fields ───────────────────────────────
        val tpDataNode = objectMapper.readTree(TP_DATA_JSON)
        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}",
                PatchActivityRecordRequest(dataJson = tpDataNode),
                dyce1,
                recordETag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(
            patchResp.body!!
                .dataJson
                .get("package_name")
                ?.asText(),
        ).isEqualTo("Golden Path Earthworks Package")

        // ── 6. DYCE_1 submits (no sectionCode — RECORD_STANDARD_V1) ──────────
        val submitResp =
            post(
                "/api/v1/activity-records/${record.id}/submit",
                WorkflowActionRequest(), // sectionCode = null for flat record
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 (Nodal) notified on submit
        val dyce2 = loginAs(DYCE_2_USER_ID)
        val nodalNotif = get("/api/v1/notifications", dyce2, NotificationSummaryDto::class.java).body!!
        assertThat(nodalNotif.notifications)
            .`as`("Nodal must be notified when a TP record is submitted")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record.id }

        // ── 7. DYCE_2 (Nodal) verifies ────────────────────────────────────────
        val verifyResp =
            post(
                "/api/v1/activity-records/${record.id}/verify",
                WorkflowActionRequest(),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // CE_C notified on verify
        val ceNotif = get("/api/v1/notifications", ce, NotificationSummaryDto::class.java).body!!
        assertThat(ceNotif.notifications)
            .`as`("CE must be notified when a TP record is verified")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record.id }

        // ── 8. CE_C authenticates ─────────────────────────────────────────────
        val authResp =
            post(
                "/api/v1/activity-records/${record.id}/authenticate",
                WorkflowActionRequest(),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(authResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(authResp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")

        // DYCE_1 notified on authentication
        val dyce1Notif = get("/api/v1/notifications", dyce1, NotificationSummaryDto::class.java).body!!
        assertThat(dyce1Notif.notifications)
            .`as`("DYCE_1 must be notified when their TP record is authenticated")
            .anyMatch {
                it.notificationType == "WORKFLOW_ACTION" &&
                    it.entityId == record.id &&
                    it.title.contains("authenticated", ignoreCase = true)
            }

        // ── A. Dashboard shows authenticated_count ≥ 1 for TENDER_PACKAGING ──
        val dashboard =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val tpSummary = dashboard.summaries.find { it.activityTypeCode == "TENDER_PACKAGING" }
        assertThat(tpSummary)
            .`as`("Dashboard must include a TENDER_PACKAGING summary after first authenticated record")
            .isNotNull
        assertThat(tpSummary!!.authenticatedCount)
            .`as`("TENDER_PACKAGING authenticated_count must be ≥ 1")
            .isGreaterThanOrEqualTo(1)

        // ─────────────────────────────────────────────────────────────────────
        // ── SEND-BACK BRANCH ─────────────────────────────────────────────────
        // DYCE_1 submits record 2 → DYCE_2 sends back → DYCE_1 notified →
        // DYCE_1 resubmits → DYCE_2 verifies → CE authenticates.
        // Dashboard must show ≥ 2 authenticated records.
        // ─────────────────────────────────────────────────────────────────────

        val createRecord2Resp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        val record2 = createRecord2Resp.body!!
        val record2ETag = createRecord2Resp.headers["ETag"]?.firstOrNull() ?: "\"${record2.version}\""

        // Fill record 2 with different data
        val tp2DataNode =
            objectMapper.readTree(
                """
                {
                  "package_name":      "Golden Path Bridges Package",
                  "scope_description": "Construction of minor bridges on the golden path section"
                }
                """.trimIndent(),
            )
        val patchRecord2Resp =
            patch(
                "/api/v1/activity-records/${record2.id}",
                PatchActivityRecordRequest(dataJson = tp2DataNode),
                dyce1,
                record2ETag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchRecord2Resp.statusCode).isEqualTo(HttpStatus.OK)

        // DYCE_1 submits record 2
        val submit2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/submit",
                WorkflowActionRequest(),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submit2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submit2Resp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 sends back record 2
        val sendBackResp =
            post(
                "/api/v1/activity-records/${record2.id}/send-back",
                WorkflowActionRequest(comment = "Scope description incomplete — please expand and resubmit"),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(sendBackResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(sendBackResp.body!!.currentStateCode).isEqualTo("SENT_BACK_TO_DYCE")

        // DYCE_1 notified of send-back
        val dyce1SendBackNotif = get("/api/v1/notifications", dyce1, NotificationSummaryDto::class.java).body!!
        assertThat(dyce1SendBackNotif.notifications)
            .`as`("DYCE_1 must be notified when TP record 2 is sent back")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record2.id }

        // DYCE_1 resubmits
        val resubmitResp =
            post(
                "/api/v1/activity-records/${record2.id}/resubmit",
                WorkflowActionRequest(),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(resubmitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(resubmitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 verifies record 2
        val verify2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/verify",
                WorkflowActionRequest(),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verify2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verify2Resp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // CE authenticates record 2
        val auth2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/authenticate",
                WorkflowActionRequest(),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(auth2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(auth2Resp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")

        // Dashboard must now show ≥ 2 authenticated TP records
        val dashboard2 =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val tpSummary2 = dashboard2.summaries.find { it.activityTypeCode == "TENDER_PACKAGING" }
        assertThat(tpSummary2!!.authenticatedCount)
            .`as`("TENDER_PACKAGING authenticated_count must be ≥ 2 after send-back branch")
            .isGreaterThanOrEqualTo(2)
    }
}
