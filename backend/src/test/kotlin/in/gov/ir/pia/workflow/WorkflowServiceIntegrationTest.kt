package `in`.gov.ir.pia.workflow

import `in`.gov.ir.pia.repository.WorkflowHistoryRepository
import `in`.gov.ir.pia.security.PiaPrincipal
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

/**
 * Integration tests for [WorkflowServiceImpl].
 *
 * Gate requirement (phasing.md § 1.6):
 *   "Integration test walking the full submit → verify → authenticate path +
 *    sent-back path, verifying history rows and cached record_state."
 *
 * Uses a real Postgres container with the full Flyway migration suite.
 * Tests run inside a transaction that is rolled back after each test, so
 * each test starts from a clean seed-only state.
 *
 * Actors:
 *   - [dyceActor]  — EMP004 / DY_CE_C → ROLE_DY_CE_C
 *   - [nodalActor] — EMP005 / DY_CE_C — elevated to ROLE_NODAL_DY_CE_C for testing
 *   - [ceActor]    — EMP003 / CE_C     → ROLE_CE_C
 *
 * Note: EMP005's userId is used for the NODAL actor to satisfy the
 * actor_user_id FK in workflow_history (the FK is on users.id, not on roles).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
@Transactional
class WorkflowServiceIntegrationTest {
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
            // application.yml defines a separate spring.flyway.* block — must override it too
            registry.add("spring.flyway.url", postgres::getJdbcUrl)
            registry.add("spring.flyway.user", postgres::getUsername)
            registry.add("spring.flyway.password", postgres::getPassword)
        }

        // ── Actors ────────────────────────────────────────────────────────────
        // userId must match a row in users (seeded by V001_004) to satisfy
        // the actor_user_id FK on workflow_history.

        /** EMP004 — Sunita Patel, DY_CE_C → ROLE_DY_CE_C */
        val dyceActor =
            PiaPrincipal(
                userId = UUID.fromString("11111111-1111-1111-1111-111111111104"),
                name = "Sunita Patel",
                email = "sunita.patel@nr.railnet.gov.in",
                designationCode = "DY_CE_C",
                primaryZoneId = null,
                primaryDivisionId = null,
                crossZoneIds = emptySet(),
                roleCodes = setOf("ROLE_DY_CE_C"),
                permissions = emptySet(),
                isSuperAdmin = false,
            )

        /**
         * EMP005 — Mohammed Asif, DY_CE_C — acting as NODAL for test purposes.
         * In production, ROLE_NODAL_DY_CE_C is granted per-project; here we
         * set it directly on the PiaPrincipal to exercise the role guard.
         */
        val nodalActor =
            PiaPrincipal(
                userId = UUID.fromString("11111111-1111-1111-1111-111111111105"),
                name = "Mohammed Asif",
                email = "mohammed.asif@nr.railnet.gov.in",
                designationCode = "DY_CE_C",
                primaryZoneId = null,
                primaryDivisionId = null,
                crossZoneIds = emptySet(),
                roleCodes = setOf("ROLE_NODAL_DY_CE_C"),
                permissions = emptySet(),
                isSuperAdmin = false,
            )

        /** EMP003 — Amit Verma, CE_C → ROLE_CE_C */
        val ceActor =
            PiaPrincipal(
                userId = UUID.fromString("11111111-1111-1111-1111-111111111103"),
                name = "Amit Verma",
                email = "amit.verma@nr.railnet.gov.in",
                designationCode = "CE_C",
                primaryZoneId = null,
                primaryDivisionId = null,
                crossZoneIds = emptySet(),
                roleCodes = setOf("ROLE_CE_C"),
                permissions = emptySet(),
                isSuperAdmin = false,
            )
    }

    @Autowired lateinit var workflowService: WorkflowService

    @Autowired lateinit var historyRepo: WorkflowHistoryRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Creates an activity_records row and returns its id.
     *
     * V006 added NOT NULL FK columns (project_activity_id, form_definition_id,
     * created_by_user_id, and the project_activities parent itself).  This
     * helper creates the minimum required parent rows in the correct FK order,
     * then inserts the activity_records row.  All rows are rolled back by the
     * surrounding @Transactional test boundary.
     *
     * Seeded reference data used:
     *   - zones.code='NR'                 (V001_001)
     *   - users.id=EMP001 (EDGS_CI)       (V001_004)
     *   - users.id=EMP004 (DY_CE_C)       (V001_004)
     *   - activity_types.code='LAND_ACQUISITION' (V003_001)
     *   - form_definitions.id=LAND_ACQ_V1 (V003_002)
     */
    private fun createActivityRecord(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!
        val edgsUserId = UUID.fromString("11111111-1111-1111-1111-111111111101")   // EMP001 EDGS_CI
        val dyceUserId = UUID.fromString("11111111-1111-1111-1111-111111111104")   // EMP004 DY_CE_C
        val formDefId  = UUID.fromString("ffffffff-0001-0001-0001-000000000001")   // LAND_ACQUISITION_V1

        // 1. Create a minimal project
        val projectId = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO projects (id, name, project_code, zone_id, lifecycle_state, created_by_user_id)
            VALUES (?, 'WF Test Project', ?, ?, 'ACTIVE', ?)
            """.trimIndent(),
            projectId,
            "WFT-${projectId.toString().take(8)}",
            nrZoneId,
            edgsUserId,
        )

        // 2. Create a project_activity under that project
        val activityId = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO project_activities
                (id, project_id, activity_type_code, name, primary_dyce_user_id,
                 default_form_definition_id, created_by_user_id)
            VALUES (?, ?, 'LAND_ACQUISITION', 'WF Test LA', ?, ?, ?)
            """.trimIndent(),
            activityId,
            projectId,
            dyceUserId,
            formDefId,
            dyceUserId,
        )

        // 3. Create the activity_record
        val recordId = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO activity_records
                (id, project_activity_id, form_definition_id, data_json,
                 schema_version_at_save, record_state, created_by_user_id)
            VALUES (?, ?, ?, '{}'::jsonb, 1, 'DRAFT', ?)
            """.trimIndent(),
            recordId,
            activityId,
            formDefId,
            dyceUserId,
        )
        return recordId
    }

    /** Reads record_state from the activity_records cache table. */
    private fun readRecordState(id: UUID): String? =
        jdbc.queryForObject(
            "SELECT record_state FROM activity_records WHERE id = ?",
            String::class.java,
            id,
        )

    // ── happy path ────────────────────────────────────────────────────────────

    /**
     * Full forward path: DRAFT → SUBMITTED → VERIFIED → AUTHENTICATED.
     *
     * Verifies:
     *   - currentState advances correctly at each step
     *   - 3 history rows are written (oldest first)
     *   - activity_records.record_state cache is updated at each transition
     *   - isSlaBreached returns false for a freshly-advanced instance
     */
    @Test
    fun happyPath_submitVerifyAuthenticate() {
        val recordId = createActivityRecord()
        val instance = workflowService.start("RECORD_STANDARD_V1", "ACTIVITY_RECORD", recordId)

        assertThat(instance.currentState.code).isEqualTo("DRAFT")
        assertThat(workflowService.currentState("ACTIVITY_RECORD", recordId)?.code).isEqualTo("DRAFT")

        // 1. submit
        val afterSubmit = workflowService.transition(instance.id, "submit", dyceActor)
        assertThat(afterSubmit.currentState.code).isEqualTo("SUBMITTED_FOR_VERIFICATION")
        assertThat(readRecordState(recordId)).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        // 2. verify
        val afterVerify = workflowService.transition(instance.id, "verify", nodalActor)
        assertThat(afterVerify.currentState.code).isEqualTo("VERIFIED")
        assertThat(readRecordState(recordId)).isEqualTo("VERIFIED")

        // 3. authenticate
        val afterAuth = workflowService.transition(instance.id, "authenticate", ceActor)
        assertThat(afterAuth.currentState.code).isEqualTo("AUTHENTICATED")
        assertThat(readRecordState(recordId)).isEqualTo("AUTHENTICATED")

        // History: 3 rows in chronological order
        val history = workflowService.history(instance.id)
        assertThat(history).hasSize(3)
        assertThat(history[0].toState.code).isEqualTo("SUBMITTED_FOR_VERIFICATION")
        assertThat(history[1].toState.code).isEqualTo("VERIFIED")
        assertThat(history[2].toState.code).isEqualTo("AUTHENTICATED")

        // sentBackMarker must be false on a forward-only path
        assertThat(afterAuth.sentBackMarker).isFalse()

        // SLA: AUTHENTICATED has no SLA → isSlaBreached returns false
        assertThat(workflowService.isSlaBreached(instance.id)).isFalse()
    }

    // ── sent-back paths ───────────────────────────────────────────────────────

    /**
     * Send-back at Dy CE/C level:
     * DRAFT → SUBMITTED → SENT_BACK_TO_DYCE → SUBMITTED → VERIFIED → AUTHENTICATED
     */
    @Test
    fun sentBackToDyce_resubmitAndComplete() {
        val recordId = createActivityRecord()
        val instance = workflowService.start("RECORD_STANDARD_V1", "ACTIVITY_RECORD", recordId)

        workflowService.transition(instance.id, "submit", dyceActor)

        // send_back requires a comment
        val afterSendBack =
            workflowService.transition(
                instance.id,
                "send_back",
                nodalActor,
                comment = "Missing land parcels in exhibit A",
            )
        assertThat(afterSendBack.currentState.code).isEqualTo("SENT_BACK_TO_DYCE")
        assertThat(afterSendBack.sentBackMarker).isTrue()
        assertThat(readRecordState(recordId)).isEqualTo("SENT_BACK_TO_DYCE")

        // resubmit
        workflowService.transition(instance.id, "resubmit", dyceActor)
        workflowService.transition(instance.id, "verify", nodalActor)
        workflowService.transition(instance.id, "authenticate", ceActor)

        val history = workflowService.history(instance.id)
        assertThat(history).hasSize(5)

        // The send_back history entry must carry the comment
        val sendBackEntry = history.first { it.toState.code == "SENT_BACK_TO_DYCE" }
        assertThat(sendBackEntry.comment).isEqualTo("Missing land parcels in exhibit A")

        assertThat(readRecordState(recordId)).isEqualTo("AUTHENTICATED")
    }

    /**
     * Send-back at Nodal Dy CE/C level:
     * DRAFT → SUBMITTED → VERIFIED → SENT_BACK_TO_NODAL → VERIFIED → AUTHENTICATED
     */
    @Test
    fun sentBackToNodal_reverifyAndAuthenticate() {
        val recordId = createActivityRecord()
        val instance = workflowService.start("RECORD_STANDARD_V1", "ACTIVITY_RECORD", recordId)

        workflowService.transition(instance.id, "submit", dyceActor)
        workflowService.transition(instance.id, "verify", nodalActor)

        val afterSendBack =
            workflowService.transition(
                instance.id,
                "send_back",
                ceActor,
                comment = "Verification incomplete — missing survey map",
            )
        assertThat(afterSendBack.currentState.code).isEqualTo("SENT_BACK_TO_NODAL")
        assertThat(afterSendBack.sentBackMarker).isTrue()

        workflowService.transition(instance.id, "re_verify", nodalActor)
        workflowService.transition(instance.id, "authenticate", ceActor)

        val history = workflowService.history(instance.id)
        assertThat(history).hasSize(5)
        assertThat(history.last().toState.code).isEqualTo("AUTHENTICATED")
    }

    // ── guard: invalid action ─────────────────────────────────────────────────

    @Test
    fun invalidAction_throwsWorkflowTransitionNotAllowedException() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )

        assertThatThrownBy {
            workflowService.transition(instance.id, "nonexistent_action", dyceActor)
        }.isInstanceOf(WorkflowTransitionNotAllowedException::class.java)
            .hasMessageContaining("nonexistent_action")
    }

    @Test
    fun verifyFromDraft_throwsTransitionNotAllowed() {
        // "verify" is only valid from SUBMITTED_FOR_VERIFICATION, not DRAFT
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )

        assertThatThrownBy {
            workflowService.transition(instance.id, "verify", nodalActor)
        }.isInstanceOf(WorkflowTransitionNotAllowedException::class.java)
    }

    // ── guard: role check ─────────────────────────────────────────────────────

    @Test
    fun wrongRole_throwsInsufficientRoleException() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        workflowService.transition(instance.id, "submit", dyceActor) // advance to SUBMITTED

        // DY_CE_C tries to verify — only NODAL_DY_CE_C is allowed
        assertThatThrownBy {
            workflowService.transition(instance.id, "verify", dyceActor)
        }.isInstanceOf(InsufficientRoleException::class.java)
            .hasMessageContaining("ROLE_NODAL_DY_CE_C")
    }

    @Test
    fun superAdmin_bypassesRoleCheck() {
        val superAdmin = dyceActor.copy(isSuperAdmin = true)
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        workflowService.transition(instance.id, "submit", dyceActor)

        // Super-admin has only ROLE_DY_CE_C but should bypass the ROLE_NODAL_DY_CE_C check
        val result = workflowService.transition(instance.id, "verify", superAdmin)
        assertThat(result.currentState.code).isEqualTo("VERIFIED")
    }

    // ── guard: comment required ───────────────────────────────────────────────

    @Test
    fun sendBackWithoutComment_throwsMissingCommentException() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        workflowService.transition(instance.id, "submit", dyceActor)

        assertThatThrownBy {
            // send_back from SUBMITTED requires a comment
            workflowService.transition(instance.id, "send_back", nodalActor, comment = null)
        }.isInstanceOf(MissingCommentException::class.java)
    }

    @Test
    fun sendBackWithBlankComment_throwsMissingCommentException() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        workflowService.transition(instance.id, "submit", dyceActor)

        assertThatThrownBy {
            workflowService.transition(instance.id, "send_back", nodalActor, comment = "   ")
        }.isInstanceOf(MissingCommentException::class.java)
    }

    // ── currentState ──────────────────────────────────────────────────────────

    @Test
    fun currentState_returnsNullForUnknownEntity() {
        val state = workflowService.currentState("ACTIVITY_RECORD", UUID.randomUUID())
        assertThat(state).isNull()
    }

    @Test
    fun currentState_returnsCorrectStateAfterTransition() {
        val entityId = UUID.randomUUID()
        workflowService.start("RECORD_STANDARD_V1", "PROJECT", entityId)

        val state = workflowService.currentState("PROJECT", entityId)
        assertThat(state?.code).isEqualTo("DRAFT")
    }

    // ── SLA ───────────────────────────────────────────────────────────────────

    @Test
    fun isSlaBreached_falseForFreshlyCreatedInstance() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        // DRAFT has no SLA configured → always false
        assertThat(workflowService.isSlaBreached(instance.id)).isFalse()
    }

    @Test
    fun isSlaBreached_falseForRecentlyAdvancedInstance() {
        val instance =
            workflowService.start(
                "RECORD_STANDARD_V1",
                "PROJECT",
                UUID.randomUUID(),
            )
        workflowService.transition(instance.id, "submit", dyceActor)
        // SUBMITTED_FOR_VERIFICATION has SLA 7 days; just transitioned → not breached
        assertThat(workflowService.isSlaBreached(instance.id)).isFalse()
    }

    // ── activity_records cache ────────────────────────────────────────────────

    @Test
    fun activityRecordCacheIsUpdatedOnEachTransition() {
        val recordId = createActivityRecord()
        val instance = workflowService.start("RECORD_STANDARD_V1", "ACTIVITY_RECORD", recordId)

        assertThat(readRecordState(recordId)).isEqualTo("DRAFT")

        workflowService.transition(instance.id, "submit", dyceActor)
        assertThat(readRecordState(recordId)).isEqualTo("SUBMITTED_FOR_VERIFICATION")

        workflowService.transition(instance.id, "verify", nodalActor)
        assertThat(readRecordState(recordId)).isEqualTo("VERIFIED")
    }

    @Test
    fun nonActivityRecord_doesNotTouchCacheTable() {
        // PROJECT entity type must NOT update activity_records
        val projectId = UUID.randomUUID()
        val instance = workflowService.start("RECORD_STANDARD_V1", "PROJECT", projectId)

        val countBefore =
            jdbc.queryForObject("SELECT count(*) FROM activity_records", Long::class.java)!!

        workflowService.transition(instance.id, "submit", dyceActor)

        val countAfter =
            jdbc.queryForObject("SELECT count(*) FROM activity_records", Long::class.java)!!

        assertThat(countAfter).isEqualTo(countBefore)
    }
}
