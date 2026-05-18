package `in`.gov.ir.pia.domain

import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration::class)
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AuditLogImmutabilityIntegrationTest {
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
    }

    @Autowired
    lateinit var jdbc: JdbcTemplate

    private fun insertAuditRow() {
        jdbc.execute(
            """
            INSERT INTO audit_log (action, entity_type, row_hash, at)
            VALUES ('TEST_ACTION', 'TEST_ENTITY', 'testhash12345678', NOW())
            """.trimIndent(),
        )
    }

    @Test
    fun `UPDATE on audit_log is rejected by trigger`() {
        insertAuditRow()
        assertThatThrownBy {
            jdbc.execute("UPDATE audit_log SET action = 'TAMPERED' WHERE action = 'TEST_ACTION'")
        }.isInstanceOf(DataAccessException::class.java)
            .hasMessageContaining("audit_log is append-only")
    }

    @Test
    fun `DELETE on audit_log is rejected by trigger`() {
        insertAuditRow()
        assertThatThrownBy {
            jdbc.execute("DELETE FROM audit_log WHERE action = 'TEST_ACTION'")
        }.isInstanceOf(DataAccessException::class.java)
            .hasMessageContaining("audit_log is append-only")
    }
}
