package `in`.gov.ir.pia.phase2

import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.dashboard.ForestStageBreakdownDto
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.PatchActivityRecordRequest
import `in`.gov.ir.pia.service.activity.RecordWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.SectionWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.WorkflowActionRequest
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
import org.springframework.http.MediaType
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
 * Phase 2.4 Gate — Forest Clearance golden path (phasing.md § 2.4).
 *
 * Gate: "Each stage transitions independently.
 *        The 'stage I authenticated but II in draft' state is valid.
 *        Dashboard correctly shows in-stage counts."
 *
 * One Forest Clearance record is created (3 SECTION_STANDARD_V1 instances).
 * Stage I (stage_i) is driven through the full submit → verify → authenticate
 * cycle.  Stage II and Post-Approval remain in their initial DRAFT state.
 *
 * The test then asserts:
 *   - GET /api/v1/activity-records/{id}/workflow → stage_i = AUTHENTICATED,
 *     stage_ii = DRAFT, post_approval = DRAFT.
 *   - GET /api/v1/dashboard/projects/{id}/forest-stage-breakdown →
 *     stage_i authenticatedCount = 1; stage_ii absent (never transitioned).
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
class ForestClearanceGateIntegrationTest {
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

        private val STAGE_I_DATA_JSON =
            """
            {
              "forest_division_name":  "NR Division — Hapur Forest Range",
              "forest_area_hectares":  8.25,
              "project_chainage_from": "42+000",
              "project_chainage_to":   "42+800",
              "stage_i": {
                "proposal_submitted_on_parivesh": true,
                "proposal_submitted_date":        "2024-03-01",
                "scrutiny_by_dfo":                true,
                "scrutiny_date":                  "2024-04-15",
                "site_inspection":                true,
                "site_inspection_date":           "2024-05-10",
                "in_principle_approval":          true,
                "in_principle_approval_date":     "2024-07-20",
                "stipulated_conditions":          "Compensatory afforestation at 1:2 ratio.",
                "queries": [
                  {
                    "submitted_on": "2024-04-01",
                    "returned_on":  "2024-04-20",
                    "remark":       "Additional documents requested by MoEF"
                  }
                ]
              }
            }
            """.trimIndent()
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var objectMapper: ObjectMapper

    @MockkBean
    lateinit var minioClient: MinioClient

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

    private fun headersFor(
        cookies: List<String>,
        extra: HttpHeaders? = null,
    ): HttpHeaders {
        val h = HttpHeaders()
        if (cookies.isNotEmpty()) h["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        extra?.forEach { key, values -> h[key] = values }
        return h
    }

    private fun <T> post(
        url: String,
        body: Any,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.postForEntity(url, HttpEntity(body, headersFor(cookies)), type)

    private fun <T> patch(
        url: String,
        body: Any,
        cookies: List<String>,
        eTag: String,
        type: Class<T>,
    ) = restTemplate.exchange(
        url,
        HttpMethod.PATCH,
        HttpEntity(
            body,
            headersFor(cookies).apply {
                contentType = MediaType.APPLICATION_JSON
                set("If-Match", eTag)
            },
        ),
        type,
    )

    private fun <T> get(
        url: String,
        cookies: List<String>,
        type: Class<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    /**
     * Drives one Forest Clearance stage ([stageCode]) on [recordId] through the
     * full submit → verify → authenticate cycle.
     *
     * [dyce1] submits, [dyce2] (Nodal) verifies, [ce] authenticates.
     */
    private fun fullStageCycle(
        recordId: UUID,
        stageCode: String,
        dyce1: List<String>,
        dyce2: List<String>,
        ce: List<String>,
    ) {
        val submitResp =
            post(
                "/api/v1/activity-records/$recordId/submit",
                WorkflowActionRequest(sectionCode = stageCode),
                dyce1,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(submitResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(submitResp.body!!.currentStateCode).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        val verifyResp =
            post(
                "/api/v1/activity-records/$recordId/verify",
                WorkflowActionRequest(sectionCode = stageCode),
                dyce2,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(verifyResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(verifyResp.body!!.currentStateCode).isEqualTo("VERIFIED")

        val authResp =
            post(
                "/api/v1/activity-records/$recordId/authenticate",
                WorkflowActionRequest(sectionCode = stageCode),
                ce,
                SectionWorkflowStateResponse::class.java,
            )
        assertThat(authResp.statusCode).isIn(HttpStatus.OK, HttpStatus.CREATED)
        assertThat(authResp.body!!.currentStateCode).isEqualTo("AUTHENTICATED")
    }

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-4 Forest Clearance gate — stage I authenticated while stage II stays draft, dashboard shows in-stage counts`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold ───────────────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "FC Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
            cao,
            ProjectDetailResponse::class.java,
        )

        val ce = loginAs(CE_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)),
            ce,
            ProjectDetailResponse::class.java,
        )
        post(
            "/api/v1/projects/${project.id}/designate-nodal",
            DesignateNodalRequest(nodalUserId = DYCE_2_USER_ID),
            ce,
            ProjectDetailResponse::class.java,
        )

        val dyce1 = loginAs(DYCE_1_USER_ID)
        val dyce2 = loginAs(DYCE_2_USER_ID)

        // ── Create Forest Clearance activity + record ──────────────────────────
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(
                    activityTypeCode = "FOREST_CLEARANCE",
                    name = "Phase 2.4 FC Gate Activity",
                ),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        val createResp =
            restTemplate.postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce1)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createResp.body!!
        val eTag = createResp.headers["ETag"]?.firstOrNull() ?: "\"${record.version}\""

        // Fill stage_i data (patch before submit)
        val patchResp =
            patch(
                "/api/v1/activity-records/${record.id}",
                PatchActivityRecordRequest(dataJson = objectMapper.readTree(STAGE_I_DATA_JSON)),
                dyce1,
                eTag,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)

        // ── Gate: stage I transitions independently ────────────────────────────
        fullStageCycle(record.id, "stage_i", dyce1, dyce2, ce)

        // ── Gate: "stage I authenticated but II in draft" is valid ────────────
        // Verify via the workflow state endpoint that all three instances are in
        // the expected states simultaneously.
        val workflowResp =
            get(
                "/api/v1/activity-records/${record.id}/workflow",
                ce,
                RecordWorkflowStateResponse::class.java,
            ).body!!

        assertThat(workflowResp.instances).hasSize(3)

        val stageIInstance = workflowResp.instances.find { it.sectionCode == "stage_i" }
        assertThat(stageIInstance)
            .`as`("stage_i workflow instance must exist")
            .isNotNull
        assertThat(stageIInstance!!.currentStateCode)
            .`as`("stage_i must be AUTHENTICATED")
            .isEqualTo("AUTHENTICATED")

        val stageIIInstance = workflowResp.instances.find { it.sectionCode == "stage_ii" }
        assertThat(stageIIInstance)
            .`as`("stage_ii workflow instance must exist")
            .isNotNull
        assertThat(stageIIInstance!!.currentStateCode)
            .`as`("stage_ii must remain DRAFT (stages are independent)")
            .isEqualTo("DRAFT")

        val postApprovalInstance = workflowResp.instances.find { it.sectionCode == "post_approval" }
        assertThat(postApprovalInstance)
            .`as`("post_approval workflow instance must exist")
            .isNotNull
        assertThat(postApprovalInstance!!.currentStateCode)
            .`as`("post_approval must remain DRAFT")
            .isEqualTo("DRAFT")

        // ── Gate: dashboard shows in-stage counts ─────────────────────────────
        val breakdown =
            get(
                "/api/v1/dashboard/projects/${project.id}/forest-stage-breakdown",
                ce,
                ForestStageBreakdownDto::class.java,
            ).body!!

        // stage_i must appear with authenticatedCount = 1
        val stageISummary = breakdown.stages.find { it.stageCode == "stage_i" }
        assertThat(stageISummary)
            .`as`("Forest stage breakdown must include stage_i after authentication")
            .isNotNull
        assertThat(stageISummary!!.authenticatedCount)
            .`as`("stage_i authenticated_count must be 1")
            .isEqualTo(1)

        // stage_ii must not appear (never transitioned from DRAFT) or have 0 authenticated
        val stageIISummary = breakdown.stages.find { it.stageCode == "stage_ii" }
        assertThat(stageIISummary?.authenticatedCount ?: 0)
            .`as`("stage_ii must not show any authenticated records")
            .isEqualTo(0)
    }
}
