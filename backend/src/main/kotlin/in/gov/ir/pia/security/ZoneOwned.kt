package `in`.gov.ir.pia.security

import java.util.UUID

/**
 * Marker interface for domain objects that carry a zone identifier.
 *
 * Implemented by entities (e.g. Project) whose data is scoped to a zone.
 * [PiaPermissionEvaluator] uses this to enforce zone-level access checks when
 * the calling [hasPermission] overload receives the target domain object.
 */
interface ZoneOwned {
    val zoneId: UUID?
}
