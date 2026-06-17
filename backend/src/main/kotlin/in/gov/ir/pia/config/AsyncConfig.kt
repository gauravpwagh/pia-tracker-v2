package `in`.gov.ir.pia.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import java.util.concurrent.Executor

/**
 * Enables Spring's @Async support and wires a named thread pool for
 * background tasks (export job processing, future scheduled workers).
 *
 * The "piaAsync" executor is used by [ExportJobProcessor] and any other
 * @Async beans.  Pool size is intentionally small — exports are I/O-bound
 * and we don't want to starve the servlet container's thread pool.
 */
@Configuration
@EnableAsync
@EnableScheduling
class AsyncConfig {
    @Bean(name = ["piaAsync"])
    fun piaAsyncExecutor(): Executor {
        val executor = ThreadPoolTaskExecutor()
        executor.corePoolSize = 2
        executor.maxPoolSize = 8
        executor.queueCapacity = 50
        executor.setThreadNamePrefix("pia-async-")
        executor.initialize()
        return executor
    }
}
