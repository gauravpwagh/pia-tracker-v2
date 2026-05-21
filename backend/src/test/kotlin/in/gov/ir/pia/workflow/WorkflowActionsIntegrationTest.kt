package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.RecordWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.SectionWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.WorkflowActionRequest
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
 * Phase 1.11 gate test (phasing.md § 1.11):
 *
 *   "Submit / Verify / Authenticate / Send Back buttons on the Record Edit page.
 *    Section-aware action wiring (each section transitions independently).
 *    Comments on transitions where required."
 *
 * Gate assertions:
 *   1. Dy CE/C submits the SRP section → state becomes SUBMITTED_FOR_VERIFICATION.
 *   2. Nodal Dy CE/C verifies the SRP section → state becomes VERIFIED.
 *   3. CE/C authenticates the SRP section → state becomes AUTHENTICATED.
 *   4. GET /workflow shows correct state for the SRP instance and DRAFT for others.
 *   5. After all 9 sections are AUTHENTICATED the record-level cache = AUTHENTICATED.
 *   6. Send-back without comment returns 422.
 *   7. Wrong-role action returns 403.
 *   8. Workflow history for the SRP instance has 3 entries.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class WorkflowActionsIntegrationTest {
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
        val DYCE_2_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111105")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

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
    ) = restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    // ── Project / record lifecycle helpers ───────────────────────────────────

    /**
     * Creates a project and advances it to ACTIVE, then adds DYCE_2 as Nodal
     * on the project (via the designate-nodal endpoint).
     */
    private fun createActiveProjectWithNodal(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "WF Actions Test Project", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!.id

        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/allocate",
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
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
        // Designate DYCE_2 as Nodal Dy CE/C
        post(
            "/api/v1/projects/$projectId/designate-nodal",
            DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID),
            ce,
            ProjectDetailResponse::class.java,
        )

        return projectId
    }

    private fun createRecord(projectId: UUID): UUID {
        val dyce = loginAs(DYCE_1_USER_ID)
        val activityId =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "LAND_ACQUISITION", name = "WF Actions LA"),
                dyce,
                ActivityDetailResponse::class.java,
            ).body!!.id

        return post(
            "/api/v1/activities/$activityId/records",
            CreateActivityRecordRequest(),
            dyce,
            ActivityRecordDetailResponse::class.java,
        ).body!!.id
    }

    // ── Gate test 1-4: Submit → Verify → Authenticate on SRP section ─────────

    @Test
    fun `Dy CE submits, Nodal verifies, CE authenticates SRP section`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)
        val ce = loginAs(CE_C_USER_ID)

        // Gate 1: submit SRP
        val submitResp =
            post(
                "/api/v1/activity-records/$recordId/submit",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")
        assertThat(submitResp.body!!.sectionCode).isEqualTo("srp")

        // Gate 2: verify SRP
        val verifyResp =
            post(
                "/api/v1/activity-records/$recordId/verify",
                WorkflowActionRequest(sectionCode = "srp"),
                nodal,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

        // Gate 3: authenticate SRP
        val authResp =
            post(
                "/api/v1/activity-records/$recordId/authenticate",
                WorkflowActionRequest(sectionCode = "srp"),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(authResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(authResp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")
        assertThat(authResp.body!!.isTerminal).isTrue()

        // Gate 4: GET /workflow — SRP = AUTHENTICATED, others = DRAFT
        val wfResp =
            get(
                "/api/v1/activity-records/$recordId/workflow",
                dyce,
                RecordWorkflowStateResponse::class.java,
            )
        assertThat(wfResp.statusCode).isEqualTo(HttpStatus.OK)
        val instances = wfResp.body!!.instances
        assertThat(instances).hasSize(9)

        val srpInstance = instances.first { it.sectionCode == "srp" }
        assertThat(srpInstance.currentStateCode).isEqualTo("AUTHENTICATED")
        assertThat(srpInstance.availableActions).isEmpty()

        val draftSections = instances.filter { it.sectionCode != "srp" }
        assertThat(draftSections).allMatch { it.currentStateCode == "DRAFT" }
    }

    // ── Gate test 5: all sections AUTHENTICATED → record cache = AUTHENTICATED ─

    @Test
    fun `when all 9 sections are authenticated record_state becomes AUTHENTICATED`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val sectionCodes =
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

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)
        val ce = loginAs(CE_C_USER_ID)

        for (code in sectionCodes) {
            post(
                "/api/v1/activity-records/$recordId/submit",
                WorkflowActionRequest(sectionCode = code),
                dyce,
                SectionWorkflowStateResponse::class.java,
            )
            post(
                "/api/v1/activity-records/$recordId/verify",
                WorkflowActionRequest(sectionCode = code),
                nodal,
                SectionWorkflowStateResponse::class.java,
            )
            post(
                "/api/v1/activity-records/$recordId/authenticate",
                WorkflowActionRequest(sectionCode = code),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        }

        val recordState =
            jdbc.queryForObject(
                "SELECT record_state FROM activity_records WHERE id = ?",
                String::class.java,
                recordId,
            )
        assertThat(recordState).isEqualTo("AUTHENTICATED")
    }

    // ── Gate test 6: send-back without comment → 422 ─────────────────────────

    @Test
    fun `send-back without comment returns 422`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)

        // Submit first so the Nodal can send back
        post(
            "/api/v1/activity-records/$recordId/submit",
            WorkflowActionRequest(sectionCode = "srp"),
            dyce,
            SectionWorkflowStateResponse::class.java,
        )

        val resp =
            post(
                "/api/v1/activity-records/$recordId/send-back",
                WorkflowActionRequest(sectionCode = "srp", comment = null),
                nodal,
                String::class.java,
            )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
    }

    // ── Gate test 7: wrong-role action → 403 ─────────────────────────────────

    @Test
    fun `CE-C cannot submit a section — wrong role returns 403`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        // CE_C does not have ACTIVITY_RECORD.SUBMIT permission → 403 from @PreAuthorize
        val ce = loginAs(CE_C_USER_ID)
        val resp =
            post(
                "/api/v1/activity-records/$recordId/submit",
                WorkflowActionRequest(sectionCode = "srp"),
                ce,
                String::class.java,
            )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    // ── Gate test 8: workflow history has 3 entries after submit→verify→auth ──

    @Test
    fun `workflow history has 3 entries after full SRP section lifecycle`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)
        val ce = loginAs(CE_C_USER_ID)

        post(
            "/api/v1/activity-records/$recordId/submit",
            WorkflowActionRequest(sectionCode = "srp"),
            dyce,
            SectionWorkflowStateResponse::class.java,
        )
        post(
            "/api/v1/activity-records/$recordId/verify",
            WorkflowActionRequest(sectionCode = "srp"),
            nodal,
            SectionWorkflowStateResponse::class.java,
        )
        post(
            "/api/v1/activity-records/$recordId/authenticate",
            WorkflowActionRequest(sectionCode = "srp"),
            ce,
            SectionWorkflowStateResponse::class.java,
        )

        val srpInstanceId =
            jdbc.queryForObject(
                """
                SELECT wi.id FROM workflow_instances wi
                WHERE wi.entity_id = ? AND wi.section_code = 'srp'
                """.trimIndent(),
                UUID::class.java,
                recordId,
            )!!

        val historyCount =
            jdbc.queryForObject(
                "SELECT count(*) FROM workflow_history WHERE workflow_instance_id = ?",
                Long::class.java,
                srpInstanceId,
            )!!
        assertThat(historyCount).isEqualTo(3L)
    }

    // ── Gate test: send-back → resubmit round-trip ────────────────────────────

    @Test
    fun `Nodal sends back SRP, DyCE resubmits, Nodal verifies`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)

        // Submit → send-back with comment → resubmit → verify
        post(
            "/api/v1/activity-records/$recordId/submit",
            WorkflowActionRequest(sectionCode = "srp"),
            dyce,
            SectionWorkflowStateResponse::class.java,
        )

        val sbResp =
            post(
                "/api/v1/activity-records/$recordId/send-back",
                WorkflowActionRequest(sectionCode = "srp", comment = "Please fix the chainage"),
                nodal,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(sbResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(sbResp.body!!.currentStateCode).isEqualTo("SENT_BACK_TO_DYCE")

        val resubmitResp =
            post(
                "/api/v1/activity-records/$recordId/resubmit",
                WorkflowActionRequest(sectionCode = "srp"),
                dyce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(resubmitResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resubmitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        val verifyResp =
            post(
                "/api/v1/activity-records/$recordId/verify",
                WorkflowActionRequest(sectionCode = "srp"),
                nodal,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")
    }
}
