package `in`.gov.ir.pia.activity

import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
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
 * Phase 1.8 gate test (phasing.md § 1.8):
 *
 *   "A Dy CE/C creates a Land Acquisition activity on their project.
 *    A second activity of the same type on that project is rejected (409) —
 *    at most one activity per type per project.
 *    A non-assigned Dy CE/C gets 403."
 *
 * Setup for each test that needs a project:
 *   EMP001 (EDGS_CI) creates a project
 *   EMP002 (CAO_C)   allocates it to EMP003 (CE_C)
 *   EMP003 (CE_C)    assigns Dy CE/Cs (varies per test)
 *
 * The full project lifecycle is exercised inline; this test does NOT depend
 * on [ProjectLifecycleIntegrationTest] running first.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class ActivityLifecycleIntegrationTest {
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
        val EDGS_CI_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101")
        val CAO_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102")
        val CE_C_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_1_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")

        // Fixed UUID for the LAND_ACQUISITION_V1 stub form definition (V003_002)
        val LAND_ACQUISITION_FORM_DEF_ID: UUID =
            UUID.fromString("ffffffff-0001-0001-0001-000000000001")
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var jdbc: JdbcTemplate

    // ── Session helpers (same pattern as ProjectLifecycleIntegrationTest) ─────

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

    // ── Project lifecycle helper ───────────────────────────────────────────────

    /**
     * Runs the full project lifecycle up to ACTIVE, assigning [dyceUserIds].
     * Returns the project ID.
     */
    private fun createActiveProject(dyceUserIds: List<UUID>): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // EDGS_CI creates project
        val edgsCookies = loginAs(EDGS_CI_USER_ID)
        val createResp =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Activity Test Project", zoneId = nrZoneId),
                edgsCookies,
                ProjectDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val projectId = createResp.body!!.id

        // CAO_C allocates
        val caoCookies = loginAs(CAO_C_USER_ID)
        val allocResp =
            post(
                "/api/v1/projects/$projectId/allocate",
                AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
                caoCookies,
                ProjectDetailResponse::class.java,
            )
        assertThat(allocResp.statusCode).isEqualTo(HttpStatus.OK)

        // CE_C assigns Dy CE/Cs → project becomes ACTIVE
        val ceCookies = loginAs(CE_C_USER_ID)
        val assignResp =
            post(
                "/api/v1/projects/$projectId/assign-dyce",
                AssignDyceRequest(dyceUserIds = dyceUserIds),
                ceCookies,
                ProjectDetailResponse::class.java,
            )
        assertThat(assignResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(assignResp.body!!.lifecycleState).isEqualTo("ACTIVE")

        return projectId
    }

    // ── Gate test ─────────────────────────────────────────────────────────────

    /**
     * A project holds at most ONE non-deleted activity of each type. The first
     * Land Acquisition activity is created; a second one on the same project is
     * rejected with 409, regardless of its name. Verifies DB rows and audit log.
     */
    @Test
    fun `second activity of the same type on a project is rejected with 409`() {
        val projectId = createActiveProject(listOf(DYCE_1_USER_ID, DYCE_2_USER_ID))
        val dyceCookies = loginAs(DYCE_1_USER_ID)

        // ── Step 1: Create the Land Acquisition activity ──────────────────────
        val firstResp =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(
                    activityTypeCode = "LAND_ACQUISITION",
                    name = "Land Acquisition — Ambala-Ludhiana",
                    scopeNotes = "Village-level LA for the initial 42 km stretch",
                ),
                dyceCookies,
                ActivityDetailResponse::class.java,
            )

        assertThat(firstResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val firstActivity = firstResp.body!!
        assertThat(firstActivity.activityTypeCode).isEqualTo("LAND_ACQUISITION")
        assertThat(firstActivity.name).isEqualTo("Land Acquisition — Ambala-Ludhiana")
        assertThat(firstActivity.projectId).isEqualTo(projectId)
        assertThat(firstActivity.primaryDyceUserId).isEqualTo(DYCE_1_USER_ID)
        assertThat(firstActivity.status).isEqualTo("NOT_STARTED")
        // The seeded stub form definition should be resolved
        assertThat(firstActivity.defaultFormDefinitionId).isEqualTo(LAND_ACQUISITION_FORM_DEF_ID)

        // ── Step 2: A SECOND Land Acquisition activity is rejected (409) ───────
        // Even with a different name — one activity per type per project.
        val secondResp =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(
                    activityTypeCode = "LAND_ACQUISITION",
                    name = "Phase 2 Land Acquisition — Ludhiana-Jalandhar",
                ),
                dyceCookies,
                String::class.java,
            )

        assertThat(secondResp.statusCode).isEqualTo(HttpStatus.CONFLICT)

        // ── Verify DB: still exactly ONE project_activities row ───────────────
        val activityCount =
            jdbc.queryForObject(
                """
                SELECT count(*) FROM project_activities
                 WHERE project_id = ? AND activity_type_code = 'LAND_ACQUISITION' AND is_deleted = false
                """.trimIndent(),
                Long::class.java,
                projectId,
            )!!
        assertThat(activityCount).isEqualTo(1L)

        // ── Verify audit log: exactly ONE ACTIVITY.CREATE row ─────────────────
        val auditActions =
            jdbc.queryForList(
                """
                SELECT action FROM audit_log
                 WHERE entity_type = 'ACTIVITY' AND entity_id = ?
                 ORDER BY at
                """.trimIndent(),
                String::class.java,
                firstActivity.id,
            )
        assertThat(auditActions).containsExactly("ACTIVITY.CREATE")

        // ── Verify list endpoint returns only the one activity ─────────────────
        val listResp =
            restTemplate.exchange(
                "/api/v1/projects/$projectId/activities",
                org.springframework.http.HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyceCookies)),
                Array<ActivityDetailResponse>::class.java,
            )
        assertThat(listResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(listResp.body!!.map { it.id }).containsExactly(firstActivity.id)
    }

    // ── Guard test ────────────────────────────────────────────────────────────

    /**
     * A Dy CE/C who is NOT assigned to the project must receive 403
     * when attempting to create an activity.
     */
    @Test
    fun `non-assigned DyCEC cannot create activity — gets 403`() {
        // Only DYCE_1 is assigned to this project; DYCE_2 is NOT.
        val projectId = createActiveProject(listOf(DYCE_1_USER_ID))

        val dyce2Cookies = loginAs(DYCE_2_USER_ID)
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val response =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(
                    activityTypeCode = "LAND_ACQUISITION",
                    name = "Unauthorised Activity",
                ),
                dyce2Cookies,
                String::class.java,
            )

        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    /**
     * Verify the list endpoint is accessible to an assigned Dy CE/C
     * and returns an empty list when no activities exist yet.
     */
    @Test
    fun `assigned DyCEC sees empty activity list on fresh project`() {
        val projectId = createActiveProject(listOf(DYCE_1_USER_ID))
        val dyceCookies = loginAs(DYCE_1_USER_ID)

        val listResp =
            restTemplate.exchange(
                "/api/v1/projects/$projectId/activities",
                org.springframework.http.HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyceCookies)),
                Array<ActivityDetailResponse>::class.java,
            )

        assertThat(listResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(listResp.body!!).isEmpty()
    }
}
