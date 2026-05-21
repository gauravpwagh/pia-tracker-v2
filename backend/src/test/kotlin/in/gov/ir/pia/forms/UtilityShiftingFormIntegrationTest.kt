package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.form.FormDefinitionService
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
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
 * Phase 2.3 form validation gate test (phasing.md § 2.3).
 *
 * Gate assertions:
 *   1. UTILITY_SHIFTING_V1 has 0 section codes (flat record).
 *   2. Creating a record with recordSubtype stores it on the record.
 *   3. Creating a record produces exactly 1 RECORD_STANDARD_V1 instance.
 *   4. utility_type and location fields are required.
 *   5. OVERHEAD_LINE: missing pole_count fails; with it, passes.
 *   6. WATER_PIPELINE: missing pipe_diameter_mm / length_m fails; with them, passes.
 *   7. NALA: missing nala_width_m / nala_length_m fails; with them, passes.
 *   8. List records filtered by subtype returns only matching records.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class UtilityShiftingFormIntegrationTest {
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
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    @Autowired lateinit var formDefinitionService: FormDefinitionService

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
        extra: Map<String, String> = emptyMap(),
    ): HttpHeaders {
        val h = HttpHeaders()
        if (cookies.isNotEmpty()) h["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        extra.forEach { (k, v) -> h[k] = v }
        return h
    }

    private fun <T> post(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun validate(json: String): List<String> =
        formDefinitionService.validate("UTILITY_SHIFTING_V1", objectMapper.readTree(json))

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "US Form Test ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!.id
        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/allocate",
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
            cao,
            ProjectDetailResponse::class.java,
        )
        val ce = loginAs(CE_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)),
            ce,
            ProjectDetailResponse::class.java,
        )
        return projectId
    }

    // ── Gate 1: form definition has 0 section codes ───────────────────────────

    @Test
    fun `UTILITY_SHIFTING_V1 form definition has no section codes — flat record`() {
        val formDef = formDefinitionService.getLatestActive("UTILITY_SHIFTING_V1")
        assertThat(formDef.sectionCodes.toList())
            .`as`("Utility Shifting must be a flat record — no section codes")
            .isEmpty()
    }

    // ── Gate 2: recordSubtype is stored on the record ─────────────────────────

    @Test
    fun `record_subtype set at creation is stored on the activity record`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "UTILITY_SHIFTING", name = "US Subtype Test"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        val record =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(recordSubtype = "OVERHEAD_LINE"),
                dyce,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(record.statusCode).isEqualTo(HttpStatus.CREATED)
        val recordId = record.body!!.id

        val storedSubtype =
            jdbc.queryForObject(
                "SELECT record_subtype FROM activity_records WHERE id = ?",
                String::class.java,
                recordId,
            )
        assertThat(storedSubtype)
            .`as`("record_subtype passed at creation must be persisted")
            .isEqualTo("OVERHEAD_LINE")
    }

    // ── Gate 3: creates exactly 1 RECORD_STANDARD_V1 instance ────────────────

    @Test
    fun `creating a Utility Shifting record creates exactly 1 RECORD_STANDARD_V1 workflow instance`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "UTILITY_SHIFTING", name = "US WF Test"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        val record =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(recordSubtype = "WATER_PIPELINE"),
                dyce,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(record.statusCode).isEqualTo(HttpStatus.CREATED)
        val recordId = record.body!!.id

        val instanceCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM workflow_instances wi
                JOIN workflow_definitions wd ON wd.id = wi.workflow_definition_id
                WHERE wi.entity_type = 'ACTIVITY_RECORD'
                  AND wi.entity_id = ?
                  AND wd.code = 'RECORD_STANDARD_V1'
                """.trimIndent(),
                Long::class.java,
                recordId,
            )!!
        assertThat(instanceCount)
            .`as`("Utility Shifting must create exactly 1 RECORD_STANDARD_V1 workflow instance")
            .isEqualTo(1L)
    }

    // ── Gate 4: required fields ───────────────────────────────────────────────

    @Test
    fun `schema rejects data missing utility_type`() {
        val errors =
            validate(
                """{"location_description": "km 42", "chainage_from": "42+000", "chainage_to": "42+500"}""",
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("utility_type")
    }

    @Test
    fun `schema rejects data missing location_description`() {
        val errors =
            validate(
                """{"utility_type": "NALA", "chainage_from": "42+000", "chainage_to": "42+500"}""",
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("location_description")
    }

    // ── Gate 5: OVERHEAD_LINE conditional ────────────────────────────────────

    @Test
    fun `OVERHEAD_LINE without pole_count fails validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "OVERHEAD_LINE",
                  "location_description": "Near km 42+200",
                  "chainage_from":        "42+000",
                  "chainage_to":          "42+500"
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("pole_count")
    }

    @Test
    fun `OVERHEAD_LINE with pole_count passes validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "OVERHEAD_LINE",
                  "location_description": "Near km 42+200",
                  "chainage_from":        "42+000",
                  "chainage_to":          "42+500",
                  "pole_count":           12,
                  "agency_name":          "BSNL"
                }
                """.trimIndent(),
            )
        assertThat(errors).isEmpty()
    }

    // ── Gate 6: WATER_PIPELINE conditional ───────────────────────────────────

    @Test
    fun `WATER_PIPELINE without pipe_diameter_mm and length_m fails validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "WATER_PIPELINE",
                  "location_description": "Near km 44+100",
                  "chainage_from":        "44+000",
                  "chainage_to":          "44+500"
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        val joined = errors.joinToString()
        assertThat(joined).contains("pipe_diameter_mm")
        assertThat(joined).contains("length_m")
    }

    @Test
    fun `WATER_PIPELINE with required fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "WATER_PIPELINE",
                  "location_description": "Near km 44+100",
                  "chainage_from":        "44+000",
                  "chainage_to":          "44+500",
                  "pipe_diameter_mm":     150,
                  "length_m":             320
                }
                """.trimIndent(),
            )
        assertThat(errors).isEmpty()
    }

    // ── Gate 7: NALA conditional ──────────────────────────────────────────────

    @Test
    fun `NALA without nala dimensions fails validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "NALA",
                  "location_description": "Near km 46+300",
                  "chainage_from":        "46+000",
                  "chainage_to":          "46+800"
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        val joined = errors.joinToString()
        assertThat(joined).contains("nala_width_m")
        assertThat(joined).contains("nala_length_m")
    }

    @Test
    fun `NALA with required fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "utility_type":         "NALA",
                  "location_description": "Near km 46+300",
                  "chainage_from":        "46+000",
                  "chainage_to":          "46+800",
                  "nala_width_m":         3.5,
                  "nala_length_m":        250
                }
                """.trimIndent(),
            )
        assertThat(errors).isEmpty()
    }

    // ── Gate 8: subtype filter on list endpoint ───────────────────────────────

    @Test
    fun `list records filtered by subtype returns only matching records`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "UTILITY_SHIFTING", name = "US Filter Test"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        // Create one OVERHEAD_LINE record and one WATER_PIPELINE record
        post(
            "/api/v1/activities/$activityId/records",
            CreateActivityRecordRequest(recordSubtype = "OVERHEAD_LINE"),
            dyce,
            ActivityRecordDetailResponse::class.java,
        )
        post(
            "/api/v1/activities/$activityId/records",
            CreateActivityRecordRequest(recordSubtype = "WATER_PIPELINE"),
            dyce,
            ActivityRecordDetailResponse::class.java,
        )

        // Unfiltered list returns 2 records
        val allRecords =
            restTemplate
                .exchange(
                    "/api/v1/activities/$activityId/records",
                    org.springframework.http.HttpMethod.GET,
                    HttpEntity<Void>(headersFor(dyce)),
                    Array<ActivityRecordDetailResponse>::class.java,
                ).body!!
        assertThat(allRecords).hasSize(2)

        // Filtered by OVERHEAD_LINE returns 1
        val ohtRecords =
            restTemplate
                .exchange(
                    "/api/v1/activities/$activityId/records?subtype=OVERHEAD_LINE",
                    org.springframework.http.HttpMethod.GET,
                    HttpEntity<Void>(headersFor(dyce)),
                    Array<ActivityRecordDetailResponse>::class.java,
                ).body!!
        assertThat(ohtRecords).hasSize(1)
        assertThat(ohtRecords[0].recordSubtype)
            .`as`("Filtered records must all have subtype OVERHEAD_LINE")
            .isEqualTo("OVERHEAD_LINE")

        // Filtered by WATER_PIPELINE returns 1
        val wpRecords =
            restTemplate
                .exchange(
                    "/api/v1/activities/$activityId/records?subtype=WATER_PIPELINE",
                    org.springframework.http.HttpMethod.GET,
                    HttpEntity<Void>(headersFor(dyce)),
                    Array<ActivityRecordDetailResponse>::class.java,
                ).body!!
        assertThat(wpRecords).hasSize(1)
        assertThat(wpRecords[0].recordSubtype).isEqualTo("WATER_PIPELINE")

        // Filtered by NALA (none created) returns empty
        val nalaRecords =
            restTemplate
                .exchange(
                    "/api/v1/activities/$activityId/records?subtype=NALA",
                    org.springframework.http.HttpMethod.GET,
                    HttpEntity<Void>(headersFor(dyce)),
                    Array<ActivityRecordDetailResponse>::class.java,
                ).body!!
        assertThat(nalaRecords).isEmpty()
    }
}
