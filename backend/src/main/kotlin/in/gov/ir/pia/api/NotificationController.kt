package `in`.gov.ir.pia.api

import `in`.gov.ir.pia.notification.NotificationService
import `in`.gov.ir.pia.notification.NotificationSummaryDto
import `in`.gov.ir.pia.security.PiaPrincipal
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Bell-badge notification endpoints.
 *
 *   GET    /api/v1/notifications              — list latest 30 + unread count
 *   POST   /api/v1/notifications/{id}/read   — mark one read
 *   POST   /api/v1/notifications/read-all    — mark all read
 */
@RestController
class NotificationController(
    private val notificationService: NotificationService,
) {
    @GetMapping("/api/v1/notifications")
    @PreAuthorize("isAuthenticated()")
    fun list(
        @RequestParam(defaultValue = "30") limit: Int,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ): NotificationSummaryDto = notificationService.listForUser(principal.userId, limit.coerceIn(1, 100))

    @PostMapping("/api/v1/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("isAuthenticated()")
    fun markRead(
        @PathVariable id: UUID,
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        notificationService.markRead(id, principal.userId)
    }

    @PostMapping("/api/v1/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("isAuthenticated()")
    fun markAllRead(
        @AuthenticationPrincipal principal: PiaPrincipal,
    ) {
        notificationService.markAllRead(principal.userId)
    }
}
