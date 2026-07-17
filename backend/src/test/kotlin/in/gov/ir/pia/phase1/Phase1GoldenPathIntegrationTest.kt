package `in`.gov.ir.pia.phase1

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.AuditLogEntryDto
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
import org.springframework.core.ParameterizedTypeReference
import org.springframework.core.io.ByteArrayResource
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
import org.springframework.util.LinkedMultiValueMap
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

/**
 * Phase 1 Final Gate — Golden-path end-to-end test (phasing.md § gate 1.14).
 *
 * Full golden path:
 *   project creation → activity creation → record creation → fill SRP data →
 *   SRP submit → Nodal verify → CE authenticate.
 *
 * After authentication, verifies:
 *   A. DYCE_1 received an "authenticated" notification.
 *   B. Dashboard shows authenticated_count ≥ 1 for LAND_ACQUISITION.
 *   C. Audit log contains WORKFLOW.SUBMITTED_FOR_VERIFICATION, WORKFLOW.VERIFIED,
 *      WORKFLOW.AUTHENTICATED.
 *   D. Attachment upload is blocked when ClamAV is unreachable (scan-mandatory gate).
 *
 * A second test record exercises the send-back branch:
 *   submit → DYCE_2 sends back → assert DYCE_1 notified → DYCE_1 resubmits →
 *   DYCE_2 verifies → CE authenticates.
 *
 * ## Sidecar mocking
 *
 * **MinIO**: [MinioClient] is `@MockkBean` — the MinIO sidecar is not available in CI
 * Testcontainers environments.  The Spring context will fail to start without this mock
 * because [MinioConfig] creates a real client bean that tries to connect on first use.
 * A full attachment round-trip (upload → presigned download) is tested separately in
 * `AttachmentIntegrationTest` which brings up a Testcontainers MinIO instance.
 *
 * **ClamAV**: No container is started.  Instead, [TestPropertySource] points
 * `pia.clamav.host` at `127.0.0.1:19999` with a 200 ms timeout.  The upload call
 * exercises [AttachmentService.scanWithClamAv] exactly as it would in production;
 * the socket connection is refused or times out, and the service maps that to
 * `503 SERVICE_UNAVAILABLE`.  This proves the scan path is mandatory — the file
 * never reaches MinIO.
 *
 * ## Known gap — ClamAV 503 timing
 *
 * The assertion for gate D expects HTTP 503.  On most OS/JVM combinations an
 * unbound port (19999) returns an immediate TCP RST, so the 200 ms timeout is
 * never reached; the `catch (e: Exception)` block in `scanWithClamAv` fires on
 * `ConnectException` and correctly maps it to 503.
 *
 * On certain CI sandbox environments (e.g. strict network namespaces that drop
 * packets instead of rejecting them) the 200 ms timeout fires instead, producing
 * the same 503 outcome via `SocketTimeoutException`.  Both paths are correct.
 *
 * If this test is ever run in an environment where port 19999 is actually bound
 * by another process, gate D would pass the scan and the assertion would fail with
 * an unexpected 201 or 415.  The fix is to use an ephemeral port guaranteed to be
 * unbound, or to bring in a real ClamAV Testcontainer for this assertion.
 * Tracking: see `docs/testing.md` § known gaps (GAP-001).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data",
        // ClamAV unreachable → upload must be blocked (scan-mandatory gate)
        "pia.clamav.host=127.0.0.1",
        "pia.clamav.port=19999",
        "pia.clamav.timeout-ms=200",
    ],
)
class Phase1GoldenPathIntegrationTest {
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

        /** Valid SRP data satisfying the top-level required fields and the SRP section. */
        private val SRP_DATA_JSON =
            """
            {
              "village_name": "Golden Path Village",
              "village_chainage_from": "100+000",
              "village_chainage_to": "100+500",
              "district": "Test District",
              "srp": {
                "srp_declared_in_gaz_on": "2024-01-15"
              }
            }
            """.trimIndent()
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    /** MinIO not available in CI — mock the client bean so the context starts. */
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
    ) = restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        eTag: String,
        type: Class<T>,
    ) = restTemplate.exchange(
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
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: ParameterizedTypeReference<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Golden path ────────────────────────────────────────────────────────────

    @Test
    fun `Phase 1 golden path — create project, activity, record, fill SRP, submit, verify, authenticate, notifications, dashboard and audit all correct, send-back branch exercised`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── 1. EDGS_CI creates a project ──────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Golden Path Project ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        // ── 2. CAO_C allocates to CE_C ─────────────────────────────────────────
        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
            cao,
            ProjectDetailResponse::class.java,
        )

        // ── 3. CE_C assigns DYCE_1, designates DYCE_2 as Nodal ────────────────
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

        // ── 4. DYCE_1 creates activity + record ───────────────────────────────
        val dyce1 = loginAs(DYCE_1_USER_ID)

        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(
                    activityTypeCode = "LAND_ACQUISITION",
                    name = "Phase 1 LA Golden Path",
                ),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        val createRecordResp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        val record = createRecordResp.body!!
        // Capture the ETag for the PATCH If-Match header
        val recordETag = createRecordResp.headers["ETag"]?.firstOrNull() ?: "\"${record.version}\""

        // ── 5. DYCE_1 fills in the SRP section data ───────────────────────────
        // Required before submit: top-level required fields (village_name, chainage_from/to)
        // and SRP section (srp_declared_in_gaz_on).
        val srpDataNode = objectMapper.readTree(SRP_DATA_JSON)
        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}",
                PatchActivityRecordRequest(dataJson = srpDataNode),
                dyce1,
                recordETag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(
            patchResp.body!!
                .dataJson
                .get("village_name")
                ?.asText(),
        ).isEqualTo("Golden Path Village")

        // ── D. Upload blocked when ClamAV unreachable (scan mandatory gate) ───
        // Build a multipart request with correct application/pdf content-type on
        // the file part so the request passes the content-type guard and reaches
        // the ClamAV scan — which must then fail (port 19999 / 200 ms timeout).
        val multipartHeaders = headersFor(dyce1).apply { contentType = MediaType.MULTIPART_FORM_DATA }
        val pdfBytes = "%PDF-1.4 minimal fake pdf for gate test".toByteArray(Charsets.UTF_8)
        // Wrap the file part so TestRestTemplate sends Content-Type: application/pdf
        val filePartHeaders = HttpHeaders().apply { contentType = MediaType.APPLICATION_PDF }
        val filePart =
            HttpEntity(
                object : ByteArrayResource(pdfBytes) {
                    override fun getFilename() = "gazette.pdf"
                },
                filePartHeaders,
            )
        val parts =
            LinkedMultiValueMap<String, Any>().apply {
                add("entityType", "ACTIVITY_RECORD")
                add("entityId", record.id.toString())
                add("file", filePart)
            }
        val uploadResp =
            restTemplate.postForEntity(
                "/api/v1/attachments",
                HttpEntity(parts, multipartHeaders),
                Map::class.java,
            )
        assertThat(uploadResp.statusCode)
            .`as`("Upload must be blocked when ClamAV unreachable — scan is mandatory")
            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)

        // ── 6. DYCE_1 submits the SRP section ─────────────────────────────────
        val submitResp =
            post(
                "/api/v1/activity-records/${record.id}/submit",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 (Nodal) should now have a "submitted" notification
        val dyce2 = loginAs(DYCE_2_USER_ID)
        val nodalNotifAfterSubmit =
            get(
                "/api/v1/notifications",
                dyce2,
                NotificationSummaryDto::class.java,
            ).body!!
        assertThat(nodalNotifAfterSubmit.notifications)
            .`as`("Nodal must be notified on SUBMITTED")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record.id }

        // ── 7. DYCE_2 (Nodal) verifies ────────────────────────────────────────
        val verifyResp =
            post(
                "/api/v1/activity-records/${record.id}/verify",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // CE_C should now have a "pending authentication" notification
        val ceNotifAfterVerify =
            get(
                "/api/v1/notifications",
                ce,
                NotificationSummaryDto::class.java,
            ).body!!
        assertThat(ceNotifAfterVerify.notifications)
            .`as`("CE must be notified on VERIFIED")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record.id }

        // ── 8. CE_C authenticates ─────────────────────────────────────────────
        val authResp =
            post(
                "/api/v1/activity-records/${record.id}/authenticate",
                WorkflowActionRequest(sectionCode = "srp"),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(authResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(authResp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")

        // ── A. DYCE_1 receives "authenticated" notification ───────────────────
        val dyce1NotifAfterAuth =
            get(
                "/api/v1/notifications",
                dyce1,
                NotificationSummaryDto::class.java,
            ).body!!
        assertThat(dyce1NotifAfterAuth.notifications)
            .`as`("Record creator (DYCE_1) must be notified on AUTHENTICATED")
            .anyMatch {
                it.notificationType == "WORKFLOW_ACTION" &&
                    it.entityId == record.id &&
                    it.title.contains("authenticated", ignoreCase = true)
            }

        // ── B. Dashboard shows authenticated_count ≥ 1 ────────────────────────
        val dashboard =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val laSummary = dashboard.summaries.find { it.activityTypeCode == "LAND_ACQUISITION" }
        assertThat(laSummary)
            .`as`("Dashboard must have a LAND_ACQUISITION summary")
            .isNotNull
        assertThat(laSummary!!.authenticatedCount)
            .`as`("authenticated_count must be ≥ 1 after authentication")
            .isGreaterThanOrEqualTo(1)

        // ── C. Audit log has all three transition entries ──────────────────────
        val auditEntries =
            get(
                "/api/v1/audit?entityType=ACTIVITY_RECORD&entityId=${record.id}",
                dyce1,
                object : ParameterizedTypeReference<List<AuditLogEntryDto>>() {},
            ).body!!
        val actions = auditEntries.map { it.action }
        assertThat(actions)
            .`as`("Audit log must contain all three transition entries")
            .contains("WORKFLOW.SUBMITTED_FOR_VERIFICATION")
            .contains("WORKFLOW.VERIFIED")
            .contains("WORKFLOW.AUTHENTICATED")

        // ─────────────────────────────────────────────────────────────────────
        // ── SEND-BACK BRANCH ─────────────────────────────────────────────────
        // ─────────────────────────────────────────────────────────────────────
        // A second record: DYCE_1 submits → Nodal sends back → DYCE_1 notified →
        // DYCE_1 resubmits → Nodal verifies → CE authenticates.

        val createRecord2Resp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        val record2 = createRecord2Resp.body!!
        val record2ETag = createRecord2Resp.headers["ETag"]?.firstOrNull() ?: "\"${record2.version}\""

        // Fill SRP data on the second record before submitting
        val patchRecord2Resp =
            patch(
                "/api/v1/activity-records/${record2.id}",
                PatchActivityRecordRequest(dataJson = srpDataNode),
                dyce1,
                record2ETag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchRecord2Resp.statusCode).isEqualTo(HttpStatus.OK)

        // DYCE_1 submits record 2
        val submit2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/submit",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submit2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submit2Resp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 sends back record 2 with a comment
        val sendBackResp =
            post(
                "/api/v1/activity-records/${record2.id}/send-back",
                WorkflowActionRequest(sectionCode = "srp", comment = "Gazette number is missing — please correct and resubmit"),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(sendBackResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(sendBackResp.body!!.currentStateCode).isEqualTo("SENT_BACK_TO_DYCE")

        // DYCE_1 must be notified of the send-back
        val dyce1NotifAfterSendBack =
            get(
                "/api/v1/notifications",
                dyce1,
                NotificationSummaryDto::class.java,
            ).body!!
        assertThat(dyce1NotifAfterSendBack.notifications)
            .`as`("DYCE_1 must be notified when the record is sent back")
            .anyMatch { it.notificationType == "WORKFLOW_ACTION" && it.entityId == record2.id }

        // DYCE_1 resubmits after correction
        val resubmitResp =
            post(
                "/api/v1/activity-records/${record2.id}/resubmit",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(resubmitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(resubmitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // DYCE_2 verifies record 2
        val verify2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/verify",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verify2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verify2Resp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // CE authenticates record 2
        val auth2Resp =
            post(
                "/api/v1/activity-records/${record2.id}/authenticate",
                WorkflowActionRequest(sectionCode = "srp"),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(auth2Resp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(auth2Resp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")

        // Dashboard must now show ≥ 2 authenticated records
        val dashboard2 =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val laSummary2 = dashboard2.summaries.find { it.activityTypeCode == "LAND_ACQUISITION" }
        assertThat(laSummary2!!.authenticatedCount)
            .`as`("authenticated_count must be ≥ 2 after both records are authenticated")
            .isGreaterThanOrEqualTo(2)
    }
}
