package `in`.gov.ir.pia.security

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.api.PrincipalResponse
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.api.UserSummaryResponse
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

@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class DummyAuthIntegrationTest {
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

        /** Fixed UUID seeded by V001_004 — Rajesh Kumar Singh. */
        val SEEDED_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101")
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun getUsers() = restTemplate.getForEntity("/api/v1/auth/users", Array<UserSummaryResponse>::class.java)

    private fun selectUser(userId: UUID): Pair<PrincipalResponse?, List<String>> {
        val body = SelectUserRequest(userId)
        val response =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                body,
                PrincipalResponse::class.java,
            )
        val cookies = response.headers["Set-Cookie"] ?: emptyList()
        return Pair(response.body, cookies)
    }

    /**
     * Exchange GET /auth/me and return the raw response as String so both 200 and
     * 401 bodies can be handled — Spring's problem+json error body can't be
     * deserialized as PrincipalResponse.
     */
    private fun getMe(cookies: List<String> = emptyList()): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        return restTemplate.exchange(
            "/api/v1/auth/me",
            HttpMethod.GET,
            HttpEntity<Void>(headers),
            String::class.java,
        )
    }

    private fun logout(cookies: List<String> = emptyList()): org.springframework.http.ResponseEntity<Void> {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        return restTemplate.exchange(
            "/api/v1/auth/logout",
            HttpMethod.POST,
            HttpEntity<Void>(headers),
            Void::class.java,
        )
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    fun `GET auth-users returns 200 with at least 6 seeded users`() {
        val response = getUsers()
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.body).isNotNull
        assertThat(response.body!!.size).isGreaterThanOrEqualTo(6)
    }

    @Test
    fun `POST auth-select-user with valid userId returns 200 with PrincipalResponse`() {
        val (principal, _) = selectUser(SEEDED_USER_ID)
        assertThat(principal).isNotNull
        assertThat(principal!!.userId).isEqualTo(SEEDED_USER_ID)
        assertThat(principal.name).isEqualTo("Rajesh Kumar Singh")
        assertThat(principal.designationCode).isEqualTo("EDGS_CI")
    }

    @Test
    fun `POST auth-select-user with unknown userId returns 400`() {
        val unknownId = UUID.randomUUID()
        val response =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(unknownId),
                String::class.java,
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
    }

    @Test
    fun `GET auth-me after select-user returns the same user data`() {
        val (_, cookies) = selectUser(SEEDED_USER_ID)
        assertThat(cookies).isNotEmpty

        val meResponse = getMe(cookies)
        assertThat(meResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(meResponse.body).isNotNull
        val principal = objectMapper.readValue(meResponse.body!!, PrincipalResponse::class.java)
        assertThat(principal.userId).isEqualTo(SEEDED_USER_ID)
        assertThat(principal.name).isEqualTo("Rajesh Kumar Singh")
    }

    @Test
    fun `POST auth-logout clears the session — subsequent GET auth-me returns 401`() {
        val (_, cookies) = selectUser(SEEDED_USER_ID)
        assertThat(cookies).isNotEmpty

        // Confirm session works before logout
        val beforeLogout = getMe(cookies)
        assertThat(beforeLogout.statusCode).isEqualTo(HttpStatus.OK)

        val logoutResponse = logout(cookies)
        assertThat(logoutResponse.statusCode).isEqualTo(HttpStatus.NO_CONTENT)

        // After logout the session cookie is invalidated server-side
        val afterLogout = getMe(cookies)
        assertThat(afterLogout.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `GET auth-me without session returns 401`() {
        val response = getMe()
        assertThat(response.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }
}
