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
 * Phase 2.1 form validation gate test (phasing.md § 2.1).
 *
 * Gate assertions:
 *   1. TENDER_PACKAGING_V1 form definition has 0 section codes (flat record).
 *   2. Creating a Tender Packaging record creates exactly 1 workflow_instance
 *      (RECORD_STANDARD_V1, no section discriminator).
 *   3. JSON Schema validation via POST /api/v1/form-definitions/{code}/validate
 *      returns 422 when package_name is missing.
 *   4. Valid minimal data (package_name + scope_description) passes schema validation.
 *   5. Conditional: data with tender_finalized=true but no tender_finalization_date
 *      is rejected by schema validation.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class TenderPackagingFormIntegrationTest {
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

        /** ADMIN designation → ROLE_ADMIN → FORM_DEFINITION.READ (for validate endpoint). */
        val ADMIN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111106")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    @Autowired lateinit var formDefinitionService: FormDefinitionService

    /** MinIO not available in CI — mock so the context starts. */
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
    ) =
        restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "TP Form Test ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!.id
        val cao = loginAs(CAO_C_USER_ID)
        post("/api/v1/projects/$projectId/allocate", AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)), cao, ProjectDetailResponse::class.java)
        val ce = loginAs(CE_C_USER_ID)
        post("/api/v1/projects/$projectId/assign-dyce", AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)), ce, ProjectDetailResponse::class.java)
        return projectId
    }

    // ── Gate 1: form definition has 0 section codes ───────────────────────────

    @Test
    fun `TENDER_PACKAGING_V1 form definition has no section codes — flat record`() {
        val formDef = formDefinitionService.getLatestActive("TENDER_PACKAGING_V1")
        assertThat(formDef.sectionCodes.toList())
            .`as`("Tender Packaging must be a flat record — no section codes")
            .isEmpty()
    }

    // ── Gate 2: creating a record creates exactly 1 RECORD_STANDARD_V1 instance ─

    @Test
    fun `creating a Tender Packaging record creates exactly 1 RECORD_STANDARD_V1 workflow instance`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "TENDER_PACKAGING", name = "TP Gate Activity"),
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

        // Must have exactly 1 RECORD_STANDARD_V1 instance with no sectionCode
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
            .`as`("Tender Packaging must create exactly 1 RECORD_STANDARD_V1 workflow instance")
            .isEqualTo(1L)

        // The single instance has no section_code discriminator
        val sectionCode =
            jdbc.queryForObject(
                "SELECT section_code FROM workflow_instances WHERE entity_type = 'ACTIVITY_RECORD' AND entity_id = ?",
                String::class.java,
                recordId,
            )
        assertThat(sectionCode)
            .`as`("RECORD_STANDARD_V1 instance must have no section_code")
            .isNull()

        // Starts in DRAFT
        val stateCode =
            jdbc.queryForObject(
                """
                SELECT ws.code FROM workflow_instances wi
                JOIN workflow_states ws ON ws.id = wi.current_state_id
                WHERE wi.entity_type = 'ACTIVITY_RECORD' AND wi.entity_id = ?
                """.trimIndent(),
                String::class.java,
                recordId,
            )!!
        assertThat(stateCode).isEqualTo("DRAFT")
    }

    // ── Gate 3: JSON Schema rejects missing package_name ─────────────────────

    @Test
    fun `JSON Schema validation rejects data missing package_name`() {
        val admin = loginAs(ADMIN_USER_ID)
        val badData =
            objectMapper.readTree(
                """{"scope_description": "Build a tender package"}""",
            )
        val resp =
            restTemplate.postForEntity(
                "/api/v1/form-definitions/TENDER_PACKAGING_V1/validate",
                HttpEntity(badData, headersFor(admin)),
                String::class.java,
            )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        assertThat(resp.body).contains("package_name")
    }

    // ── Gate 4: valid minimal data passes schema validation ───────────────────

    @Test
    fun `valid minimal data passes JSON Schema validation`() {
        val errors =
            formDefinitionService.validate(
                "TENDER_PACKAGING_V1",
                objectMapper.readTree(
                    """
                    {
                      "package_name":      "Section A — Earthworks Package",
                      "scope_description": "Earthworks and embankment for km 42 to km 58"
                    }
                    """.trimIndent(),
                ),
            )
        assertThat(errors)
            .`as`("Valid minimal data must pass schema validation")
            .isEmpty()
    }

    // ── Gate 5: conditional — tender_finalized=true requires finalization date ─

    @Test
    fun `JSON Schema rejects tender_finalized=true without tender_finalization_date`() {
        // When tender_finalized=true the schema's if/then fires and makes
        // tender_finalization_date required. We assert that errors is non-empty
        // and that at least one message references the date field.
        // (The exact networknt message format is "$.field: is missing but it is required".)
        val errors =
            formDefinitionService.validate(
                "TENDER_PACKAGING_V1",
                objectMapper.readTree(
                    """
                    {
                      "package_name":      "Section B — Bridges Package",
                      "scope_description": "Construction of minor bridges",
                      "tender_finalized":  true
                    }
                    """.trimIndent(),
                ),
            )
        assertThat(errors)
            .`as`("tender_finalized=true without tender_finalization_date must produce schema errors")
            .isNotEmpty
        assertThat(errors.joinToString())
            .`as`("error must reference tender_finalization_date")
            .contains("tender_finalization_date")
    }

    // ── Gate 6: conditional passes when finalization date is provided ─────────

    @Test
    fun `JSON Schema passes when tender_finalized=true and finalization date is provided`() {
        val errors =
            formDefinitionService.validate(
                "TENDER_PACKAGING_V1",
                objectMapper.readTree(
                    """
                    {
                      "package_name":             "Section B — Bridges Package",
                      "scope_description":        "Construction of minor bridges",
                      "tender_finalized":         true,
                      "tender_finalization_date": "2024-09-01"
                    }
                    """.trimIndent(),
                ),
            )
        assertThat(errors)
            .`as`("tender_finalized=true with date provided must pass validation")
            .isEmpty()
    }
}
