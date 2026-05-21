package `in`.gov.ir.pia.activity

import com.fasterxml.jackson.databind.ObjectMapper
import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
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
 * Phase 1.9 gate test (phasing.md § 1.9):
 *
 *   "A Dy CE/C opens the Record Edit Page.  They fill in village_name and
 *    chainage; 30 seconds later the autosave fires and the PATCH succeeds.
 *    A GET of the record returns the saved data.  A stale-version PATCH
 *    returns 409 Conflict."
 *
 * This test exercises:
 *   1. POST /api/v1/activities/{activityId}/records  → 201, ETag header
 *   2. GET  /api/v1/activity-records/{recordId}      → 200, ETag header, dataJson = {}
 *   3. PATCH /api/v1/activity-records/{recordId}     → 200 with If-Match, persists data, new ETag
 *   4. GET   again                                    → data matches what was PATCHed
 *   5. PATCH with stale version                       → 409 Conflict
 *   6. GET  /api/v1/activities/{activityId}/records  → list includes the record
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class RecordAutosaveIntegrationTest {
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

        // Fixed UUID for the LAND_ACQUISITION_V1 stub form definition (V003_002)
        val LAND_ACQUISITION_FORM_DEF_ID: UUID =
            UUID.fromString("ffffffff-0001-0001-0001-000000000001")
    }

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

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

    private fun headersFor(
        cookies: List<String>,
        extraHeaders: Map<String, String> = emptyMap(),
    ): HttpHeaders {
        val headers = HttpHeaders()
        if (cookies.isNotEmpty()) {
            headers["Cookie"] = cookies.joinToString("; ") { it.substringBefore(";") }
        }
        extraHeaders.forEach { (k, v) -> headers[k] = v }
        return headers
    }

    private fun <T> post(
        url: String,
        body: Any?,
        cookies: List<String>,
        responseType: Class<T>,
    ): org.springframework.http.ResponseEntity<T> =
        restTemplate.postForEntity(
            url,
            HttpEntity(body, headersFor(cookies)),
            responseType,
        )

    // ── Full project lifecycle up to ACTIVE ───────────────────────────────────

    private fun createActiveProject(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val edgsCookies = loginAs(EDGS_CI_USER_ID)
        val createResp =
            post(
                "/api/v1/projects",
                CreateProjectRequest(name = "Autosave Test Project", zoneId = nrZoneId),
                edgsCookies,
                ProjectDetailResponse::class.java,
            )
        assertThat(createResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val projectId = createResp.body!!.id

        val caoCookies = loginAs(CAO_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/allocate",
            AllocateProjectRequest(ceUserId = CE_C_USER_ID),
            caoCookies,
            ProjectDetailResponse::class.java,
        ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.OK) }

        val ceCookies = loginAs(CE_C_USER_ID)
        post(
            "/api/v1/projects/$projectId/assign-dyce",
            AssignDyceRequest(dyceUserIds = listOf(DYCE_1_USER_ID)),
            ceCookies,
            ProjectDetailResponse::class.java,
        ).also {
            assertThat(it.statusCode).isEqualTo(HttpStatus.OK)
            assertThat(it.body!!.lifecycleState).isEqualTo("ACTIVE")
        }

        return projectId
    }

    // ── Gate test ─────────────────────────────────────────────────────────────

    /**
     * Full autosave record lifecycle:
     *  create record → GET → PATCH with form data → GET again → stale PATCH → 409
     */
    @Test
    fun `DyCEC creates record, autosaves data, and stale PATCH returns 409`() {
        val projectId = createActiveProject()
        val dyceCookies = loginAs(DYCE_1_USER_ID)

        // ── Step 1: Create a Land Acquisition activity ────────────────────────
        val activityResp =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(
                    activityTypeCode = "LAND_ACQUISITION",
                    name = "Autosave Test — Phase 1 LA",
                ),
                dyceCookies,
                ActivityDetailResponse::class.java,
            )
        assertThat(activityResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val activityId = activityResp.body!!.id

        // ── Step 2: Create a record; expect 201 and ETag header ───────────────
        val createRecordResp =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(),
                dyceCookies,
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(createRecordResp.statusCode).isEqualTo(HttpStatus.CREATED)
        val record = createRecordResp.body!!
        assertThat(record.projectActivityId).isEqualTo(activityId)
        assertThat(record.formDefinitionId).isEqualTo(LAND_ACQUISITION_FORM_DEF_ID)
        assertThat(record.dataJson.isEmpty).isTrue() // starts as {}
        assertThat(record.recordState).isEqualTo("DRAFT")

        val createETag = createRecordResp.headers.getFirst("ETag")
        assertThat(createETag).isNotNull() // e.g. "\"0\""
        val initialVersion = createETag!!.trim('"').toInt()
        assertThat(initialVersion).isEqualTo(0)

        val recordId = record.id

        // ── Step 3: GET the record — should carry ETag and empty data ─────────
        val getBeforeResp =
            restTemplate.exchange(
                "/api/v1/activity-records/$recordId",
                HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyceCookies)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(getBeforeResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(getBeforeResp.headers.getFirst("ETag")).isEqualTo(createETag)
        assertThat(getBeforeResp.body!!.dataJson.isEmpty).isTrue()

        // ── Step 4: PATCH autosave with form data (simulates 30-second timer) ─
        val patchData =
            objectMapper.readTree(
                """
                {
                  "village_name": "Raipur",
                  "chainage": "42+500",
                  "area_ha": 12.5,
                  "gazette_reference": {
                    "gazette_date": "2024-03-15",
                    "gazette_number": "GZ-2024-0042"
                  }
                }
                """.trimIndent(),
            )
        val patchHeaders =
            headersFor(
                dyceCookies,
                mapOf(
                    "If-Match" to createETag,
                    "Content-Type" to MediaType.APPLICATION_JSON_VALUE,
                ),
            )
        val patchResp =
            restTemplate.exchange(
                "/api/v1/activity-records/$recordId",
                HttpMethod.PATCH,
                HttpEntity(mapOf("dataJson" to patchData), patchHeaders),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(patchResp.statusCode).isEqualTo(HttpStatus.OK)

        val patchETag = patchResp.headers.getFirst("ETag")
        assertThat(patchETag).isNotNull()
        val newVersion = patchETag!!.trim('"').toInt()
        assertThat(newVersion).isEqualTo(initialVersion + 1) // version bumped

        val patchedRecord = patchResp.body!!
        assertThat(patchedRecord.dataJson.get("village_name").asText()).isEqualTo("Raipur")
        assertThat(patchedRecord.dataJson.get("chainage").asText()).isEqualTo("42+500")
        assertThat(patchedRecord.version).isEqualTo(newVersion)

        // ── Step 5: GET again — data must have persisted ──────────────────────
        val getAfterResp =
            restTemplate.exchange(
                "/api/v1/activity-records/$recordId",
                HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyceCookies)),
                ActivityRecordDetailResponse::class.java,
            )
        assertThat(getAfterResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(getAfterResp.headers.getFirst("ETag")).isEqualTo(patchETag)
        assertThat(
            getAfterResp.body!!
                .dataJson
                .get("village_name")
                .asText(),
        ).isEqualTo("Raipur")

        // ── Step 6: Stale PATCH (using the original, now-outdated ETag) ───────
        val staleHeaders =
            headersFor(
                dyceCookies,
                mapOf(
                    "If-Match" to createETag, // old version — should 409
                    "Content-Type" to MediaType.APPLICATION_JSON_VALUE,
                ),
            )
        val staleResp =
            restTemplate.exchange(
                "/api/v1/activity-records/$recordId",
                HttpMethod.PATCH,
                HttpEntity(mapOf("dataJson" to patchData), staleHeaders),
                String::class.java,
            )
        assertThat(staleResp.statusCode).isEqualTo(HttpStatus.CONFLICT)

        // ── Step 7: List records for the activity — must include our record ────
        val listResp =
            restTemplate.exchange(
                "/api/v1/activities/$activityId/records",
                HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyceCookies)),
                Array<ActivityRecordDetailResponse>::class.java,
            )
        assertThat(listResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(listResp.body!!.map { it.id }).containsExactly(recordId)

        // ── Verify DB: data_json persisted correctly ───────────────────────────
        val dbDataJson =
            jdbc.queryForObject(
                "SELECT data_json::text FROM activity_records WHERE id = ?",
                String::class.java,
                recordId,
            )!!
        val dbNode = objectMapper.readTree(dbDataJson)
        assertThat(dbNode.get("village_name").asText()).isEqualTo("Raipur")
        assertThat(dbNode.get("chainage").asText()).isEqualTo("42+500")
    }

    /**
     * Missing If-Match header on PATCH returns 400 Bad Request.
     */
    @Test
    fun `PATCH without If-Match returns 400`() {
        val projectId = createActiveProject()
        val dyceCookies = loginAs(DYCE_1_USER_ID)

        val activityResp =
            post(
                "/api/v1/projects/$projectId/activities",
                CreateActivityRequest(activityTypeCode = "LAND_ACQUISITION", name = "Header Test LA"),
                dyceCookies,
                ActivityDetailResponse::class.java,
            )
        val activityId = activityResp.body!!.id

        post(
            "/api/v1/activities/$activityId/records",
            CreateActivityRecordRequest(),
            dyceCookies,
            ActivityRecordDetailResponse::class.java,
        ).also { assertThat(it.statusCode).isEqualTo(HttpStatus.CREATED) }
        val recordId =
            post(
                "/api/v1/activities/$activityId/records",
                CreateActivityRecordRequest(),
                dyceCookies,
                ActivityRecordDetailResponse::class.java,
            ).body!!.id // create a second to get a fresh ID easily

        // PATCH without If-Match — Spring MVC will return 400 for missing required header
        val noMatchHeaders = headersFor(dyceCookies, mapOf("Content-Type" to MediaType.APPLICATION_JSON_VALUE))
        val badResp =
            restTemplate.exchange(
                "/api/v1/activity-records/$recordId",
                HttpMethod.PATCH,
                HttpEntity(mapOf("dataJson" to objectMapper.createObjectNode()), noMatchHeaders),
                String::class.java,
            )
        assertThat(badResp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
    }
}
