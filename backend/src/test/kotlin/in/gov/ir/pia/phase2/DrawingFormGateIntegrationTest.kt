package `in`.gov.ir.pia.phase2

import com.ninjasquad.springmockk.MockkBean
import `in`.gov.ir.pia.api.DesignationResponse
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
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
 * Phase 2.6 Gate — Drawing form definitions (phasing.md § 2.6).
 *
 * Gate: "Each drawing type can be created, fills its specific fields, gets the
 *        right default approver list. The picker for 'add approver' filters to
 *        approval-role designations."
 *
 * Test flow:
 *   1. Create a DRAWING_APPROVAL activity on a project.
 *   2. Create records of three representative drawing types with distinct
 *      approver lists:
 *        a. SIP         → 3 approvers: SR_DEN, DY_CE, CE_PLANNING
 *        b. GAD_MINOR   → 2 approvers: DY_CE_BRIDGE, SR_DEN
 *        c. TUNNEL_DESIGN → 4 approvers: DY_CE_DESIGN, SR_DEN, CE_PLANNING, PCE
 *   3. For each record, verify the drawing_approvers rows have the correct
 *      designation codes and are in the correct position order.
 *   4. Verify GET /api/v1/designations/approval-roles returns ONLY designations
 *      where is_approval_role = true, and that every result has isApprovalRole=true.
 *   5. Verify 422 is returned when recordSubtype is omitted for a DRAWING_APPROVAL activity.
 *   6. Verify 422 is returned when an unknown drawing subtype is supplied.
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
class DrawingFormGateIntegrationTest {
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

    private fun <T> getList(
        url: String,
        cookies: List<String>,
        ref: ParameterizedTypeReference<T>,
    ) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headersFor(cookies)), ref)

    // ── Gate test ─────────────────────────────────────────────────────────────

    @Test
    fun `Phase 2-6 Drawing form gate — per-type form lookup, correct approver lists, approval-roles picker`() {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        // ── Project scaffold ───────────────────────────────────────────────────
        val edgs = loginAs(EDGS_CI_USER_ID)
        val project =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Drawing Form Gate ${UUID.randomUUID()}", zoneId = nrZoneId),
                edgs,
                ProjectDetailResponse::class.java,
            ).body!!

        val cao = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/${project.id}/allocate",
            AllocateProjectRequest(ceUserIds = listOf(CE_C_USER_ID)),
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

        // ── Create one DRAWING_APPROVAL activity (shared across drawing types) ─
        val activity =
            post(
                "/api/v1/projects/${project.id}/activities",
                CreateActivityRequest(activityTypeCode = "DRAWING_APPROVAL", name = "Phase 2.6 Drawing Form Gate Activity"),
                dyce1,
                ActivityDetailResponse::class.java,
            ).body!!

        // ─────────────────────────────────────────────────────────────────────
        // Step 2a: SIP drawing → expects 3 approvers: SR_DEN, DY_CE, CE_PLANNING
        // ─────────────────────────────────────────────────────────────────────
        val sipRecord =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = "SIP"),
                dyce1,
                ActivityRecordDetailResponse::class.java,
            ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.CREATED) }.body!!

        val sipApprovers =
            jdbc.queryForList(
                """SELECT approval_designation_code
               FROM drawing_approvers
               WHERE activity_record_id = ?
                 AND NOT is_deleted
               ORDER BY position""",
                String::class.java,
                sipRecord.id,
            )
        assertThat(sipApprovers)
            .`as`("SIP must have exactly 3 approver slots in order: SR_DEN, DY_CE, CE_PLANNING")
            .containsExactly("SR_DEN", "DY_CE", "CE_PLANNING")

        // record_subtype must be set correctly
        val sipSubtype =
            jdbc.queryForObject(
                "SELECT record_subtype FROM activity_records WHERE id = ?",
                String::class.java,
                sipRecord.id,
            )
        assertThat(sipSubtype).`as`("record_subtype for SIP record").isEqualTo("SIP")

        // ─────────────────────────────────────────────────────────────────────
        // Step 2b: GAD_MINOR drawing → expects 2 approvers: DY_CE_BRIDGE, SR_DEN
        // ─────────────────────────────────────────────────────────────────────
        val gadMinorRecord =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = "GAD_MINOR"),
                dyce1,
                ActivityRecordDetailResponse::class.java,
            ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.CREATED) }.body!!

        val gadMinorApprovers =
            jdbc.queryForList(
                """SELECT approval_designation_code
               FROM drawing_approvers
               WHERE activity_record_id = ?
                 AND NOT is_deleted
               ORDER BY position""",
                String::class.java,
                gadMinorRecord.id,
            )
        assertThat(gadMinorApprovers)
            .`as`("GAD_MINOR must have exactly 2 approver slots: DY_CE_BRIDGE, SR_DEN")
            .containsExactly("DY_CE_BRIDGE", "SR_DEN")

        // ─────────────────────────────────────────────────────────────────────
        // Step 2c: TUNNEL_DESIGN → expects 4 approvers: DY_CE_DESIGN, SR_DEN, CE_PLANNING, PCE
        // ─────────────────────────────────────────────────────────────────────
        val tunnelRecord =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = "TUNNEL_DESIGN"),
                dyce1,
                ActivityRecordDetailResponse::class.java,
            ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.CREATED) }.body!!

        val tunnelApprovers =
            jdbc.queryForList(
                """SELECT approval_designation_code
               FROM drawing_approvers
               WHERE activity_record_id = ?
                 AND NOT is_deleted
               ORDER BY position""",
                String::class.java,
                tunnelRecord.id,
            )
        assertThat(tunnelApprovers)
            .`as`("TUNNEL_DESIGN must have exactly 4 approver slots: DY_CE_DESIGN, SR_DEN, CE_PLANNING, PCE")
            .containsExactly("DY_CE_DESIGN", "SR_DEN", "CE_PLANNING", "PCE")

        // ─────────────────────────────────────────────────────────────────────
        // Step 3: Approval-roles picker returns ONLY approval-role designations
        // ─────────────────────────────────────────────────────────────────────
        val designationsResp =
            getList(
                "/api/v1/designations/approval-roles",
                dyce1,
                object : ParameterizedTypeReference<List<DesignationResponse>>() {},
            )
        assertThat(designationsResp.statusCode).isEqualTo(HttpStatus.OK)
        val designations = designationsResp.body!!
        assertThat(designations).isNotEmpty
        assertThat(designations.all { it.isApprovalRole })
            .`as`("Every designation returned by /approval-roles must have isApprovalRole=true")
            .isTrue()
        // Non-approval roles (e.g. ADMIN, SUPER_ADMIN, CE_C, CAO_C) must not appear
        val returnedCodes = designations.map { it.code }.toSet()
        assertThat(returnedCodes).doesNotContain("ADMIN", "SUPER_ADMIN", "CE_C", "CAO_C", "EDGS_CI")

        // ─────────────────────────────────────────────────────────────────────
        // Step 4: Missing recordSubtype → 422
        // ─────────────────────────────────────────────────────────────────────
        val missingSubtypeResp =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = null),
                dyce1,
                Void::class.java,
            )
        assertThat(missingSubtypeResp.statusCode)
            .`as`("Creating a DRAWING_APPROVAL record without recordSubtype must return 422")
            .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)

        // ─────────────────────────────────────────────────────────────────────
        // Step 5: Unknown drawing subtype → 422
        // ─────────────────────────────────────────────────────────────────────
        val unknownSubtypeResp =
            post(
                "/api/v1/activities/${activity.id}/records",
                CreateActivityRecordRequest(recordSubtype = "DOES_NOT_EXIST"),
                dyce1,
                Void::class.java,
            )
        assertThat(unknownSubtypeResp.statusCode)
            .`as`("Creating a DRAWING_APPROVAL record with unknown subtype must return 422")
            .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
    }
}
