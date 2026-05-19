package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.api.SelectUserRequest
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
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

/**
 * Integration tests for [FormDefinitionController] + [FormDefinitionService].
 *
 * Gate requirement (phasing.md § 1.5):
 *   "A seeded form_definitions row roundtrips through GET, valid data → 200,
 *    invalid data (missing required field) → 422 with structured error list."
 *
 * Uses seed user EMP006 (ADMIN → ROLE_ADMIN → FORM_DEFINITION.READ).
 * FORM_DEFINITION.READ is restricted to ROLE_ADMIN / ROLE_SUPER_ADMIN.
 *
 * Session management: [TestRestTemplate] does not carry cookies automatically —
 * each test extracts [selectUserCookies] and passes them via [Cookie] header,
 * matching the pattern used in [PermissionGateIntegrationTest].
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class FormDefinitionIntegrationTest {
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
            // application.yml defines a separate spring.flyway.url — must override too
            registry.add("spring.flyway.url", postgres::getJdbcUrl)
            registry.add("spring.flyway.user", postgres::getUsername)
            registry.add("spring.flyway.password", postgres::getPassword)
        }

        /**
         * EMP006 — Admin User, ADMIN designation → ROLE_ADMIN → FORM_DEFINITION.READ.
         *
         * Note: EDGS_CI (EMP001) does NOT have FORM_DEFINITION.READ — that permission
         * is restricted to ROLE_ADMIN and ROLE_SUPER_ADMIN per V001_007.
         */
        val ADMIN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111106")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    // ── Session helpers ───────────────────────────────────────────────────────

    /** Logs in as [userId] and returns the session cookies for subsequent requests. */
    private fun selectUserCookies(userId: UUID): List<String> {
        val response =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(userId),
                Void::class.java,
            )
        return response.headers["Set-Cookie"] ?: emptyList()
    }

    private fun get(
        path: String,
        cookies: List<String>,
    ): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        return restTemplate.exchange(path, HttpMethod.GET, HttpEntity<Void>(headers), String::class.java)
    }

    private fun postJson(
        path: String,
        body: String,
        cookies: List<String>,
    ): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        headers.contentType = MediaType.APPLICATION_JSON
        headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        return restTemplate.exchange(path, HttpMethod.POST, HttpEntity(body, headers), String::class.java)
    }

    // ── GET /api/v1/form-definitions ─────────────────────────────────────────

    @Test
    fun `list returns the seeded LAND_ACQUISITION_V1 form definition`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val response = get("/api/v1/form-definitions", cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)

        val items = objectMapper.readTree(response.body!!)
        assertThat(items.isArray).isTrue()

        val land = items.firstOrNull { it.path("code").asText() == "LAND_ACQUISITION_V1" }
        assertThat(land).`as`("Expected LAND_ACQUISITION_V1 in list").isNotNull

        assertThat(land!!.path("version").asInt()).isEqualTo(1)
        assertThat(land.path("activityTypeCode").asText()).isEqualTo("LAND_ACQUISITION")
        assertThat(land.path("isActive").asBoolean()).isTrue()
        // Summary must NOT include schemaJson
        assertThat(land.has("schemaJson")).isFalse()
    }

    // ── GET /api/v1/form-definitions/{code} ──────────────────────────────────

    @Test
    fun `get returns full detail including required fields in schema`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val response = get("/api/v1/form-definitions/LAND_ACQUISITION_V1", cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)

        val body = objectMapper.readTree(response.body!!)
        assertThat(body.path("code").asText()).isEqualTo("LAND_ACQUISITION_V1")
        assertThat(body.path("version").asInt()).isEqualTo(1)
        assertThat(body.path("activityTypeCode").asText()).isEqualTo("LAND_ACQUISITION")
        assertThat(body.path("isActive").asBoolean()).isTrue()

        // schemaJson must be present and contain the required array
        val schema = body.path("schemaJson")
        assertThat(schema.isMissingNode).isFalse()
        val required = schema.path("required").map { it.asText() }
        assertThat(required).contains("village_name", "village_chainage_from", "village_chainage_to")
    }

    @Test
    fun `get returns 404 for unknown form definition code`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val response = get("/api/v1/form-definitions/DOES_NOT_EXIST", cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }

    // ── POST /api/v1/form-definitions/{code}/validate ────────────────────────

    @Test
    fun `validate returns 200 for fully valid land acquisition data`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val validData =
            """
            {
                "village_name": "Rampur",
                "village_chainage_from": "102+500",
                "village_chainage_to": "103+200",
                "district": "Agra",
                "area_hectares_total": 12.5
            }
            """.trimIndent()

        val response = postJson("/api/v1/form-definitions/LAND_ACQUISITION_V1/validate", validData, cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val body = objectMapper.readTree(response.body!!)
        assertThat(body.path("valid").asBoolean()).isTrue()
        assertThat(body.path("errors").size()).isEqualTo(0)
    }

    @Test
    fun `validate returns 200 for valid data with only required fields`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val minimalData =
            """
            {
                "village_name": "Noorpur",
                "village_chainage_from": "10+000",
                "village_chainage_to": "10+500"
            }
            """.trimIndent()

        val response = postJson("/api/v1/form-definitions/LAND_ACQUISITION_V1/validate", minimalData, cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val body = objectMapper.readTree(response.body!!)
        assertThat(body.path("valid").asBoolean()).isTrue()
    }

    @Test
    fun `validate returns 422 when required village_name is missing`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        // village_name intentionally omitted — it's in the required array
        val missingRequired =
            """
            {
                "village_chainage_from": "102+500",
                "village_chainage_to": "103+200"
            }
            """.trimIndent()

        val response = postJson("/api/v1/form-definitions/LAND_ACQUISITION_V1/validate", missingRequired, cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        val body = objectMapper.readTree(response.body!!)
        assertThat(body.path("valid").asBoolean()).isFalse()
        val errors = body.path("errors")
        assertThat(errors.isArray).isTrue()
        assertThat(errors.size()).isGreaterThan(0)
        val errorTexts = errors.map { it.asText() }
        assertThat(errorTexts.any { it.contains("village_name") })
            .`as`("Expected an error mentioning 'village_name', got: $errorTexts")
            .isTrue()
    }

    @Test
    fun `validate returns 422 when additional properties are present`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        // The seeded schema has additionalProperties: false
        val withExtra =
            """
            {
                "village_name": "Rampur",
                "village_chainage_from": "102+500",
                "village_chainage_to": "103+200",
                "unexpected_field": "should be rejected"
            }
            """.trimIndent()

        val response = postJson("/api/v1/form-definitions/LAND_ACQUISITION_V1/validate", withExtra, cookies)

        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
        val body = objectMapper.readTree(response.body!!)
        assertThat(body.path("valid").asBoolean()).isFalse()
        assertThat(body.path("errors").size()).isGreaterThan(0)
    }

    @Test
    fun `validate returns 404 for unknown form definition code`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val response = postJson("/api/v1/form-definitions/NO_SUCH_FORM/validate", """{"field":"value"}""", cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }
}
