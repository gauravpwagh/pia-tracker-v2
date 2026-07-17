package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.PanIndiaDashboardResponse
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
 * Phase 2.9 Gate — PAN India dashboard (phasing.md § 2.9).
 *
 * Gate: "An EDGS/C-I (with the system grant) sees PAN India totals.
 *        Drill-down by zone, then by project. Numbers reconcile
 *        (sum of zones = PAN India)."
 *
 * Test flow:
 *   1.  Create two projects in the NR zone (EDGS/CI → CAO/C allocates).
 *   2.  EDGS/C-I (user 101, ROLE_EDGS_CI → DASHBOARD.VIEW.PAN_INDIA) calls
 *       GET /api/v1/dashboard/pan-india → 200.
 *       ↳ Response lists every active zone (NR and more).
 *       ↳ NR zone entry in the zones list contains both projects.
 *       ↳ Top-level KPIs are non-negative integers.
 *   3.  Numbers reconcile: top-level KPIs == sum of the zones list KPIs.
 *       (Both are derived from zone_summary, so the cascade guarantees this.)
 *   4.  CAO/C (user 102, DASHBOARD.VIEW.ZONE but NOT PAN_INDIA) → 403.
 *   5.  Dy CE/C (user 104, DASHBOARD.VIEW.PROJECT only) → 403.
 *   6.  EDGS/C-I can reach project detail via the project ID in the response
 *       (drill-down: panIndia → zone → project entry contains the project ID).
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
class PanIndiaDashboardGateIntegrationTest {
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
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102")
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")
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
    fun `Phase 2-9 PAN India dashboard — EDGS sees all zones with projects, numbers reconcile, others get 403`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Step 1: Create two projects in NR zone ────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val cao = loginAs(CAO_C_USER_ID)
        val ce = loginAs(CE_C_USER_ID)

        val project1 =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "PAN India Gate Project Alpha ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        val project2 =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "PAN India Gate Project Beta ${UUID.randomUUID()}", zoneId = nrZoneId),
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

        // CE/C sets up team on project 1
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

        // ── Step 2: EDGS/C-I accesses PAN India dashboard ────────────────────
        val edgsResp = get("/api/v1/dashboard/pan-india", edgs, PanIndiaDashboardResponse::class.java)
        assertThat(edgsResp.statusCode).isEqualTo(HttpStatus.OK)
        val body = edgsResp.body!!

        // Top-level KPIs present and non-negative
        assertThat(body.totalProjectsActive)
            .`as`("totalProjectsActive must be non-negative")
            .isGreaterThanOrEqualTo(0)
        assertThat(body.totalProjectsWithSlaBreaches)
            .`as`("totalProjectsWithSlaBreaches must be non-negative")
            .isGreaterThanOrEqualTo(0)
        assertThat(body.totalDrawingsInApproval)
            .`as`("totalDrawingsInApproval must be non-negative")
            .isGreaterThanOrEqualTo(0)

        // Response includes at least NR zone
        assertThat(body.zones).isNotEmpty
        val zoneCodes = body.zones.map { it.zoneCode }.toSet()
        assertThat(zoneCodes)
            .`as`("PAN India response must include NR zone")
            .contains("NR")

        // NR zone entry has both projects in its list (drill-down: pan-india → zone → project)
        val nrZone = body.zones.find { it.zoneCode == "NR" }!!
        val nrProjectIds = nrZone.projects.map { it.projectId }.toSet()
        assertThat(nrProjectIds)
            .`as`("NR zone in PAN India response must include both newly created projects")
            .contains(project1.id, project2.id)

        // Zone entry fields
        assertThat(nrZone.zoneId).isEqualTo(nrZoneId)
        assertThat(nrZone.zoneName).isNotBlank()

        // Per-project drill-down data
        val p1Dto = nrZone.projects.find { it.projectId == project1.id }!!
        assertThat(p1Dto.name).isNotBlank()
        assertThat(p1Dto.lifecycleState).isNotBlank()
        assertThat(p1Dto.slaBreachCount).isGreaterThanOrEqualTo(0)

        // ── Step 3: Numbers reconcile — sum of zones == PAN India totals ──────
        // Both are derived from zone_summary by the same cascade, so they must agree.
        val sumProjectsActive = body.zones.sumOf { it.projectsActive }
        val sumSlaBreaches = body.zones.sumOf { it.projectsWithSlaBreaches }
        val sumDrawings = body.zones.sumOf { it.totalDrawingsInApproval }

        assertThat(body.totalProjectsActive)
            .`as`("PAN India totalProjectsActive must equal sum of zone projectsActive")
            .isEqualTo(sumProjectsActive)
        assertThat(body.totalProjectsWithSlaBreaches)
            .`as`("PAN India totalProjectsWithSlaBreaches must equal sum of zone projectsWithSlaBreaches")
            .isEqualTo(sumSlaBreaches)
        assertThat(body.totalDrawingsInApproval)
            .`as`("PAN India totalDrawingsInApproval must equal sum of zone totalDrawingsInApproval")
            .isEqualTo(sumDrawings)

        // ── Step 4: CAO/C (DASHBOARD.VIEW.ZONE, NOT PAN_INDIA) → 403 ─────────
        val caoResp = get("/api/v1/dashboard/pan-india", cao, Void::class.java)
        assertThat(caoResp.statusCode)
            .`as`("CAO/C with only DASHBOARD.VIEW.ZONE must receive 403 on pan-india endpoint")
            .isEqualTo(HttpStatus.FORBIDDEN)

        // ── Step 5: Dy CE/C (DASHBOARD.VIEW.PROJECT only) → 403 ─────────────
        val dyce = loginAs(DYCE_1_USER_ID)
        val dyceResp = get("/api/v1/dashboard/pan-india", dyce, Void::class.java)
        assertThat(dyceResp.statusCode)
            .`as`("Dy CE/C without DASHBOARD.VIEW.PAN_INDIA must receive 403")
            .isEqualTo(HttpStatus.FORBIDDEN)
    }
}
