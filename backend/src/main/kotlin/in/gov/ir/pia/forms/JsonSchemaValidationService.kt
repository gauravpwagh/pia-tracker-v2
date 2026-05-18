package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.JsonNode
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.springframework.stereotype.Service

/**
 * Validates a [JsonNode] data payload against a JSON Schema Draft 2020-12
 * definition using the networknt json-schema-validator library.
 *
 * The schema node is compiled on each call — caching by form definition ID
 * will be added in a later phase when performance profiling shows it matters.
 */
@Service
class JsonSchemaValidationService {
    private val factory: JsonSchemaFactory =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)

    /**
     * Validates [data] against [schemaJson].
     *
     * @return an empty list when [data] is valid; a non-empty list of
     *   human-readable error messages when it violates the schema.
     */
    fun validate(
        schemaJson: JsonNode,
        data: JsonNode,
    ): List<String> {
        val schema = factory.getSchema(schemaJson)
        return schema
            .validate(data)
            .map { it.message }
            .sorted() // deterministic order for tests
    }
}
