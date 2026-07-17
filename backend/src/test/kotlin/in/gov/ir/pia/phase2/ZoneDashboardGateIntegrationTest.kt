package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.ZoneDashboardResponse
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
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
 * Phase 2.8 Gate — Zone-scope dashboard (phasing.md § 2.8).
 *
 * Gate: "A CAO/C of NR sees an NR-scope dashboard with all NR projects rolled up.
 *        Clicking a project drills into its tree. Cross-zone users (with zone grants)
 *        see their accessible zones."
 *
 * Test flow:
 *   1.  Create two projects in the NR zone (EDGS/CI creates, CAO/C allocates).
 *   2.  CAO/C of NR (user 102) calls GET /api/v1/dashboard/zone.
 *       ↳ Response has exactly one zone entry (NR).
 *       ↳ The NR zone entry contains both projects in its project list.
 *       ↳ projectsActive, projectsWithSlaBreaches, totalDrawingsInApproval are ≥ 0.
 *   3.  A Dy CE/C (user 104) — who has DASHBOARD.VIEW.PROJECT but NOT .ZONE —
 *       calls GET /api/v1/dashboard/zone → 403.
 *   4.  Cross-zone user (user 112, seeded in V017_001: CAO/C in SCR with NR cross-zone grant)
 *       calls GET /api/v1/dashboard/zone.
 *       ↳ Response has two zone entries: SCR and NR.
 *       ↳ NR zone entry contains the two projects created in step 1.
 *       ↳ SCR zone entry exists (may have 0 projects in the test DB).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data",
        "pia.clamav.host=127.0.0.1",
        "pia.clamav.port=19999",
        "pia.clamav.timeout-ms=200",
    ],
)
class ZoneDashboardGateIntegrationTest {
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

        // Users seeded by V001_004
        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101")
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102") // NR zone
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")

        // Cross-zone user seeded by V017_001: CAO_C in SCR with NR cross-zone grant
        val CAO_C_SCR_NR_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111112")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockkBean lateinit var minioClient: MinioClient

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
    ) =
        restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-8 Zone dashboard — CAO-C sees NR scope, cross-zone user sees both zones, Dy CE-C gets 403`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val scrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'SCR'", UUID::class.java)!!

        // ── Step 1: Create two NR projects ────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val cao = loginAs(CAO_C_USER_ID)
        val ce = loginAs(CE_C_USER_ID)

        val project1 =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Zone Gate Project Alpha ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        val project2 =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Zone Gate Project Beta ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        // CAO/C allocates both
        post(
            "/api/v1/projects/${project1.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
            cao,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project2.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
            cao,
            ProjectDetailResponse::class.java,
        )

        // CE/C sets up teams (ensures projects are fully initialised)
        post(
            "/api/v1/projects/${project1.id}/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)),
            ce,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project1.id}/designate-nodal",
            DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID),
            ce,
            ProjectDetailResponse::class.java,
        )

        // ── Step 2: CAO/C of NR sees exactly NR zone with both projects ───────
        val caoResp = get("/api/v1/dashboard/zone", cao, ZoneDashboardResponse::class.java)
        assertThat(caoResp.statusCode).isEqualTo(HttpStatus.OK)
        val caoBody = caoResp.body!!

        assertThat(caoBody.zones)
            .`as`("CAO/C of NR should see exactly one zone (NR)")
            .hasSize(1)

        val nrZone = caoBody.zones.first()
        assertThat(nrZone.zoneCode)
            .`as`("The single zone returned for CAO/C must be NR")
            .isEqualTo("NR")
        assertThat(nrZone.zoneId)
            .`as`("zoneId in response must match the NR zone UUID")
            .isEqualTo(nrZoneId)

        val nrProjectIds = nrZone.projects.map { it.projectId }.toSet()
        assertThat(nrProjectIds)
            .`as`("NR zone projects must include both newly created projects")
            .contains(project1.id, project2.id)

        // KPI strip fields must be present (values may be 0 if no workflow transitions yet)
        assertThat(nrZone.projectsActive).isGreaterThanOrEqualTo(0)
        assertThat(nrZone.projectsWithSlaBreaches).isGreaterThanOrEqualTo(0)
        assertThat(nrZone.totalDrawingsInApproval).isGreaterThanOrEqualTo(0)

        // Per-project fields
        val p1Dto = nrZone.projects.find { it.projectId == project1.id }!!
        assertThat(p1Dto.lifecycleState).isNotBlank()
        assertThat(p1Dto.slaBreachCount).isGreaterThanOrEqualTo(0)
        assertThat(p1Dto.drawingsInApproval).isGreaterThanOrEqualTo(0)

        // ── Step 3: Dy CE/C (DASHBOARD.VIEW.PROJECT only) → 403 ─────────────
        val dyce = loginAs(DYCE_1_USER_ID)
        val dyceResp = get("/api/v1/dashboard/zone", dyce, Void::class.java)
        assertThat(dyceResp.statusCode)
            .`as`("Dy CE/C without DASHBOARD.VIEW.ZONE must receive 403")
            .isEqualTo(HttpStatus.FORBIDDEN)

        // ── Step 4: Cross-zone user (SCR primary + NR grant) sees both zones ─
        val crossZone = loginAs(CAO_C_SCR_NR_USER_ID)
        val crossZoneResp = get("/api/v1/dashboard/zone", crossZone, ZoneDashboardResponse::class.java)
        assertThat(crossZoneResp.statusCode).isEqualTo(HttpStatus.OK)
        val crossZoneBody = crossZoneResp.body!!

        val returnedZoneCodes = crossZoneBody.zones.map { it.zoneCode }.toSet()
        assertThat(returnedZoneCodes)
            .`as`("Cross-zone user (SCR + NR grant) must see both SCR and NR zones")
            .contains("SCR", "NR")

        val crossNrZone = crossZoneBody.zones.find { it.zoneCode == "NR" }!!
        val crossNrProjectIds = crossNrZone.projects.map { it.projectId }.toSet()
        assertThat(crossNrProjectIds)
            .`as`("Cross-zone user's NR entry must also include both NR projects")
            .contains(project1.id, project2.id)

        val crossScrZone = crossZoneBody.zones.find { it.zoneCode == "SCR" }!!
        assertThat(crossScrZone.zoneId)
            .`as`("SCR zone ID must match")
            .isEqualTo(scrZoneId)
        // SCR has no projects created in this test — list may be empty or contain
        // projects from earlier tests that share the same DB container
        assertThat(crossScrZone.projectsActive).isGreaterThanOrEqualTo(0)
    }
}
