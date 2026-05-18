package `in`.gov.ir.pia

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.modulith.Modulithic

/**
 * PIA Tracker — Pre-Investment Activities tracking for Indian Railways construction projects.
 *
 * See /CLAUDE.md and /docs/architecture.md for orientation.
 */
@SpringBootApplication
@Modulithic(
    systemName = "PIA Tracker",
    sharedModules = ["security", "audit"],
)
class PiaApplication

fun main(args: Array<String>) {
    runApplication<PiaApplication>(*args)
}
