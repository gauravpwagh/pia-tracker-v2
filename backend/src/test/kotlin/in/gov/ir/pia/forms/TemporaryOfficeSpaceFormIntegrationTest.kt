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
 * Phase 2.2 form validation gate test (phasing.md § 2.2).
 *
 * Gate: "All three structure types (NEW_REQUIRED, OLD_AVAILABLE, HIRING)
 *        render their conditional fields. Records flow through workflow."
 *
 * Assertions:
 *   1. TEMPORARY_OFFICE_SPACE_V1 has 0 section codes (flat record).
 *   2. Creating a record produces exactly 1 RECORD_STANDARD_V1 instance.
 *   3. structure_type is required — data without it fails.
 *   4. location_description is required — data without it fails.
 *   5. NEW_REQUIRED: missing estimated_cost / construction dates fails.
 *   6. NEW_REQUIRED: all required fields present → passes.
 *   7. OLD_AVAILABLE: missing building_name / building_condition fails.
 *   8. OLD_AVAILABLE: all required fields present → passes.
 *   9. HIRING: missing landlord_name / monthly_rent / lease dates fails.
 *  10. HIRING: all required fields present → passes.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class TemporaryOfficeSpaceFormIntegrationTest {
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

    // ── Session helpers ───────────────────────────────────────────────────────

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
        formDefinitionService.validate(
            "TEMPORARY_OFFICE_SPACE_V1",
            objectMapper.readTree(json),
        )

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "TOS Form Test ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!.id
        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
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
    fun `TEMPORARY_OFFICE_SPACE_V1 form definition has no section codes — flat record`() {
        val formDef = formDefinitionService.getLatestActive("TEMPORARY_OFFICE_SPACE_V1")
        assertThat(formDef.sectionCodes.toList())
            .`as`("Temporary Office Space must be a flat record — no section codes")
            .isEmpty()
    }

    // ── Gate 2: creating a record creates exactly 1 RECORD_STANDARD_V1 instance ─

    @Test
    fun `creating a TOS record creates exactly 1 RECORD_STANDARD_V1 workflow instance`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "TEMPORARY_OFFICE_SPACE", name = "TOS Gate Activity"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        val record =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(),
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
            .`as`("TOS must create exactly 1 RECORD_STANDARD_V1 workflow instance")
            .isEqualTo(1L)

        val sectionCode =
            jdbc.queryForObject(
                "SELECT section_code FROM workflow_instances WHERE entity_type = 'ACTIVITY_RECORD' AND entity_id = ?",
                String::class.java,
                recordId,
            )
        assertThat(sectionCode)
            .`as`("RECORD_STANDARD_V1 instance must have no section_code")
            .isNull()
    }

    // ── Gate 3: structure_type is required ────────────────────────────────────

    @Test
    fun `schema rejects data missing structure_type`() {
        val errors = validate("""{"location_description": "Near station km 42"}""")
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("structure_type")
    }

    // ── Gate 4: location_description is required ──────────────────────────────

    @Test
    fun `schema rejects data missing location_description`() {
        val errors = validate("""{"structure_type": "HIRING"}""")
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("location_description")
    }

    // ── Gate 5: NEW_REQUIRED — missing conditional fields fails ──────────────

    @Test
    fun `NEW_REQUIRED without construction fields fails validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":        "NEW_REQUIRED",
                  "location_description":  "Near station km 42"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("NEW_REQUIRED without required construction fields must fail")
            .isNotEmpty
        val joined = errors.joinToString()
        assertThat(joined).contains("estimated_cost")
        assertThat(joined).contains("construction_start_date")
        assertThat(joined).contains("construction_end_date")
    }

    // ── Gate 6: NEW_REQUIRED — all required fields pass ───────────────────────

    @Test
    fun `NEW_REQUIRED with all required construction fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":           "NEW_REQUIRED",
                  "location_description":     "Near station km 42",
                  "area_sqm":                 120,
                  "estimated_cost":           1500000,
                  "construction_start_date":  "2024-04-01",
                  "construction_end_date":    "2024-09-30",
                  "contractor_name":          "ABC Constructions Pvt Ltd"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("NEW_REQUIRED with all required fields must pass validation")
            .isEmpty()
    }

    // ── Gate 7: OLD_AVAILABLE — missing conditional fields fails ─────────────

    @Test
    fun `OLD_AVAILABLE without building fields fails validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":       "OLD_AVAILABLE",
                  "location_description": "Near station km 42"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("OLD_AVAILABLE without building_name / condition must fail")
            .isNotEmpty
        val joined = errors.joinToString()
        assertThat(joined).contains("building_name")
        assertThat(joined).contains("building_condition")
    }

    // ── Gate 8: OLD_AVAILABLE — all required fields pass ─────────────────────

    @Test
    fun `OLD_AVAILABLE with all required building fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":       "OLD_AVAILABLE",
                  "location_description": "Near station km 42",
                  "building_name":        "Rest House Block B",
                  "building_condition":   "FAIR"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("OLD_AVAILABLE with all required fields must pass validation")
            .isEmpty()
    }

    // ── Gate 9: HIRING — missing conditional fields fails ────────────────────

    @Test
    fun `HIRING without lease fields fails validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":       "HIRING",
                  "location_description": "Near station km 42"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("HIRING without landlord / rent / lease dates must fail")
            .isNotEmpty
        val joined = errors.joinToString()
        assertThat(joined).contains("landlord_name")
        assertThat(joined).contains("monthly_rent")
        assertThat(joined).contains("lease_start_date")
        assertThat(joined).contains("lease_end_date")
    }

    // ── Gate 10: HIRING — all required fields pass ────────────────────────────

    @Test
    fun `HIRING with all required lease fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "structure_type":       "HIRING",
                  "location_description": "Near station km 42",
                  "area_sqm":             80,
                  "landlord_name":        "Ramesh Kumar",
                  "monthly_rent":         25000,
                  "lease_start_date":     "2024-06-01",
                  "lease_end_date":       "2026-05-31"
                }
                """.trimIndent(),
            )
        assertThat(errors)
            .`as`("HIRING with all required fields must pass validation")
            .isEmpty()
    }
}
