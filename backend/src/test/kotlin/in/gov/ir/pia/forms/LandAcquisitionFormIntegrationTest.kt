package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.ObjectMapper
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
 * Phase 1.10 gate test (phasing.md § 1.10):
 *
 *   "Saving a Land Acquisition record creates 9 workflow_instances.
 *    JSON Schema validation catches a missing required field.
 *    Cross-field validator catches the 20A-before-20E case.
 *    All 9 sections render their fields correctly."
 *
 * Gate assertions:
 *   1. Creating a record on a LAND_ACQUISITION activity creates exactly
 *      9 workflow_instances (one per section).
 *   2. The form definition has 9 section_codes after the V007_001 migration.
 *   3. JSON Schema validation via POST /api/v1/form-definitions/{code}/validate
 *      returns 422 when village_name is missing.
 *   4. Cross-field validator returns an error when 20E date < 20A date.
 *   5. Valid data passes both schema and cross-field validation.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class LandAcquisitionFormIntegrationTest {
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

        /** ADMIN designation → ROLE_ADMIN → FORM_DEFINITION.READ */
        val ADMIN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111106")

        val EXPECTED_SECTION_CODES =
            listOf(
                "srp",
                "cala",
                "section_20a",
                "jmr",
                "section_20d",
                "section_20e",
                "section_20f_g",
                "section_20h_i",
                "mutation",
            )
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    @Autowired lateinit var formDefinitionService: FormDefinitionService

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

    // ── Full project lifecycle up to ACTIVE ───────────────────────────────────

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "LA Form Test Project", zoneId = nrZoneId),
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

    // ── Gate test 1: 9 section_codes in form definition ──────────────────────

    @Test
    fun `full form definition has 9 section codes after V007_001`() {
        val formDef = formDefinitionService.getLatestActive("LAND_ACQUISITION_V1")
        assertThat(formDef.sectionCodes.toList()).containsExactlyElementsOf(EXPECTED_SECTION_CODES)
    }

    // ── Gate test 2: creating a record spawns 9 workflow_instances ────────────

    @Test
    fun `creating a Land Acquisition record creates 9 section workflow instances`() {
        val projectId = createActiveProject()
        val dyce = loginAs(DYCE_1_USER_ID)

        // Create activity
        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "LAND_ACQUISITION", name = "9-Section LA"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        // Create record
        val record =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(),
                dyce,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(record.statusCode).isEqualTo(HttpStatus.CREATED)
        val recordId = record.body!!.id

        // Verify exactly 9 SECTION_STANDARD_V1 workflow instances exist
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
        assertThat(instanceCount).isEqualTo(9L)

        // Verify each expected section code has an instance
        val sectionCodes =
            jdbc.queryForList(
                """
                SELECT section_code FROM workflow_instances
                WHERE entity_type = 'ACTIVITY_RECORD' AND entity_id = ?
                ORDER BY section_code
                """.trimIndent(),
                String::class.java,
                recordId,
            )
        assertThat(sectionCodes).containsExactlyInAnyOrderElementsOf(EXPECTED_SECTION_CODES)

        // All instances start in DRAFT
        val draftCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM workflow_instances wi
                JOIN workflow_states ws ON ws.id = wi.current_state_id
                WHERE wi.entity_id = ? AND ws.code = 'DRAFT'
                """.trimIndent(),
                Long::class.java,
                recordId,
            )!!
        assertThat(draftCount).isEqualTo(9L)
    }

    // ── Gate test 3: JSON Schema catches missing required field ───────────────

    @Test
    fun `JSON Schema validation rejects data missing village_name`() {
        // POST /api/v1/form-definitions/LAND_ACQUISITION_V1/validate
        // with data that has chainage fields but no village_name
        val superAdminCookies = loginAs(ADMIN_USER_ID) // ROLE_ADMIN has FORM_DEFINITION.READ

        val badData =
            objectMapper.readTree(
                """
                {
                  "village_chainage_from": "42+500",
                  "village_chainage_to":   "43+000"
                }
                """.trimIndent(),
            )
        val resp =
            restTemplate.postForEntity(
                "/api/v1/form-definitions/LAND_ACQUISITION_V1/validate",
                HttpEntity(badData, headersFor(superAdminCookies)),
                String::class.java,
            )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        assertThat(resp.body).contains("village_name")
    }

    // ── Gate test 4: Cross-field validator catches 20A-before-20E ────────────

    @Test
    fun `cross-field validator rejects 20E date before 20A notification date`() {
        val formDef = formDefinitionService.getLatestActive("LAND_ACQUISITION_V1")

        val data =
            objectMapper.readTree(
                """
                {
                  "village_name":          "Raipur",
                  "village_chainage_from": "42+500",
                  "village_chainage_to":   "43+000",
                  "section_20a": {
                    "notification_date": "2024-06-01"
                  },
                  "section_20e": {
                    "declaration_gazette": {
                      "published_on": "2024-05-01"
                    }
                  }
                }
                """.trimIndent(),
            )

        val errors = formDefinitionService.validateCrossField(formDef, data)
        assertThat(errors).hasSize(1)
        assertThat(errors[0].field).isEqualTo("section_20e.declaration_gazette.published_on")
        assertThat(errors[0].message).contains("20E declaration date")
        assertThat(errors[0].message).contains("20A notification date")
    }

    // ── Gate test 5: Valid data passes both validations ───────────────────────

    @Test
    fun `valid data passes JSON Schema and cross-field validation`() {
        val formDef = formDefinitionService.getLatestActive("LAND_ACQUISITION_V1")

        val data =
            objectMapper.readTree(
                """
                {
                  "village_name":          "Raipur",
                  "village_chainage_from": "42+500",
                  "village_chainage_to":   "43+000",
                  "district":              "Ambala",
                  "section_20a": {
                    "notification_date": "2024-03-01"
                  },
                  "section_20e": {
                    "declaration_gazette": {
                      "published_on": "2024-06-15"
                    }
                  }
                }
                """.trimIndent(),
            )

        // JSON Schema passes (no strict required on section fields for partial data)
        val schemaErrors = formDefinitionService.validate("LAND_ACQUISITION_V1", data)
        assertThat(schemaErrors).isEmpty()

        // Cross-field passes (20E date >= 20A date)
        val crossErrors = formDefinitionService.validateCrossField(formDef, data)
        assertThat(crossErrors).isEmpty()
    }

    // ── Gate test 6: Cross-field validator passes when dates are equal ────────

    @Test
    fun `cross-field validator passes when 20E date equals 20A notification date`() {
        val formDef = formDefinitionService.getLatestActive("LAND_ACQUISITION_V1")

        val data =
            objectMapper.readTree(
                """
                {
                  "village_name":          "Raipur",
                  "village_chainage_from": "42+500",
                  "village_chainage_to":   "43+000",
                  "section_20a": {
                    "notification_date": "2024-06-01"
                  },
                  "section_20e": {
                    "declaration_gazette": {
                      "published_on": "2024-06-01"
                    }
                  }
                }
                """.trimIndent(),
            )
        val errors = formDefinitionService.validateCrossField(formDef, data)
        assertThat(errors).isEmpty()
    }
}
