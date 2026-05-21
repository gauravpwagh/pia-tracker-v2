package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.activity.RecordHistoryEntry
import `in`.gov.ir.pia.service.activity.SectionWorkflowStateResponse
import `in`.gov.ir.pia.service.activity.WorkflowActionRequest
import `in`.gov.ir.pia.service.comment.CommentDto
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
import org.springframework.core.ParameterizedTypeReference
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
 * Phase 1.13 gate test (phasing.md § 1.13):
 *
 *   "Comments table. Right-panel Comments tab with markdown + @mention typeahead.
 *    History tab pulling from workflow_history."
 *
 * Gate assertions:
 *   1. A Nodal sends back with comment → comment appears in the Comments panel
 *      for the record (GET /api/v1/comments?entityType=ACTIVITY_RECORD&entityId={id}).
 *   2. The History tab shows the transition
 *      (GET /api/v1/activity-records/{id}/history has an entry for the send-back).
 *   3. A freeform comment can be posted by a Dy CE/C without a workflow action.
 *   4. The comment count in GET /api/v1/comments grows after each post.
 *   5. Deleting own comment removes it from the list; deleting someone else's returns 403.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class CommentsIntegrationTest {
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

    // ── Session / HTTP helpers ─────────────────────────────────────────────────

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
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), type)

    private fun <T> getList(
        url: String,
        cookies: List<String>,
        typeRef: ParameterizedTypeReference<T>,
    ) = restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), typeRef)

    private fun delete(
        url: String,
        cookies: List<String>,
    ) = restTemplate.exchange(url, HttpMethod.DELETE, HttpEntity<Void>(headersFor(cookies)), Void::class.java)

    // ── Lifecycle helpers ──────────────────────────────────────────────────────

    private fun createActiveProjectWithNodal(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgs = loginAs(EDGS_CI_USER_ID)
        val projectId =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Comments Test Project", zoneId = nrZoneId),
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
                CreateActivityRequest(activityTypeCode = "LAND_ACQUISITION", name = "Comments Test LA"),
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

    // ── Gate 1 & 2: send-back comment appears in panel + history shows transition ─

    @Test
    fun `send-back comment appears in comments panel and history shows the transition`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)

        // DyCE submits, Nodal sends back with a comment
        post(
            "/api/v1/activity-records/$recordId/submit",
            WorkflowActionRequest(sectionCode = "srp"),
            dyce,
            SectionWorkflowStateResponse::class.java,
        )
        post(
            "/api/v1/activity-records/$recordId/send-back",
            WorkflowActionRequest(sectionCode = "srp", comment = "Please fix the chainage value."),
            nodal,
            SectionWorkflowStateResponse::class.java,
        )

        // Gate 1: comment appears in the Comments panel
        val nodalAfter = loginAs(DYCE_2_USER_ID)
        val commentsResp =
            getList(
                "/api/v1/comments?entityType=ACTIVITY_RECORD&entityId=$recordId",
                nodalAfter,
                object : ParameterizedTypeReference<List<CommentDto>>() {},
            )
        assertThat(commentsResp.statusCode).isEqualTo(HttpStatus.OK)
        val comments = commentsResp.body!!
        assertThat(comments).isNotEmpty
        assertThat(comments.any { it.bodyMarkdown == "Please fix the chainage value." }).isTrue()
        assertThat(
            comments
                .first { it.bodyMarkdown == "Please fix the chainage value." }
                .workflowStateAtComment,
        ).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // Gate 2: history shows the send-back transition
        val dyceAfter = loginAs(DYCE_1_USER_ID)
        val historyResp =
            getList(
                "/api/v1/activity-records/$recordId/history",
                dyceAfter,
                object : ParameterizedTypeReference<List<RecordHistoryEntry>>() {},
            )
        assertThat(historyResp.statusCode).isEqualTo(HttpStatus.OK)
        val history = historyResp.body!!
        assertThat(history).isNotEmpty

        val sendBackEntry = history.firstOrNull { it.actionCode == "send_back" }
        assertThat(sendBackEntry).isNotNull
        assertThat(sendBackEntry!!.toStateCode).isEqualTo("SENT_BACK_TO_DYCE")
        assertThat(sendBackEntry.comment).isEqualTo("Please fix the chainage value.")
        assertThat(sendBackEntry.sectionCode).isEqualTo("srp")
    }

    // ── Gate 3 & 4: freeform comment; comment count grows ─────────────────────

    @Test
    fun `freeform comment can be posted without a workflow action`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)

        // No workflow action — just post a standalone comment
        val createResp =
            post(
                "/api/v1/comments",
                mapOf(
                    "entityType" to "ACTIVITY_RECORD",
                    "entityId" to recordId.toString(),
                    "bodyMarkdown" to "Need to verify land ownership documents before submitting.",
                ),
                dyce,
                CommentDto::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        assertThat(createResp.body!!.bodyMarkdown)
            .isEqualTo("Need to verify land ownership documents before submitting.")
        assertThat(createResp.body!!.workflowStateAtComment).isNull()

        // Gate 4: comment count in GET response
        val dyceAfter = loginAs(DYCE_1_USER_ID)
        val listResp =
            getList(
                "/api/v1/comments?entityType=ACTIVITY_RECORD&entityId=$recordId",
                dyceAfter,
                object : ParameterizedTypeReference<List<CommentDto>>() {},
            )
        assertThat(listResp.body!!).hasSize(1)

        // Post a second comment; count should be 2
        post(
            "/api/v1/comments",
            mapOf(
                "entityType" to "ACTIVITY_RECORD",
                "entityId" to recordId.toString(),
                "bodyMarkdown" to "Follow-up: documents received.",
            ),
            loginAs(DYCE_1_USER_ID),
            CommentDto::class.java,
        )

        val listResp2 =
            getList(
                "/api/v1/comments?entityType=ACTIVITY_RECORD&entityId=$recordId",
                loginAs(DYCE_1_USER_ID),
                object : ParameterizedTypeReference<List<CommentDto>>() {},
            )
        assertThat(listResp2.body!!).hasSize(2)
    }

    // ── Gate 5: delete own comment; deleting others' returns 403 ──────────────

    @Test
    fun `user can delete own comment but not someone else's`() {
        val projectId = createActiveProjectWithNodal()
        val recordId = createRecord(projectId)

        val dyce = loginAs(DYCE_1_USER_ID)
        val nodal = loginAs(DYCE_2_USER_ID)

        // DyCE posts a comment
        val commentId =
            post(
                "/api/v1/comments",
                mapOf(
                    "entityType" to "ACTIVITY_RECORD",
                    "entityId" to recordId.toString(),
                    "bodyMarkdown" to "This is DyCE's comment.",
                ),
                dyce,
                CommentDto::class.java,
            ).body!!.id

        // Nodal tries to delete DyCE's comment → should be 403
        val forbiddenResp = delete("/api/v1/comments/$commentId", nodal)
        assertThat(forbiddenResp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)

        // DyCE deletes own comment → should be 204
        val deleteResp = delete("/api/v1/comments/$commentId", loginAs(DYCE_1_USER_ID))
        assertThat(deleteResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)

        // Comment no longer appears in the list
        val listResp =
            getList(
                "/api/v1/comments?entityType=ACTIVITY_RECORD&entityId=$recordId",
                loginAs(DYCE_1_USER_ID),
                object : ParameterizedTypeReference<List<CommentDto>>() {},
            )
        assertThat(listResp.body!!).isEmpty()
    }
}
