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
 * Phase 2.4 form validation gate test (phasing.md § 2.4).
 *
 * Gate assertions:
 *   1. FOREST_CLEARANCE_V1 has exactly 3 section codes: stage_i, stage_ii, post_approval.
 *   2. Creating a record creates exactly 3 SECTION_STANDARD_V1 workflow instances.
 *   3. forest_division_name is required (missing → validation error).
 *   4. forest_area_hectares is required (missing → validation error).
 *   5. Valid minimal data (top-level fields only, no stage sub-fields) passes.
 *   6. queries[] items require submitted_on.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class ForestClearanceFormIntegrationTest {
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

    private fun validate(json: String): List<String> =
        formDefinitionService.validate("FOREST_CLEARANCE_V1", objectMapper.readTree(json))

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "FC Form Test ${UUID.randomUUID()}", zoneId = nrZoneId),
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

    // ── Gate 1: form definition has 3 section codes ───────────────────────────

    @Test
    fun `FOREST_CLEARANCE_V1 form definition has exactly 3 section codes`() {
        val formDef = formDefinitionService.getLatestActive("FOREST_CLEARANCE_V1")
        assertThat(formDef.sectionCodes.toList())
            .`as`("Forest Clearance must have exactly 3 stage section codes")
            .containsExactly("stage_i", "stage_ii", "post_approval")
    }

    // ── Gate 2: creates exactly 3 SECTION_STANDARD_V1 instances ──────────────

    @Test
    fun `creating a Forest Clearance record creates exactly 3 SECTION_STANDARD_V1 workflow instances`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "FOREST_CLEARANCE", name = "FC WF Instance Test"),
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
                  AND wd.code = 'SECTION_STANDARD_V1'
                """.trimIndent(),
                Long::class.java,
                recordId,
            )!!
        assertThat(instanceCount)
            .`as`("Forest Clearance must create exactly 3 SECTION_STANDARD_V1 workflow instances")
            .isEqualTo(3L)
    }

    // ── Gate 3: forest_division_name is required ──────────────────────────────

    @Test
    fun `schema rejects data missing forest_division_name`() {
        val errors =
            validate(
                """
                {
                  "forest_area_hectares":   12.5,
                  "project_chainage_from":  "42+000",
                  "project_chainage_to":    "42+800"
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("forest_division_name")
    }

    // ── Gate 4: forest_area_hectares is required ──────────────────────────────

    @Test
    fun `schema rejects data missing forest_area_hectares`() {
        val errors =
            validate(
                """
                {
                  "forest_division_name":  "NR Division — Hapur",
                  "project_chainage_from": "42+000",
                  "project_chainage_to":   "42+800"
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("forest_area_hectares")
    }

    // ── Gate 5: valid minimal data passes ────────────────────────────────────

    @Test
    fun `valid minimal data with all required top-level fields passes validation`() {
        val errors =
            validate(
                """
                {
                  "forest_division_name":  "NR Division — Hapur",
                  "forest_area_hectares":  12.5,
                  "project_chainage_from": "42+000",
                  "project_chainage_to":   "42+800"
                }
                """.trimIndent(),
            )
        assertThat(errors).isEmpty()
    }

    // ── Gate 6: queries[] items require submitted_on ──────────────────────────

    @Test
    fun `queries array item without submitted_on fails validation`() {
        val errors =
            validate(
                """
                {
                  "forest_division_name":  "NR Division — Hapur",
                  "forest_area_hectares":  12.5,
                  "project_chainage_from": "42+000",
                  "project_chainage_to":   "42+800",
                  "stage_i": {
                    "queries": [
                      { "returned_on": "2025-06-01", "remark": "Missing submitted_on" }
                    ]
                  }
                }
                """.trimIndent(),
            )
        assertThat(errors).isNotEmpty
        assertThat(errors.joinToString()).contains("submitted_on")
    }
}
