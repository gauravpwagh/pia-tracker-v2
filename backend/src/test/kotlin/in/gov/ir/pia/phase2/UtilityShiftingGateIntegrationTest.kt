package `in`.gov.ir.pia.phase2

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.UtilitySubtypeBreakdownDto
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
 * Phase 2.3 Gate — Utility Shifting golden path (phasing.md § 2.3).
 *
 * Gate: "Creating records of each utility type works.
 *        Filter on the list works.
 *        Dashboard shows counts by type."
 *
 * Three utility types (OVERHEAD_LINE, WATER_PIPELINE, NALA) each get one record
 * authenticated. The utility-breakdown dashboard endpoint then shows
 * authenticated_count = 1 for each type.
 *
 * The list-filter gate is exercised by asserting that
 * GET /api/v1/activities/{id}/records?subtype=OVERHEAD_LINE only returns
 * OVERHEAD_LINE records.
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
class UtilityShiftingGateIntegrationTest {
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

        private val OHT_DATA_JSON =
            """
            {
              "utility_type":         "OVERHEAD_LINE",
              "location_description": "OHT diversion at km 42+200 to km 42+800",
              "chainage_from":        "42+200",
              "chainage_to":          "42+800",
              "pole_count":           8,
              "span_length_m":        60.0,
              "agency_name":          "BSNL NR Division"
            }
            """.trimIndent()

        private val WP_DATA_JSON =
            """
            {
              "utility_type":         "WATER_PIPELINE",
              "location_description": "Water pipeline diversion at km 44+100",
              "chainage_from":        "44+000",
              "chainage_to":          "44+600",
              "pipe_diameter_mm":     200,
              "length_m":             450,
              "agency_name":          "Municipal Water Board"
            }
            """.trimIndent()

        private val NALA_DATA_JSON =
            """
            {
              "utility_type":         "NALA",
              "location_description": "Nala diversion at km 46+300 to km 46+800",
              "chainage_from":        "46+300",
              "chainage_to":          "46+800",
              "nala_width_m":         4.5,
              "nala_length_m":        380,
              "revetment_type":       "Stone Pitching"
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
     * Creates a record with [subtype], fills it with [dataJson], then drives it
     * through submit → verify → authenticate. Returns the record ID.
     */
    private fun fullWorkflowCycle(
        activityId: UUID,
        subtype: String,
        dataJson: String,
        dyce1: List<String>,
        dyce2: List<String>,
        ce: List<String>,
    ): UUID {
        val createResp =
            restTemplate.postForEntity(
                "/api/v1/activities/$activityId/records",
                HttpEntity(CreateActivityRecordRequest(recordSubtype = subtype), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createResp.body!!
        val eTag = createResp.headers["ETag"]?.firstOrNull() ?: "\"${record.version}\""

        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}",
                PatchActivityRecordRequest(dataJson = objectMapper.readTree(dataJson)),
                dyce1,
                eTag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)

        val submitResp =
            post(
                "/api/v1/activity-records/${record.id}/submit",
                WorkflowActionRequest(),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        val verifyResp =
            post(
                "/api/v1/activity-records/${record.id}/verify",
                WorkflowActionRequest(),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

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
    fun `Phase 2-3 Utility Shifting gate — three utility types, subtype filter, dashboard breakdown`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold ───────────────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "US Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
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

        // ── Create Utility Shifting activity ───────────────────────────────────
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(activityTypeCode = "UTILITY_SHIFTING", name = "Phase 2.3 US Gate Activity"),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        // ── Gate: creating records of each utility type works ─────────────────
        val ohtRecordId = fullWorkflowCycle(activity.id, "OVERHEAD_LINE", OHT_DATA_JSON, dyce1, dyce2, ce)
        val wpRecordId = fullWorkflowCycle(activity.id, "WATER_PIPELINE", WP_DATA_JSON, dyce1, dyce2, ce)
        val nalaRecordId = fullWorkflowCycle(activity.id, "NALA", NALA_DATA_JSON, dyce1, dyce2, ce)

        // ── Gate: filter on the list works ────────────────────────────────────
        // Unfiltered: all 3
        val allRecords =
            get(
                "/api/v1/activities/${activity.id}/records",
                dyce1,
                Array<ActivityRecordDetailResponse>::class.java,
            ).body!!
        assertThat(allRecords).hasSize(3)

        // OVERHEAD_LINE filter: 1 record, correct ID
        val ohtRecords =
            get(
                "/api/v1/activities/${activity.id}/records?subtype=OVERHEAD_LINE",
                dyce1,
                Array<ActivityRecordDetailResponse>::class.java,
            ).body!!
        assertThat(ohtRecords).hasSize(1)
        assertThat(ohtRecords[0].id).isEqualTo(ohtRecordId)
        assertThat(ohtRecords[0].recordSubtype).isEqualTo("OVERHEAD_LINE")

        // WATER_PIPELINE filter: 1 record, correct ID
        val wpRecords =
            get(
                "/api/v1/activities/${activity.id}/records?subtype=WATER_PIPELINE",
                dyce1,
                Array<ActivityRecordDetailResponse>::class.java,
            ).body!!
        assertThat(wpRecords).hasSize(1)
        assertThat(wpRecords[0].id).isEqualTo(wpRecordId)

        // NALA filter: 1 record
        val nalaRecords =
            get(
                "/api/v1/activities/${activity.id}/records?subtype=NALA",
                dyce1,
                Array<ActivityRecordDetailResponse>::class.java,
            ).body!!
        assertThat(nalaRecords).hasSize(1)
        assertThat(nalaRecords[0].id).isEqualTo(nalaRecordId)

        // ── Gate: dashboard shows counts by type ──────────────────────────────
        val breakdown =
            get(
                "/api/v1/dashboard/projects/${project.id}/utility-breakdown",
                ce,
                UtilitySubtypeBreakdownDto::class.java,
            ).body!!

        assertThat(breakdown.subtypes)
            .`as`("Utility breakdown must include all three authenticated utility types")
            .hasSize(3)

        val ohtSummary = breakdown.subtypes.find { it.recordSubtype == "OVERHEAD_LINE" }
        assertThat(ohtSummary).isNotNull
        assertThat(ohtSummary!!.authenticatedCount)
            .`as`("OVERHEAD_LINE authenticated_count must be 1")
            .isEqualTo(1)

        val wpSummary = breakdown.subtypes.find { it.recordSubtype == "WATER_PIPELINE" }
        assertThat(wpSummary).isNotNull
        assertThat(wpSummary!!.authenticatedCount)
            .`as`("WATER_PIPELINE authenticated_count must be 1")
            .isEqualTo(1)

        val nalaSummary = breakdown.subtypes.find { it.recordSubtype == "NALA" }
        assertThat(nalaSummary).isNotNull
        assertThat(nalaSummary!!.authenticatedCount)
            .`as`("NALA authenticated_count must be 1")
            .isEqualTo(1)
    }
}
