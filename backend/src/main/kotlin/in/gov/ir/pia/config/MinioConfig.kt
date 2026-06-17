package `in`.gov.ir.pia.config

import io.minio.MinioClient
import io.minio.PiaMinioClient
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@ConfigurationProperties(prefix = "pia.minio")
data class MinioProperties(
    val endpoint: String = "http://minio:9000",
    val accessKey: String = "miniopia",
    val secretKey: String = "change-me",
    val bucketAttachments: String = "pia-attachments",
    val bucketQuarantine: String = "pia-quarantine",
)

@Configuration
@EnableConfigurationProperties(MinioProperties::class)
class MinioConfig {
    @Bean
    fun minioClient(props: MinioProperties): PiaMinioClient {
        val base =
            MinioClient
                .builder()
                .endpoint(props.endpoint)
                .credentials(props.accessKey, props.secretKey)
                .build()
        return PiaMinioClient(base)
    }
}
