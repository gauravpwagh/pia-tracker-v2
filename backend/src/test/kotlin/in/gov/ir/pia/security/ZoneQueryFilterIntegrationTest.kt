package `in`.gov.ir.pia.security

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.api.ProjectSummaryResponse
import `in`.gov.ir.pia.api.SelectUserRequest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
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
 * Integration test verifying the query-level zone-filter pattern.
 *
 * Gate requirement (phasing.md § 1.4):
 *   "A project in a non-accessible zone is invisible to a user list query
 *    but reachable from a direct ID load (and that load returns 404)."
 *
 * Setup:
 * - NR project inserted directly via JDBC.
 * - NR CE/C user (EMP003, Amit Verma) — can see it.
 * - SCR CE/C user (EMP201, Venkatesh Rao, V001_009) — cannot see it.
 * - EDGS/C-I user (EMP001, Rajesh Kumar Singh) — PROJECT.READ.ALL → sees it.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class ZoneQueryFilterIntegrationTest {
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

        // Fixed UUIDs from V001_004__seed_demo_users.sql
        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101") // Rajesh Kumar Singh
        val CE_C_NR_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103") // Amit Verma (NR)

        // Fixed UUID from V001_009__seed_demo_user_scr.sql
        val CE_C_SCR_USER_ID: UUID = UUID.fromString("22222222-2222-2222-2222-222222222201") // Venkatesh Rao (SCR)
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var jdbc: JdbcTemplate

    /** ID of the NR project inserted by [setUp]. */
    private lateinit var nrProjectId: UUID

    @BeforeEach
    fun setUp() {
        // Look up the NR zone UUID from the seeded data.
        val nrZoneId =
            jdbc.queryForObject(
                "SELECT id FROM zones WHERE code = 'NR'",
                UUID::class.java,
            )!!

        // Insert a test project in the NR zone.
        nrProjectId = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO projects (id, zone_id, name) VALUES (?, ?, ?)",
            nrProjectId,
            nrZoneId,
            "NR Test Project",
        )
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun sessionCookies(userId: UUID): List<String> =
        restTemplate
            .postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(userId),
                Void::class.java,
            ).headers["Set-Cookie"] ?: emptyList()

    private fun request(
        method: HttpMethod,
        path: String,
        cookies: List<String>,
    ): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        return restTemplate.exchange(path, method, HttpEntity<Void>(headers), String::class.java)
    }

    private fun listProjects(cookies: List<String>) = request(HttpMethod.GET, "/api/v1/projects", cookies)

    private fun getProject(
        id: UUID,
        cookies: List<String>,
    ) = request(HttpMethod.GET, "/api/v1/projects/$id", cookies)

    // ── NR user can see NR project ────────────────────────────────────────────

    @Test
    fun `NR CE-C sees NR project in list`() {
        val cookies = sessionCookies(CE_C_NR_USER_ID)
        val response = listProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val projects =
            objectMapper.readValue(
                response.body!!,
                Array<ProjectSummaryResponse>::class.java,
            )
        assertThat(projects.map { it.id }).contains(nrProjectId)
    }

    @Test
    fun `NR CE-C can load NR project by ID`() {
        val cookies = sessionCookies(CE_C_NR_USER_ID)
        val response = getProject(nrProjectId, cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val project = objectMapper.readValue(response.body!!, ProjectSummaryResponse::class.java)
        assertThat(project.id).isEqualTo(nrProjectId)
        assertThat(project.name).isEqualTo("NR Test Project")
    }

    // ── SCR user cannot see NR project ───────────────────────────────────────

    @Test
    fun `SCR CE-C does NOT see NR project in list`() {
        val cookies = sessionCookies(CE_C_SCR_USER_ID)
        val response = listProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val projects =
            objectMapper.readValue(
                response.body!!,
                Array<ProjectSummaryResponse>::class.java,
            )
        assertThat(projects.map { it.id }).doesNotContain(nrProjectId)
    }

    @Test
    fun `SCR CE-C gets 404 on direct load of NR project — not 403`() {
        val cookies = sessionCookies(CE_C_SCR_USER_ID)
        val response = getProject(nrProjectId, cookies)
        // Must be 404, not 403 — to avoid revealing that the project exists.
        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }

    // ── EDGS_CI with PROJECT.READ.ALL sees NR project regardless ─────────────

    @Test
    fun `EDGS-CI with ALL-scope sees NR project in list from any zone`() {
        val cookies = sessionCookies(EDGS_CI_USER_ID)
        val response = listProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        val projects =
            objectMapper.readValue(
                response.body!!,
                Array<ProjectSummaryResponse>::class.java,
            )
        assertThat(projects.map { it.id }).contains(nrProjectId)
    }

    @Test
    fun `EDGS-CI can load NR project by ID`() {
        val cookies = sessionCookies(EDGS_CI_USER_ID)
        val response = getProject(nrProjectId, cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
    }
}
