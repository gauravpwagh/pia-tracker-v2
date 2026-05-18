package `in`.gov.ir.pia.security

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
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

/**
 * Integration tests verifying that `@PreAuthorize` on [ProjectController]
 * correctly gates access by permission code.
 *
 * Strategy:
 * - Use different seeded users (different designations → different permissions).
 * - Call `GET /api/v1/projects` — gated by PROJECT.READ.OWN.
 * - Assert 200 for users with that permission and 401/403 for those without.
 *
 * Seeded users used (V001_004 + V001_009):
 *   EMP003 (Amit Verma, CE/C, NR)   → PROJECT.READ.OWN → 200
 *   EMP004 (Sunita Patel, DY CE/C, NR) → PROJECT.READ.OWN → 200
 *   EMP006 (Admin User, ADMIN, null)  → no PROJECT.* → 403
 *   No session                         → 401
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class PermissionGateIntegrationTest {
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
        val CE_C_NR_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103") // Amit Verma
        val DY_CE_C_NR_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104") // Sunita Patel
        val ADMIN_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111106") // Admin User
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun selectUserCookies(userId: UUID): List<String> {
        val response =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(userId),
                Void::class.java,
            )
        return response.headers["Set-Cookie"] ?: emptyList()
    }

    private fun getProjects(cookies: List<String> = emptyList()): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        return restTemplate.exchange(
            "/api/v1/projects",
            HttpMethod.GET,
            HttpEntity<Void>(headers),
            String::class.java,
        )
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    fun `GET projects without session returns 401`() {
        val response = getProjects()
        assertThat(response.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `GET projects as CE-C returns 200 — PROJECT-READ-OWN granted`() {
        val cookies = selectUserCookies(CE_C_NR_USER_ID)
        val response = getProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `GET projects as Dy-CE-C returns 200 — PROJECT-READ-OWN granted`() {
        val cookies = selectUserCookies(DY_CE_C_NR_USER_ID)
        val response = getProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `GET projects as ADMIN returns 403 — no PROJECT-READ permission`() {
        val cookies = selectUserCookies(ADMIN_USER_ID)
        val response = getProjects(cookies)
        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }
}
