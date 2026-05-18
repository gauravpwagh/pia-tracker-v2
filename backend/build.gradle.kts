import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

// Flyway v10 uses ServiceLoader to discover database modules. Both the JDBC driver
// and the flyway-database-postgresql module must be in the BUILD classloader (same
// as the Flyway Gradle plugin) for the discovery to work. Project runtimeClasspath
// alone is insufficient.
buildscript {
    repositories { mavenCentral() }
    dependencies {
        classpath("org.flywaydb:flyway-database-postgresql:10.20.1")
        classpath("org.postgresql:postgresql:42.7.4")
    }
}

plugins {
    kotlin("jvm") version "2.0.10"
    kotlin("plugin.spring") version "2.0.10"
    kotlin("plugin.jpa") version "2.0.10"
    id("org.springframework.boot") version "3.4.0"
    id("io.spring.dependency-management") version "1.1.6"
    id("org.flywaydb.flyway") version "10.20.1"
    id("nu.studer.jooq") version "9.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.7"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
}

group = "in.gov.ir"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

extra["springModulithVersion"] = "1.3.0"
val networkntJsonSchemaVersion = "1.5.3"
val bucket4jVersion = "8.10.1"
val minioVersion = "8.5.13"
val jooqVersion = "3.19.15"
val poiVersion = "5.3.0"
val jqwikVersion = "1.9.1"
val testcontainersVersion = "1.20.3"
val mockkVersion = "1.13.13"

dependencies {
    // Spring Boot starters
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("org.springframework.boot:spring-boot-starter-jooq")

    // Kotlin
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")

    // Postgres + Flyway
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // jOOQ
    implementation("org.jooq:jooq:$jooqVersion")
    jooqGenerator("org.postgresql:postgresql")

    // JSON Schema validation
    implementation("com.networknt:json-schema-validator:$networkntJsonSchemaVersion")

    // JSON Patch (for audit diffs)
    implementation("com.flipkart.zjsonpatch:zjsonpatch:0.4.16")

    // OpenAPI
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0")

    // Rate limiting
    implementation("com.bucket4j:bucket4j-core:$bucket4jVersion")

    // MinIO client
    implementation("io.minio:minio:$minioVersion")

    // Excel
    implementation("org.apache.poi:poi:$poiVersion")
    implementation("org.apache.poi:poi-ooxml:$poiVersion")

    // HTML sanitization (for markdown comments)
    implementation("org.owasp.antisamy:antisamy:1.7.7")

    // Spring Modulith (optional but useful for package boundaries)
    implementation("org.springframework.modulith:spring-modulith-starter-core")

    // Observability
    implementation("io.micrometer:micrometer-registry-prometheus")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("io.mockk:mockk:$mockkVersion")
    testImplementation("com.ninja-squad:springmockk:4.0.2")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:minio:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("net.jqwik:jqwik:$jqwikVersion")
    testImplementation("org.awaitility:awaitility:4.2.2")
    testImplementation("org.assertj:assertj-core")
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.modulith:spring-modulith-bom:${property("springModulithVersion")}")
    }
}

springBoot {
    mainClass.set("in.gov.ir.pia.PiaApplicationKt")
}

tasks.withType<KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

tasks.withType<Test> {
    useJUnitPlatform {
        includeEngines("junit-jupiter", "jqwik")
    }
    systemProperty("user.timezone", "Asia/Kolkata")
    testLogging {
        events("passed", "skipped", "failed")
    }
    // Integration tests are slow; split them
    if (name == "test") {
        exclude("**/*IntegrationTest.class")
    }
}

// Separate task for integration tests
val integrationTest =
    task<Test>("integrationTest") {
        description = "Runs integration tests (Testcontainers)."
        group = "verification"
        useJUnitPlatform()
        include("**/*IntegrationTest.class")
        shouldRunAfter("test")
        systemProperty("user.timezone", "Asia/Kolkata")
        // Testcontainers on Windows/Docker Desktop: Testcontainers' shaded docker-java defaults
        // to API v1.24 which Docker Desktop 29.x no longer supports (MinAPIVersion=1.40).
        // "api.version" is the shaded docker-java system-property key; DOCKER_HOST / docker.host
        // are handled by EnvironmentAndSystemPropertyClientProviderStrategy.
        environment("DOCKER_HOST", System.getenv("DOCKER_HOST") ?: "tcp://localhost:2375")
        systemProperty("docker.host", System.getenv("DOCKER_HOST") ?: "tcp://localhost:2375")
        systemProperty("api.version", "1.47")
    }

// Separate task for property tests
val propertyTest =
    task<Test>("propertyTest") {
        description = "Runs property-based tests (jqwik)."
        group = "verification"
        useJUnitPlatform { includeEngines("jqwik") }
        include("**/*PropertyTest.class")
    }

flyway {
    driver = "org.postgresql.Driver"
    url = System.getenv("FLYWAY_URL") ?: "jdbc:postgresql://localhost:5432/pia"
    user = System.getenv("FLYWAY_USER") ?: "pia_migrator"
    password = System.getenv("FLYWAY_PASSWORD") ?: "pia_migrator"
    schemas = arrayOf("public")
    locations =
        arrayOf(
            "classpath:db/migration",
            "classpath:db/data",
        )
}

// Seed task — runs SeedRunner main()
tasks.register<JavaExec>("seedData") {
    group = "application"
    description = "Run reference + demo seed."
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("in.gov.ir.pia.seed.SeedRunner")
    args("--demo")
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
    config.setFrom("$projectDir/config/detekt/detekt.yml")
}

ktlint {
    version.set("1.3.1")
    filter {
        exclude { it.file.path.contains("generated/") }
    }
}
