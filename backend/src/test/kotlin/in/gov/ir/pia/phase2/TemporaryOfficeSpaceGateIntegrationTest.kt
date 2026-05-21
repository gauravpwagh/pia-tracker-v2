package `in`.gov.ir.pia.phase2

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.ProjectDashboardDto
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
 * Phase 2.2 Gate — Temporary Office Space golden path (phasing.md § 2.2).
 *
 * Gate: "All three structure types (NEW_REQUIRED, OLD_AVAILABLE, HIRING)
 *        render their conditional fields. Records flow through workflow."
 *
 * One record per structure type flows through the full submit → verify →
 * authenticate chain. After all three are authenticated the dashboard
 * authenticated_count is ≥ 3 for TEMPORARY_OFFICE_SPACE.
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
class TemporaryOfficeSpaceGateIntegrationTest {
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

        // ── Valid data payloads per structure type ────────────────────────────

        private val NEW_REQUIRED_JSON =
            """
            {
              "structure_type":           "NEW_REQUIRED",
              "location_description":     "Near station km 42+800, NR zone",
              "area_sqm":                 150,
              "estimated_cost":           2000000,
              "construction_start_date":  "2024-04-01",
              "construction_end_date":    "2024-10-31",
              "contractor_name":          "ABC Constructions Pvt Ltd"
            }
            """.trimIndent()

        private val OLD_AVAILABLE_JSON =
            """
            {
              "structure_type":       "OLD_AVAILABLE",
              "location_description": "Rest House Block B, km 44+200",
              "area_sqm":             90,
              "building_name":        "Railway Rest House Block B",
              "building_condition":   "GOOD"
            }
            """.trimIndent()

        private val HIRING_JSON =
            """
            {
              "structure_type":       "HIRING",
              "location_description": "Main Road, Nangal Township",
              "area_sqm":             80,
              "landlord_name":        "Ramesh Kumar",
              "monthly_rent":         25000,
              "lease_start_date":     "2024-06-01",
              "lease_end_date":       "2026-05-31"
            }
            """.trimIndent()
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

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

    /**
     * Creates a record pre-filled with [dataJson], submits, verifies, and
     * authenticates it. Returns the record ID.
     *
     * Used to drive all three structure-type branches through the workflow.
     */
    private fun fullWorkflowCycle(
        activityId: UUID,
        dataJson: String,
        dyce1: List<String>,
        dyce2: List<String>,
        ce: List<String>,
    ): UUID {
        // Create record
        val createResp =
            restTemplate.postForEntity(
                "/api/v1/activities/$activityId/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createResp.body!!
        val eTag = createResp.headers["ETag"]?.firstOrNull() ?: "\"${record.version}\""

        // Fill data
        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}",
                PatchActivityRecordRequest(dataJson = objectMapper.readTree(dataJson)),
                dyce1,
                eTag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)

        // Submit
        val submitResp =
            post(
                "/api/v1/activity-records/${record.id}/submit",
                WorkflowActionRequest(),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // Verify (Nodal)
        val verifyResp =
            post(
                "/api/v1/activity-records/${record.id}/verify",
                WorkflowActionRequest(),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // Authenticate (CE)
        val authResp =
            post(
                "/api/v1/activity-records/${record.id}/authenticate",
                WorkflowActionRequest(),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(authResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(authResp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")

        return record.id
    }

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-2 TOS gate — all three structure types flow through submit-verify-authenticate, dashboard shows count`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold ───────────────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "TOS Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
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
        val dyce2 = loginAs(DYCE_2_USER_ID)

        // ── Create TOS activity ────────────────────────────────────────────────
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(activityTypeCode = "TEMPORARY_OFFICE_SPACE", name = "Phase 2.2 TOS Gate Activity"),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        // ── Record 1: NEW_REQUIRED ─────────────────────────────────────────────
        fullWorkflowCycle(activity.id, NEW_REQUIRED_JSON, dyce1, dyce2, ce)

        // Dashboard after first record
        val dash1 =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val tosSummary1 = dash1.summaries.find { it.activityTypeCode == "TEMPORARY_OFFICE_SPACE" }
        assertThat(tosSummary1)
            .`as`("Dashboard must have a TEMPORARY_OFFICE_SPACE summary after first record")
            .isNotNull
        assertThat(tosSummary1!!.authenticatedCount)
            .`as`("authenticated_count must be ≥ 1 after NEW_REQUIRED record authenticated")
            .isGreaterThanOrEqualTo(1)

        // ── Record 2: OLD_AVAILABLE ────────────────────────────────────────────
        fullWorkflowCycle(activity.id, OLD_AVAILABLE_JSON, dyce1, dyce2, ce)

        // ── Record 3: HIRING ──────────────────────────────────────────────────
        fullWorkflowCycle(activity.id, HIRING_JSON, dyce1, dyce2, ce)

        // ── Final dashboard: all three authenticated ───────────────────────────
        val dashFinal =
            get(
                "/api/v1/dashboard/projects/${project.id}",
                ce,
                ProjectDashboardDto::class.java,
            ).body!!
        val tosSummaryFinal = dashFinal.summaries.find { it.activityTypeCode == "TEMPORARY_OFFICE_SPACE" }
        assertThat(tosSummaryFinal!!.authenticatedCount)
            .`as`("authenticated_count must be ≥ 3 after all three structure types authenticated")
            .isGreaterThanOrEqualTo(3)
    }
}
