package `in`.gov.ir.pia.security

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.api.PrincipalResponse
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.Date
import java.util.UUID

/**
 * `GET /api/v1/sso/callback` — JIT provisioning for an unrecognized `sub`.
 *
 * Covers [in.gov.ir.pia.service.auth.SsoProvisioningService]: a valid SSO token for an
 * employee_id PIA doesn't know creates a fully active user from the token's
 * name/designation_code/primary_zone_id claims, rather than the old 403-reject
 * behaviour. See sso-poc/INTEGRATION_SPEC.md § 3 for the full contract.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data,classpath:db/test-data"])
class SsoProvisioningIntegrationTest {
    companion object {
        @JvmField
        @Container
        val postgres: PostgreSQLContainer<*> =
            PostgreSQLContainer("postgres:16-alpine")
                .withInitScript("testcontainers/init-roles.sql")

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

        // Matches SsoProperties.secret's default (no pia.sso.secret override for "dev").
        const val DEV_SSO_SECRET = "dev-only-shared-secret-CHANGE-ME"
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    // ── Token minting ─────────────────────────────────────────────────────────

    private fun mintToken(
        sub: String,
        name: String? = "Test Officer",
        designationCode: String? = "CE_C",
        primaryZoneId: String? = "NR",
        issuedAt: Date = Date(),
        expiresAt: Date = Date(System.currentTimeMillis() + 60_000),
    ): String {
        val builder =
            JWTClaimsSet.Builder()
                .subject(sub)
                .issueTime(issuedAt)
                .expirationTime(expiresAt)
        name?.let { builder.claim("name", it) }
        designationCode?.let { builder.claim("designation_code", it) }
        primaryZoneId?.let { builder.claim("primary_zone_id", it) }

        val jwt = SignedJWT(JWSHeader(JWSAlgorithm.HS256), builder.build())
        jwt.sign(MACSigner(DEV_SSO_SECRET.toByteArray(Charsets.UTF_8)))
        return jwt.serialize()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun callback(token: String) =
        restTemplate.exchange(
            "/api/v1/sso/callback?token=$token",
            HttpMethod.GET,
            HttpEntity<Void>(HttpHeaders()),
            String::class.java,
        )

    private fun getMe(cookies: List<String>): org.springframework.http.ResponseEntity<String> {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        return restTemplate.exchange("/api/v1/auth/me", HttpMethod.GET, HttpEntity<Void>(headers), String::class.java)
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    @Test
    fun `unknown sub with valid designation and zone claims is auto-provisioned and can act as that user`() {
        val sub = "JIT_${UUID.randomUUID().toString().take(8)}"
        val token = mintToken(sub = sub, name = "Auto Provisioned Officer", designationCode = "CE_C", primaryZoneId = "NR")

        val resp = callback(token)
        // SsoCallbackController redirects (302) on success; TestRestTemplate follows
        // redirects by default, so a 200 for "/" (the SPA shell) confirms success —
        // what matters here is the session cookie it sets along the way.
        assertThat(resp.statusCode).isIn(HttpStatus.OK, HttpStatus.FOUND)
        val cookies = resp.headers["Set-Cookie"] ?: emptyList()
        assertThat(cookies).isNotEmpty

        val me = getMe(cookies)
        assertThat(me.statusCode).isEqualTo(HttpStatus.OK)
        val principal = objectMapper.readValue(me.body!!, PrincipalResponse::class.java)
        assertThat(principal.name).isEqualTo("Auto Provisioned Officer")
        assertThat(principal.designationCode).isEqualTo("CE_C")

        // Row actually landed in the DB, active, with the zone resolved by code.
        val row =
            jdbc.queryForMap(
                "SELECT is_active, designation_code, primary_zone_id FROM users WHERE employee_id = ?",
                sub,
            )
        assertThat(row["is_active"]).isEqualTo(true)
        assertThat(row["designation_code"]).isEqualTo("CE_C")
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)
        assertThat(row["primary_zone_id"].toString()).isEqualTo(nrZoneId.toString())
    }

    @Test
    fun `unknown sub with no designation_code claim is rejected, not partially created`() {
        val sub = "JIT_${UUID.randomUUID().toString().take(8)}"
        val token = mintToken(sub = sub, designationCode = null)

        val resp = callback(token)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)

        val count = jdbc.queryForObject("SELECT count(*) FROM users WHERE employee_id = ?", Long::class.java, sub)
        assertThat(count).isEqualTo(0L)
    }

    @Test
    fun `unknown sub with an unresolvable zone claim is rejected`() {
        val sub = "JIT_${UUID.randomUUID().toString().take(8)}"
        val token = mintToken(sub = sub, designationCode = "CE_C", primaryZoneId = "NOT_A_REAL_ZONE")

        val resp = callback(token)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)

        val count = jdbc.queryForObject("SELECT count(*) FROM users WHERE employee_id = ?", Long::class.java, sub)
        assertThat(count).isEqualTo(0L)
    }

    @Test
    fun `pan-India designation with no zone claim is provisioned with a null zone`() {
        val sub = "JIT_${UUID.randomUUID().toString().take(8)}"
        val token = mintToken(sub = sub, designationCode = "EDGS_CI", primaryZoneId = null)

        val resp = callback(token)
        assertThat(resp.statusCode).isIn(HttpStatus.OK, HttpStatus.FOUND)

        val row =
            jdbc.queryForMap(
                "SELECT is_active, designation_code, primary_zone_id FROM users WHERE employee_id = ?",
                sub,
            )
        assertThat(row["is_active"]).isEqualTo(true)
        assertThat(row["primary_zone_id"]).isNull()
    }

    @Test
    fun `an existing, already-provisioned user still bridges in normally without re-provisioning`() {
        // Fixed fixture user from V900_001 — Rajesh Kumar Singh, EDGS_CI.
        val existingEmployeeId = "EMP001"
        val before = jdbc.queryForObject("SELECT count(*) FROM users WHERE employee_id = ?", Long::class.java, existingEmployeeId)
        assertThat(before).isEqualTo(1L)

        // Token claims a DIFFERENT designation than the stored one — must be ignored;
        // the stored designation_code is authoritative for an existing user.
        val token = mintToken(sub = existingEmployeeId, designationCode = "CAO_C", primaryZoneId = "CR")

        val resp = callback(token)
        assertThat(resp.statusCode).isIn(HttpStatus.OK, HttpStatus.FOUND)

        val row = jdbc.queryForMap("SELECT designation_code FROM users WHERE employee_id = ?", existingEmployeeId)
        assertThat(row["designation_code"]).isEqualTo("EDGS_CI")

        val after = jdbc.queryForObject("SELECT count(*) FROM users WHERE employee_id = ?", Long::class.java, existingEmployeeId)
        assertThat(after).isEqualTo(1L)
    }
}
