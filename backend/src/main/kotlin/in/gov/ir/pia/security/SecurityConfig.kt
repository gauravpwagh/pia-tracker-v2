package `in`.gov.ir.pia.security

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter

/**
 * Spring Security filter chain configuration.
 *
 * Not profile-gated — the security config must be present in all environments.
 * The [DummyAuthFilter] is injected optionally and is only present in dev/beta.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
class SecurityConfig {
    /**
     * Injected only when the dev or beta profile is active (DummyAuthFilter is
     * annotated @Profile("dev", "beta")). Null in prod.
     */
    @Autowired(required = false)
    private val dummyAuthFilter: DummyAuthFilter? = null

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        // TODO Phase 1.4: re-enable CSRF using CookieCsrfTokenRepository.withHttpOnlyFalse()
        //  so the React frontend can read the XSRF-TOKEN cookie and send it as X-XSRF-TOKEN header.
        http.csrf { it.disable() }

        http.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.ALWAYS) }

        http.formLogin { it.disable() }
        http.httpBasic { it.disable() }

        http.authorizeHttpRequests { auth ->
            auth
                .requestMatchers(
                    "/api/v1/auth/**",
                    "/actuator/**",
                    "/api/v1/openapi.json",
                    "/api/v1/swagger-ui/**",
                    "/error",
                ).permitAll()
                .anyRequest()
                .authenticated()
        }

        http.exceptionHandling {
            it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
        }

        // Add dummy auth filter before the standard username/password filter when available.
        dummyAuthFilter?.let {
            http.addFilterBefore(it, UsernamePasswordAuthenticationFilter::class.java)
        }

        return http.build()
    }
}
