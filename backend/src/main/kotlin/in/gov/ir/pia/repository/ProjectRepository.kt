package `in`.gov.ir.pia.repository

import `in`.gov.ir.pia.domain.project.Project
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

/**
 * JPA repository for [Project].
 *
 * Zone-filtered query methods follow the query-level filter pattern described
 * in `docs/permissions.md` § 4: list methods always constrain to accessible
 * zones, preventing the "200 OK with empty list, 403 on detail" anti-pattern.
 *
 * Detail lookups return null (→ 404) when the project exists but the
 * requesting user's zones don't include the project's zone.  A 403 would
 * reveal that the entity exists — we deliberately avoid that information leak.
 */
interface ProjectRepository : JpaRepository<Project, UUID> {
    /**
     * Returns all non-deleted projects whose zone is in [zoneIds].
     *
     * Used by list endpoints for principals with PROJECT.READ.OWN or
     * PROJECT.READ.ZONE.  Principals with PROJECT.READ.ALL bypass zone
     * filtering in the service layer and call [findAllByIsDeletedFalse].
     */
    @Query(
        "SELECT p FROM Project p WHERE p.zoneId IN :zoneIds AND p.isDeleted = false",
    )
    fun findAllByZoneIdInAndIsDeletedFalse(
        @Param("zoneIds") zoneIds: Set<UUID>,
    ): List<Project>

    /** Returns all non-deleted projects regardless of zone (used for ALL-scope reads). */
    fun findAllByIsDeletedFalse(): List<Project>

    /**
     * Returns the project only if it is non-deleted AND its zone is in [zoneIds].
     *
     * Returns null when the project doesn't exist, is deleted, or belongs to a
     * zone outside the caller's access — the service maps null → 404.
     */
    @Query(
        "SELECT p FROM Project p " +
            "WHERE p.id = :id AND p.zoneId IN :zoneIds AND p.isDeleted = false",
    )
    fun findByIdInZones(
        @Param("id") id: UUID,
        @Param("zoneIds") zoneIds: Set<UUID>,
    ): Project?

    /** Existence check ignoring zone (used internally; service enforces zone). */
    fun findByIdAndIsDeletedFalse(id: UUID): Project?
}
