package `in`.gov.ir.pia.domain

import `in`.gov.ir.pia.repository.DesignationRepository
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
class DesignationRepositoryIntegrationTest {
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
    lateinit var designationRepository: DesignationRepository

    @Test
    fun `seed produces 36 designations`() {
        assertThat(designationRepository.count()).isEqualTo(36)
    }

    @Test
    fun `findAllByOrderByDisplayOrder returns list in ascending order`() {
        val designations = designationRepository.findAllByOrderByDisplayOrder()
        assertThat(designations).isNotEmpty
        designations.zipWithNext { a, b ->
            assertThat(a.displayOrder).isLessThanOrEqualTo(b.displayOrder)
        }
    }

    @Test
    fun `findAllByIsApprovalRoleTrue returns only approval roles`() {
        val approvalRoles = designationRepository.findAllByIsApprovalRoleTrueOrderByDisplayOrder()
        assertThat(approvalRoles).allSatisfy { designation ->
            assertThat(designation.isApprovalRole).isTrue()
        }
    }

    @Test
    fun `findAllByIsDataEntryRoleTrue returns data entry roles including DY_CE_C`() {
        val dataEntryRoles = designationRepository.findAllByIsDataEntryRoleTrueOrderByDisplayOrder()
        assertThat(dataEntryRoles).anySatisfy { designation ->
            assertThat(designation.code).isEqualTo("DY_CE_C")
        }
    }

    @Test
    fun `DY_CE_C is data entry role and not approval role`() {
        val designation = designationRepository.findById("DY_CE_C")
        assertThat(designation).isPresent
        assertThat(designation.get().isDataEntryRole).isTrue()
        assertThat(designation.get().isApprovalRole).isFalse()
    }
}
