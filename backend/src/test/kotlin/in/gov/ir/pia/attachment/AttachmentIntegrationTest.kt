package `in`.gov.ir.pia.attachment

import `in`.gov.ir.pia.api.SelectUserRequest
import `in`.gov.ir.pia.service.activity.ActivityDetailResponse
import `in`.gov.ir.pia.service.activity.ActivityRecordDetailResponse
import `in`.gov.ir.pia.service.activity.CreateActivityRecordRequest
import `in`.gov.ir.pia.service.activity.CreateActivityRequest
import `in`.gov.ir.pia.service.project.AllocateProjectRequest
import `in`.gov.ir.pia.service.project.AssignDyceRequest
import `in`.gov.ir.pia.service.project.CreateProjectRequest
import `in`.gov.ir.pia.service.project.ProjectDetailResponse
import io.minio.BucketExistsArgs
import io.minio.MakeBucketArgs
import io.minio.MinioClient
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.core.io.ByteArrayResource
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
import org.springframework.util.LinkedMultiValueMap
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.MinIOContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.Duration
import java.util.UUID

/**
 * Attachment integration test — exercises the full upload pipeline with a real
 * ClamAV sidecar and a real MinIO instance (both via Testcontainers).
 *
 * ## What is tested
 *
 * 1. **Clean file** (minimal valid PDF): upload succeeds (HTTP 201).  The
 *    returned [AttachmentDto] has `scanStatus = "CLEAN"`.  A presigned download
 *    URL is returned and resolves without error.
 *
 * 2. **EICAR test signature**: the standard antivirus test string is detected by
 *    ClamAV and rejected with HTTP 422 UNPROCESSABLE_ENTITY.  No row is written
 *    to the `attachments` table and nothing is committed to MinIO.
 *
 * ## ClamAV startup
 *
 * `clamav/clamav:1` bundles its virus definition database in the image, so no
 * freshclam network call is required.  The container is considered ready when its
 * TCP port 3310 is accepting connections; a 3-minute startup timeout accommodates
 * slow CI runners.
 *
 * ## MinIO bucket creation
 *
 * The `pia-attachments` bucket is created in `@BeforeAll` via a direct MinioClient
 * call pointed at the Testcontainer endpoint.  The Spring-managed MinioClient bean
 * uses `DynamicPropertySource`-injected coordinates and therefore also targets the
 * same container.
 *
 * ## Resolves testing.md GAP-001
 *
 * The golden-path test (Phase1GoldenPathIntegrationTest) uses a port-assumption
 * trick for the ClamAV-unavailable gate; this test provides the full INSTREAM
 * protocol coverage using a real scanner.  See `docs/testing.md` § GAP-001.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/data",
    ],
)
class AttachmentIntegrationTest {
    companion object {
        // ── EICAR test signature ──────────────────────────────────────────────
        // Universally recognised by all compliant scanners; safe to embed in
        // source code — it is not a real virus payload, just a detection marker.
        private const val EICAR =
            "X5O!P%@AP[4\\PZX54(P^)7CC)7}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H+H*"

        private const val BUCKET_ATTACHMENTS = "pia-attachments"

        @JvmField
        @Container
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmField
        @Container
        val minio: MinIOContainer = MinIOContainer("minio/minio:RELEASE.2024-12-13T22-19-12Z")

        /**
         * ClamAV sidecar.  Port 3310 is the clamd TCP socket.
         *
         * `CLAMAV_NO_FRESHCLAM=true` disables the freshclam update daemon so the
         * container starts faster in CI (no network call for definition updates;
         * the bundled database is sufficient for EICAR detection).
         *
         * Wait strategy: `forListeningPort()` fires as soon as the port opens, but
         * clamd opens the TCP socket *before* it finishes loading the virus database.
         * During that window every scan returns "OK" — including EICAR.  Instead we
         * wait for the clamd log line "Self checking every 600 seconds" which only
         * appears once all signatures are fully loaded into memory.
         */
        @JvmField
        @Container
        val clamav: GenericContainer<*> =
            GenericContainer("clamav/clamav:1.4")
                .withExposedPorts(3310)
                // Run clamd directly instead of the default entrypoint script that also starts
                // freshclam.  freshclam triggers a database reload in clamd which opens a window
                // where every INSTREAM scan returns "OK" — including EICAR — causing flaky tests.
                // Using withCreateContainerCmdModifier (a Testcontainers API call) avoids the
                // git-bash path-translation problem that occurs when the path is passed via a
                // shell command on Windows.
                .withCreateContainerCmdModifier { cmd ->
                    cmd.withEntrypoint("/usr/sbin/clamd")
                    cmd.withCmd("--foreground")
                }.waitingFor(
                    Wait
                        .forLogMessage(".*Self checking every 600 seconds.*", 1)
                        .withStartupTimeout(Duration.ofMinutes(4)),
                )

        @JvmStatic
        @DynamicPropertySource
        fun overrideProps(registry: DynamicPropertyRegistry) {
            // PostgreSQL
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("spring.flyway.url", postgres::getJdbcUrl)
            registry.add("spring.flyway.user", postgres::getUsername)
            registry.add("spring.flyway.password", postgres::getPassword)
            // MinIO
            registry.add("pia.minio.endpoint") { minio.s3URL }
            registry.add("pia.minio.access-key") { minio.userName }
            registry.add("pia.minio.secret-key") { minio.password }
            registry.add("pia.minio.bucket-attachments") { BUCKET_ATTACHMENTS }
            // ClamAV
            registry.add("pia.clamav.host") { clamav.host }
            registry.add("pia.clamav.port") { clamav.getMappedPort(3310) }
            registry.add("pia.clamav.timeout-ms") { "30000" }
        }

        @JvmStatic
        @BeforeAll
        fun ensureBucket() {
            // Create the attachments bucket in the Testcontainers MinIO instance.
            val client =
                MinioClient
                    .builder()
                    .endpoint(minio.s3URL)
                    .credentials(minio.userName, minio.password)
                    .build()
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(BUCKET_ATTACHMENTS).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(BUCKET_ATTACHMENTS).build())
            }
        }

        val EDGS_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111101")
        val CAO_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111102")
        val CE_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111103")
        val DYCE_USER_ID: UUID = UUID.fromString("11111111-1111-1111-1111-111111111104")
    }

    @Autowired lateinit var restTemplate: TestRestTemplate

    @Autowired lateinit var jdbc: JdbcTemplate

    // ── Test helpers ──────────────────────────────────────────────────────────

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

    private fun uploadFile(
        cookies: List<String>,
        recordId: UUID,
        fileBytes: ByteArray,
        filename: String = "doc.pdf",
    ) = restTemplate.postForEntity(
        "/api/v1/attachments",
        HttpEntity(
            LinkedMultiValueMap<String, Any>().apply {
                add("entityType", "ACTIVITY_RECORD")
                add("entityId", recordId.toString())
                add(
                    "file",
                    HttpEntity(
                        object : ByteArrayResource(fileBytes) {
                            override fun getFilename() = filename
                        },
                        HttpHeaders().apply { contentType = MediaType.APPLICATION_PDF },
                    ),
                )
            },
            headersFor(cookies).apply { contentType = MediaType.MULTIPART_FORM_DATA },
        ),
        AttachmentDto::class.java,
    )

    /**
     * Upload helper that returns the raw response body as a [String].
     * Use this when the expected HTTP status is non-2xx (e.g. 422 for EICAR), because
     * [TestRestTemplate] still tries to deserialise the error body as the requested type and
     * throws [HttpMessageNotReadableException] if the body doesn't match the DTO schema.
     */
    private fun uploadFileRaw(
        cookies: List<String>,
        recordId: UUID,
        fileBytes: ByteArray,
        filename: String = "doc.pdf",
    ) = restTemplate.postForEntity(
        "/api/v1/attachments",
        HttpEntity(
            LinkedMultiValueMap<String, Any>().apply {
                add("entityType", "ACTIVITY_RECORD")
                add("entityId", recordId.toString())
                add(
                    "file",
                    HttpEntity(
                        object : ByteArrayResource(fileBytes) {
                            override fun getFilename() = filename
                        },
                        HttpHeaders().apply { contentType = MediaType.APPLICATION_PDF },
                    ),
                )
            },
            headersFor(cookies).apply { contentType = MediaType.MULTIPART_FORM_DATA },
        ),
        String::class.java,
    )

    /**
     * Creates the minimal project/activity/record scaffolding needed to test
     * attachment upload.  Returns the ID of the created [ActivityRecord].
     */
    private fun scaffoldRecord(): UUID {
        val nrZoneId = jdbc.queryForObject("SELECT id FROM zones WHERE code = 'NR'", UUID::class.java)!!

        val edgs = loginAs(EDGS_USER_ID)
        val project =
            restTemplate
                .postForEntity(
                    "/api/v1/projects",
                    HttpEntity(
                        CreateProjectRequest(name = "Attachment IT ${UUID.randomUUID()}", zoneId = nrZoneId),
                        headersFor(edgs),
                    ),
                    ProjectDetailResponse::class.java,
                ).body!!

        val cao = loginAs(CAO_USER_ID)
        restTemplate.postForEntity(
            "/api/v1/projects/${project.id}/allocate",
            HttpEntity(AllocateProjectRequest(ceUserIds = listOf(CE_USER_ID)), headersFor(cao)),
            ProjectDetailResponse::class.java,
        )

        val ce = loginAs(CE_USER_ID)
        restTemplate.postForEntity(
            "/api/v1/projects/${project.id}/assign-dyce",
            HttpEntity(AssignDyceRequest(dyceUserIds = listOf(DYCE_USER_ID)), headersFor(ce)),
            ProjectDetailResponse::class.java,
        )

        val dyce = loginAs(DYCE_USER_ID)
        val activity =
            restTemplate
                .postForEntity(
                    "/api/v1/projects/${project.id}/activities",
                    HttpEntity(
                        CreateActivityRequest(activityTypeCode = "LAND_ACQUISITION", name = "AT Activity"),
                        headersFor(dyce),
                    ),
                    ActivityDetailResponse::class.java,
                ).body!!

        return restTemplate
            .postForEntity(
                "/api/v1/activities/${activity.id}/records",
                HttpEntity(CreateActivityRecordRequest(), headersFor(dyce)),
                ActivityRecordDetailResponse::class.java,
            ).body!!
            .id
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    @Test
    fun `clean PDF is accepted — ClamAV returns OK and file is stored in MinIO`() {
        val dyce = loginAs(DYCE_USER_ID)
        val recordId = scaffoldRecord()

        // Minimal valid-ish PDF bytes — real ClamAV accepts any non-infected content
        val cleanPdf = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n%%EOF".toByteArray()

        val resp = uploadFile(dyce, recordId, cleanPdf, "gazette-clean.pdf")

        assertThat(resp.statusCode)
            .`as`("Clean PDF must be accepted with 201")
            .isEqualTo(HttpStatus.CREATED)

        val dto = resp.body!!
        assertThat(dto.scanStatus).isEqualTo("CLEAN")
        assertThat(dto.originalFilename).isEqualTo("gazette-clean.pdf")
        assertThat(dto.fileSizeBytes).isEqualTo(cleanPdf.size.toLong())
        assertThat(dto.entityId).isEqualTo(recordId)

        // Verify the row was committed to the database
        val count =
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM attachments WHERE id = ? AND is_deleted = false",
                Int::class.java,
                dto.id,
            )
        assertThat(count).isEqualTo(1)

        // Presigned download URL must be returned without error
        val downloadResp =
            restTemplate.exchange(
                "/api/v1/attachments/${dto.id}/download",
                HttpMethod.GET,
                HttpEntity<Void>(headersFor(dyce)),
                AttachmentDownloadDto::class.java,
            )
        assertThat(downloadResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(downloadResp.body!!.presignedUrl).isNotBlank()
    }

    @Test
    fun `EICAR test signature is detected by ClamAV and upload is rejected with 422`() {
        val dyce = loginAs(DYCE_USER_ID)
        val recordId = scaffoldRecord()

        val eicarBytes = EICAR.toByteArray(Charsets.UTF_8)

        // Use the raw (String body) variant — the 422 error response is not an AttachmentDto
        // and TestRestTemplate would throw HttpMessageNotReadableException if we asked it to
        // deserialise a ProblemDetail JSON as AttachmentDto.
        val resp = uploadFileRaw(dyce, recordId, eicarBytes, "infected.pdf")

        assertThat(resp.statusCode)
            .`as`("EICAR must be rejected with 422 — malware scan FOUND")
            .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)

        // No row should be committed to the database
        val count =
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM attachments WHERE entity_id = ? AND original_filename = 'infected.pdf'",
                Int::class.java,
                recordId,
            )
        assertThat(count)
            .`as`("Infected file must not be committed to the attachments table")
            .isEqualTo(0)
    }
}
