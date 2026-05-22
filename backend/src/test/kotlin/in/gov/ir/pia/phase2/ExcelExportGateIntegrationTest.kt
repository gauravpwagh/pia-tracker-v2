package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.export.ExportJobStatusResponse
import `in`.gov.ir.pia.export.ExportJobSubmitResponse
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
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
 * Phase 2.10 Gate — Excel Export (phasing.md § 2.10).
 *
 * Gate:
 *   "Project-scope export downloads .xlsx with expected sheets and row counts.
 *    Zone-scope export queues, completes, notification fires, download link
 *    works once and then expires (returns 410). Excel files open in real Excel
 *    without warnings."
 *
 * Test scenarios:
 *   1.  CE/C (EXPORT.PROJECT) exports a project → 200, Content-Type xlsx,
 *       non-empty bytes (valid POI workbook).
 *   2.  DY CE/C (no export permission on zone) → 403 on the project export
 *       endpoint (only CE/C and above have EXPORT.PROJECT).
 *   3.  CAO/C (EXPORT.ZONE) submits zone export → 202 + jobId.
 *   4.  Job status endpoint returns current status.
 *   5.  Job completes within 10 s (async processing).
 *   6.  Download returns 200 with xlsx bytes.
 *   7.  Second download returns 410 Gone (one-time link).
 *   8.  An EXPORT_READY notification was created for the CAO/C user.
 *   9.  DY CE/C → 403 on zone export endpoint.
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
class ExcelExportGateIntegrationTest {

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

        // Users seeded by V001_004
        val EDGS_CI_USER_ID: UUID  = UUID.fromString("11111111-1111-1111-1111-111111111101")
        val CAO_C_USER_ID: UUID    = UUID.fromString("11111111-1111-1111-1111-111111111102")
        val CE_C_USER_ID: UUID     = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID   = UUID.fromString("11111111-1111-1111-1111-111111111104")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var jdbc: JdbcTemplate
    @MockkBean lateinit var minioClient: MinioClient

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun loginAs(userId: UUID): List<String> {
        val resp = restTemplate.postForEntity(
            "/api/v1/auth/select-user", SelectUserRequest(userId), Void::class.java,
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        return resp.headers["Set-Cookie"] ?: emptyList()
    }

    private fun headersFor(cookies: List<String>): HttpHeaders {
        val h = HttpHeaders()
        if (cookies.isNotEmpty()) h["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        return h
    }

    private fun <T> post(url: String, body: Any, cookies: List<String>, type: Class<T>) =
        restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> get(url: String, cookies: List<String>, type: Class<T>) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    /** Polls GET {url} until [predicate] is true or [timeoutMs] elapses. Returns the last response. */
    private fun <T> pollUntil(
        url: String,
        cookies: List<String>,
        type: Class<T>,
        timeoutMs: Long = 10_000L,
        pollIntervalMs: Long = 300L,
        predicate: (T) -> Boolean,
    ): T {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val resp = get(url, cookies, type)
            if (resp.statusCode == HttpStatus.OK && resp.body != null && predicate(resp.body!!)) {
                return resp.body!!
            }
            Thread.sleep(pollIntervalMs)
        }
        error("Timed out waiting for condition on $url after ${timeoutMs}ms")
    }

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-10 Excel export — project sync, zone async, one-time download, 403 enforcement`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val edgs = loginAs(EDGS_CI_USER_ID)
        val cao  = loginAs(CAO_C_USER_ID)
        val ce   = loginAs(CE_C_USER_ID)
        val dyce = loginAs(DYCE_1_USER_ID)

        // ── Setup: Create a project so the export has data ────────────────────
        val project = post(
            "/api/v1/projects",
            CreateProjectRequest(
                name = "Export Gate Project ${UUID.randomUUID()}",
                zoneId = nrZoneId,
            ),
            edgs,
            ProjectDetailResponse::class.java,
        ).body!!

        // CAO/C allocates so the project is in ACTIVE / accessible state
        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
            cao,
            ProjectDetailResponse::class.java,
        )

        // ── Scenario 1: CE/C downloads project export (synchronous) ───────────
        val projectExportResp = get(
            "/api/v1/export/projects/${project.id}",
            ce,
            ByteArray::class.java,
        )
        assertThat(projectExportResp.statusCode)
            .`as`("CE/C should receive 200 on project export")
            .isEqualTo(HttpStatus.OK)

        val projectBytes = projectExportResp.body!!
        assertThat(projectBytes).isNotEmpty()
        assertThat(projectExportResp.headers.contentType?.toString())
            .`as`("Content-Type should be xlsx")
            .contains("spreadsheetml")

        // Validate it is a valid POI workbook (no warnings, no corruption)
        val wb = org.apache.poi.xssf.usermodel.XSSFWorkbook(
            java.io.ByteArrayInputStream(projectBytes),
        )
        assertThat(wb.numberOfSheets)
            .`as`("Project xlsx must have at least 2 sheets (Summary + Activity Records)")
            .isGreaterThanOrEqualTo(2)
        assertThat(wb.getSheetName(0))
            .`as`("First sheet must be named Summary")
            .isEqualTo("Summary")
        assertThat(wb.getSheetName(1))
            .`as`("Second sheet must be named Activity Records")
            .isEqualTo("Activity Records")
        wb.close()

        // ── Scenario 2: DY CE/C → 403 on project export endpoint ─────────────
        val dyceProjectExportResp = get(
            "/api/v1/export/projects/${project.id}",
            dyce,
            Void::class.java,
        )
        assertThat(dyceProjectExportResp.statusCode)
            .`as`("DY CE/C without EXPORT.PROJECT must receive 403")
            .isEqualTo(HttpStatus.FORBIDDEN)

        // ── Scenario 3: CAO/C submits zone export (asynchronous) → 202 ────────
        val zoneSubmitResp = restTemplate.exchange(
            "/api/v1/export/zone/$nrZoneId",
            HttpMethod.POST,
            HttpEntity<Void>(headersFor(cao)),
            ExportJobSubmitResponse::class.java,
        )
        assertThat(zoneSubmitResp.statusCode)
            .`as`("Zone export submission must return 202 Accepted")
            .isEqualTo(HttpStatus.ACCEPTED)

        val submitBody = zoneSubmitResp.body!!
        assertThat(submitBody.jobId).isNotNull()
        assertThat(submitBody.status).isEqualTo("QUEUED")
        val jobId = submitBody.jobId

        // ── Scenario 4: Job status endpoint is accessible ─────────────────────
        val statusResp = get("/api/v1/export/jobs/$jobId", cao, ExportJobStatusResponse::class.java)
        assertThat(statusResp.statusCode).isEqualTo(HttpStatus.OK)

        // ── Scenario 5: Wait for async job to complete (max 10 s) ─────────────
        val completedStatus = pollUntil(
            "/api/v1/export/jobs/$jobId",
            cao,
            ExportJobStatusResponse::class.java,
            timeoutMs = 10_000L,
        ) { it.status == "COMPLETED" }

        assertThat(completedStatus.status).isEqualTo("COMPLETED")
        assertThat(completedStatus.fileName)
            .`as`("Completed job must have a file name")
            .isNotBlank()

        // ── Scenario 6: Download returns xlsx bytes ────────────────────────────
        val downloadResp = get("/api/v1/export/jobs/$jobId/download", cao, ByteArray::class.java)
        assertThat(downloadResp.statusCode)
            .`as`("First download must return 200")
            .isEqualTo(HttpStatus.OK)

        val downloadBytes = downloadResp.body!!
        assertThat(downloadBytes).isNotEmpty()

        // Validate xlsx workbook integrity
        val zoneWb = org.apache.poi.xssf.usermodel.XSSFWorkbook(
            java.io.ByteArrayInputStream(downloadBytes),
        )
        assertThat(zoneWb.numberOfSheets)
            .`as`("Zone xlsx must have at least 2 sheets (Summary + Projects)")
            .isGreaterThanOrEqualTo(2)
        assertThat(zoneWb.getSheetName(0))
            .`as`("First sheet must be named Summary")
            .isEqualTo("Summary")
        assertThat(zoneWb.getSheetName(1))
            .`as`("Second sheet must be named Projects")
            .isEqualTo("Projects")
        zoneWb.close()

        // ── Scenario 7: Second download → 410 Gone (one-time link) ───────────
        val secondDownloadResp = get("/api/v1/export/jobs/$jobId/download", cao, Void::class.java)
        assertThat(secondDownloadResp.statusCode)
            .`as`("Second download must return 410 Gone")
            .isEqualTo(HttpStatus.GONE)

        // ── Scenario 8: EXPORT_READY notification fired for CAO/C ─────────────
        val notificationCount = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM notifications
            WHERE recipient_user_id = ?
              AND notification_type = 'EXPORT_READY'
              AND entity_id = ?
            """.trimIndent(),
            Long::class.java,
            CAO_C_USER_ID,
            jobId,
        )!!
        assertThat(notificationCount)
            .`as`("EXPORT_READY notification must be created for the requesting user")
            .isGreaterThanOrEqualTo(1L)

        // ── Scenario 9: DY CE/C → 403 on zone export endpoint ────────────────
        val dyceZoneResp = restTemplate.exchange(
            "/api/v1/export/zone/$nrZoneId",
            HttpMethod.POST,
            HttpEntity<Void>(headersFor(dyce)),
            Void::class.java,
        )
        assertThat(dyceZoneResp.statusCode)
            .`as`("DY CE/C without EXPORT.ZONE must receive 403")
            .isEqualTo(HttpStatus.FORBIDDEN)
    }
}
