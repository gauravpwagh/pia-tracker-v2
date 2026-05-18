package `in`.gov.ir.pia.domain

import `in`.gov.ir.pia.repository.ZoneRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration::class)
@Testcontainers
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/migration,classpath:db/data"])
class ZoneRepositoryIntegrationTest {
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
    lateinit var zoneRepository: ZoneRepository

    @Test
    fun `seed produces exactly 17 zones`() {
        assertThat(zoneRepository.count()).isEqualTo(17)
    }

    @Test
    fun `findAllByIsActiveTrueOrderByDisplayOrder returns all zones in order`() {
        val zones = zoneRepository.findAllByIsActiveTrueOrderByDisplayOrder()
        assertThat(zones).hasSize(17)
        assertThat(zones.first().displayOrder).isEqualTo(1)
    }

    @Test
    fun `findByCode NR returns Northern Railway`() {
        val zone = zoneRepository.findByCode("NR")
        assertThat(zone).isNotNull
        assertThat(zone!!.name).isEqualTo("Northern Railway")
    }

    @Test
    fun `findByCode unknown code returns null`() {
        val zone = zoneRepository.findByCode("UNKNOWN")
        assertThat(zone).isNull()
    }
}
