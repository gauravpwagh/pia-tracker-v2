package `in`.gov.ir.pia.project

import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.DesignateNodalRequest
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
 * Phase 1.7 gate test (phasing.md § 1.7):
 *
 *   "E2E test walking: EDGS/C-I creates a project → CAO/C of the zone
 *    allocates to a CE/C → CE/C assigns two Dy CE/Cs and designates one as
 *    Nodal. All assignments visible in `project_assignments`.
 *    Audit log has the right rows."
 *
 * Uses a real Postgres container with the full Flyway migration + seed suite.
 * Each test uses a **separate HTTP session per actor** (cookies) to simulate
 * realistic multi-user flows, without rolling back between steps (the full
 * flow must be visible at the end).
 *
 * Seeded users (V001_004):
 *   EMP001 — Rajesh Kumar Singh, EDGS_CI, NR zone  → PROJECT.CREATE
 *   EMP002 — Priya Sharma,        CAO_C,  NR zone  → PROJECT.ALLOCATE
 *   EMP003 — Amit Verma,          CE_C,   NR zone  → PROJECT.ASSIGN_DYCE + PROJECT.DESIGNATE_NODAL
 *   EMP004 — Sunita Patel,        DY_CE_C, NR zone
 *   EMP005 — Mohammed Asif,       DY_CE_C, NR zone
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class ProjectLifecycleIntegrationTest {
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
        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101") // EMP001 Rajesh
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102") // EMP002 Priya
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103") // EMP003 Amit
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104") // EMP004 Sunita
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105") // EMP005 Mohammed
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var jdbc: JdbcTemplate

    // ── Session helpers ───────────────────────────────────────────────────────

    private fun loginAs(userId: UUID): List<String> {
        val response =
            restTemplate.postForEntity(
                "/api/v1/auth/select-user",
                SelectUserRequest(userId),
                Void::class.java,
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        return response.headers["Set-Cookie"] ?: emptyList()
    }

    private fun headersFor(cookies: List<String>): HttpHeaders {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        return headers
    }

    private fun <T> post(
        url: String,
        body: Any,
        cookies: List<String>,
        responseType: Class<T>,
    ): org.springframework.http.ResponseEntity<T> =
        restTemplate.postForEntity(
            url,
            HttpEntity(body, headersFor(cookies)),
            responseType,
        )

    // ── Gate test ─────────────────────────────────────────────────────────────

    /**
     * Full EDGS → CAO → CE flow, verifying each workflow state transition,
     * all project_assignment rows, and audit log entries.
     */
    @Test
    fun `full project lifecycle — create allocate assign designate-nodal`() {
        // Resolve the NR zone ID from the live DB (seeded by V001_002)
        val nrZoneId =
            jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Step 1: EDGS/C-I creates the project ─────────────────────────────
        val edgsCookies = loginAs(EDGS_CI_USER_ID)

        val createResponse =
            post(
                "/api/v1/projects",
                CreateProjectRequest(
                    name = "Doubling of Ambala-Ludhiana Section",
                    zoneId = nrZoneId,
                    projectCode = "NR-2026-001",
                    projectType = "DOUBLING",
                ),
                edgsCookies,
                ProjectDetailResponse::class.java,
            )

        assertThat(createResponse.statusCode).isEqualTo(HttpStatus.CREATED)
        val project = createResponse.body!!
        assertThat(project.name).isEqualTo("Doubling of Ambala-Ludhiana Section")
        assertThat(project.lifecycleState).isEqualTo("AWAITING_CAO_ALLOCATION")
        assertThat(project.projectCode).isEqualTo("NR-2026-001")
        assertThat(project.zoneId).isEqualTo(nrZoneId)

        val projectId = project.id

        // Verify DB: lifecycle_state column is synced by ProjectLifecycleSyncListener
        val dbState =
            jdbc.queryForObject(
                "SELECT lifecycle_state FROM projects WHERE id = ?",
                String::class.java,
                projectId,
            )
        assertThat(dbState).isEqualTo("AWAITING_CAO_ALLOCATION")

        // ── Step 2: CAO/C allocates project to CE/C ───────────────────────────
        val caoCookies = loginAs(CAO_C_USER_ID)

        val allocateResponse =
            post(
                "/api/v1/projects/$projectId/allocate",
                AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
                caoCookies,
                ProjectDetailResponse::class.java,
            )

        assertThat(allocateResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(allocateResponse.body!!.lifecycleState).isEqualTo("AWAITING_CEC_ASSIGNMENT")

        // Verify CE_C assignment row
        val ceAssignmentCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM project_assignments
                 WHERE project_id = ? AND user_id = ? AND assignment_role = 'CE_C' AND is_active = true
                """.trimIndent(),
                Long::class.java,
                projectId,
                CE_C_USER_ID,
            )!!
        assertThat(ceAssignmentCount).isEqualTo(1L)

        // ── Step 3: CE/C assigns two Dy CE/Cs ────────────────────────────────
        val ceCookies = loginAs(CE_C_USER_ID)

        val assignResponse =
            post(
                "/api/v1/projects/$projectId/assign-dyce",
                AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID, DYCE_2_USER_ID)),
                ceCookies,
                ProjectDetailResponse::class.java,
            )

        assertThat(assignResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(assignResponse.body!!.lifecycleState).isEqualTo("ACTIVE")

        // Verify two DY_CE_C assignment rows
        val dyceCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM project_assignments
                 WHERE project_id = ? AND assignment_role = 'DY_CE_C' AND is_active = true
                """.trimIndent(),
                Long::class.java,
                projectId,
            )!!
        assertThat(dyceCount).isEqualTo(2L)

        // ── Step 4: CE/C designates EMP004 (Sunita) as Nodal ─────────────────
        val nodalResponse =
            post(
                "/api/v1/projects/$projectId/designate-nodal",
                DesignateNodalRequest(nodalUserId = DYCE_1_USER_ID),
                ceCookies,
                ProjectDetailResponse::class.java,
            )

        assertThat(nodalResponse.statusCode).isEqualTo(HttpStatus.OK)
        // designateNodal does not change lifecycle state — still ACTIVE
        assertThat(nodalResponse.body!!.lifecycleState).isEqualTo("ACTIVE")

        // ── Verify project_assignments: all 4 expected rows ───────────────────
        val allAssignments =
            jdbc.queryForList(
                """
                SELECT assignment_role FROM project_assignments
                 WHERE project_id = ? AND is_active = true
                 ORDER BY assignment_role
                """.trimIndent(),
                String::class.java,
                projectId,
            )
        assertThat(allAssignments).containsExactlyInAnyOrder(
            "CE_C",
            "DY_CE_C",
            "DY_CE_C",
            "NODAL_DY_CE_C",
        )

        // NODAL user must be EMP004 (Sunita Patel)
        val nodalUserId =
            jdbc.queryForObject(
                """
                SELECT user_id FROM project_assignments
                 WHERE project_id = ? AND assignment_role = 'NODAL_DY_CE_C' AND is_active = true
                """.trimIndent(),
                UUID::class.java,
                projectId,
            )
        assertThat(nodalUserId).isEqualTo(DYCE_1_USER_ID)

        // EMP004 must now have ROLE_NODAL_DY_CE_C in user_roles
        val nodalRoleCount =
            jdbc.queryForObject(
                "SELECT count(*) FROM user_roles WHERE user_id = ? AND role_code = 'ROLE_NODAL_DY_CE_C'",
                Long::class.java,
                DYCE_1_USER_ID,
            )!!
        assertThat(nodalRoleCount).isEqualTo(1L)

        // ── Verify audit_log: at least 4 rows for this project ────────────────
        val auditRowCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM audit_log
                 WHERE entity_type = 'PROJECT' AND entity_id = ?
                """.trimIndent(),
                Long::class.java,
                projectId,
            )!!
        assertThat(auditRowCount).isGreaterThanOrEqualTo(4L)

        // Verify the specific action codes are present
        val auditActions =
            jdbc.queryForList(
                """
                SELECT action FROM audit_log
                 WHERE entity_type = 'PROJECT' AND entity_id = ?
                 ORDER BY at
                """.trimIndent(),
                String::class.java,
                projectId,
            )
        // WorkflowAuditListener also writes WORKFLOW.* entries for the same
        // entity_type + entity_id on each transition; use contains() (not
        // containsExactlyInAnyOrder) so those extra rows don't break the assertion.
        assertThat(auditActions).contains(
            "PROJECT.CREATE",
            "PROJECT.ALLOCATE",
            "PROJECT.ASSIGN_DYCE",
            "PROJECT.DESIGNATE_NODAL",
        )

        // ── Verify final DB lifecycle_state ───────────────────────────────────
        val finalDbState =
            jdbc.queryForObject(
                "SELECT lifecycle_state FROM projects WHERE id = ?",
                String::class.java,
                projectId,
            )
        assertThat(finalDbState).isEqualTo("ACTIVE")
    }

    // ── Guard tests ───────────────────────────────────────────────────────────

    @Test
    fun `DY-CE-C cannot create a project — PROJECT-CREATE not in role`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val dyceCookies = loginAs(DYCE_1_USER_ID)

        val response =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Unauthorised Project", zoneId = nrZoneId),
                dyceCookies,
                String::class.java,
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    @Test
    fun `CE-C cannot allocate a project — PROJECT-ALLOCATE not in role`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // Create a project first as EDGS_CI
        val edgsCookies = loginAs(EDGS_CI_USER_ID)
        val createResp =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Allocate Guard Test Project", zoneId = nrZoneId),
                edgsCookies,
                ProjectDetailResponse::class.java,
            )
        val projectId = createResp.body!!.id

        // CE_C tries to allocate
        val ceCookies = loginAs(CE_C_USER_ID)
        val allocResp =
            post(
                "/api/v1/projects/$projectId/allocate",
                AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
                ceCookies,
                String::class.java,
            )
        assertThat(allocResp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }
}
