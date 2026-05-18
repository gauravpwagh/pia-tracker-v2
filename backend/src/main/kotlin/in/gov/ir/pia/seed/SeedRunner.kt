package `in`.gov.ir.pia.seed

/**
 * Reference + demo data seeder. Invoked by `make seed` (./gradlew seedData).
 * Phase 1.2 adds the real seed content; this stub satisfies the Gradle task registration.
 */
object SeedRunner {
    @JvmStatic
    fun main(args: Array<String>) {
        val demo = args.contains("--demo")
        println("PIA Tracker seed starting (demo=$demo) — not yet implemented, skipping.")
    }
}
