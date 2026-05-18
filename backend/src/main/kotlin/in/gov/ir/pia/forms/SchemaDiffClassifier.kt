package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.JsonNode
import org.springframework.stereotype.Component

/**
 * Classifies the difference between two JSON Schema versions as either
 * backwards-compatible or breaking.
 *
 * Rules (from `docs/forms.md` § 6):
 *
 * **Backwards-compatible** — existing records and consumers are unaffected:
 * - Adding an optional property (present in new `properties`, absent from `required`)
 * - Widening `maxLength` (new value > old value)
 * - Widening `minLength` (new value < old value)
 * - Adding a value to an `enum` array (new array is a superset)
 * - Making a required field optional (removed from `required`)
 * - Adding a new `$defs` entry
 *
 * **Breaking** — existing records may fail validation or be misread:
 * - Removing a property
 * - Adding a property to `required` that was not previously required
 * - Narrowing `maxLength` (new value < old value)
 * - Narrowing `minLength` (new value > old value)
 * - Removing an enum value (existing records may hold it)
 * - Removing a `$defs` entry
 * - Changing a property's `type`
 *
 * This classifier operates on the top-level `properties` and `required`
 * arrays only — nested object schemas within each property are not recursed
 * in Phase 1.5 (added in a later phase when the full schema is in use).
 */
@Component
class SchemaDiffClassifier {
    sealed class Result {
        data object BackwardsCompatible : Result()

        data class Breaking(
            val reasons: List<String>,
        ) : Result()
    }

    fun classify(
        oldSchema: JsonNode,
        newSchema: JsonNode,
    ): Result {
        val reasons = mutableListOf<String>()

        val oldProps = oldSchema.path("properties")
        val newProps = newSchema.path("properties")

        val oldRequired = requiredSet(oldSchema)
        val newRequired = requiredSet(newSchema)

        val oldPropKeys = propKeys(oldProps)
        val newPropKeys = propKeys(newProps)

        // ── Removed properties ────────────────────────────────────────────────
        for (key in oldPropKeys - newPropKeys) {
            reasons += "Property '$key' was removed"
        }

        // ── Newly required fields ─────────────────────────────────────────────
        for (key in newRequired - oldRequired) {
            if (key in oldPropKeys) {
                reasons += "Property '$key' was added to 'required' (breaking: existing records may not have it)"
            }
        }

        // ── Per-property constraint changes ───────────────────────────────────
        for (key in oldPropKeys.intersect(newPropKeys)) {
            val oldProp = oldProps.path(key)
            val newProp = newProps.path(key)

            // Type change
            val oldType = oldProp.path("type").asText("")
            val newType = newProp.path("type").asText("")
            if (oldType.isNotEmpty() && newType.isNotEmpty() && oldType != newType) {
                reasons += "Property '$key': type changed from '$oldType' to '$newType'"
            }

            // maxLength narrowed
            val oldMax = oldProp.path("maxLength").asInt(-1)
            val newMax = newProp.path("maxLength").asInt(-1)
            if (oldMax >= 0 && newMax >= 0 && newMax < oldMax) {
                reasons += "Property '$key': maxLength narrowed from $oldMax to $newMax"
            }

            // minLength widened (more restrictive)
            val oldMin = oldProp.path("minLength").asInt(-1)
            val newMin = newProp.path("minLength").asInt(-1)
            if (oldMin >= 0 && newMin >= 0 && newMin > oldMin) {
                reasons += "Property '$key': minLength widened (more restrictive) from $oldMin to $newMin"
            }

            // Enum values removed
            val oldEnum = enumValues(oldProp)
            val newEnum = enumValues(newProp)
            if (oldEnum.isNotEmpty() && newEnum.isNotEmpty()) {
                val removed = oldEnum - newEnum
                if (removed.isNotEmpty()) {
                    reasons += "Property '$key': enum values removed: $removed"
                }
            }
        }

        // ── $defs entries removed ─────────────────────────────────────────────
        val oldDefs = defKeys(oldSchema)
        val newDefs = defKeys(newSchema)
        for (key in oldDefs - newDefs) {
            reasons += "\$defs entry '$key' was removed"
        }

        return if (reasons.isEmpty()) Result.BackwardsCompatible else Result.Breaking(reasons)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun propKeys(propertiesNode: JsonNode): Set<String> =
        if (propertiesNode.isMissingNode) {
            emptySet()
        } else {
            propertiesNode.fieldNames().asSequence().toSet()
        }

    private fun requiredSet(schema: JsonNode): Set<String> {
        val req = schema.path("required")
        return if (req.isArray) req.map { it.asText() }.toSet() else emptySet()
    }

    private fun enumValues(prop: JsonNode): Set<String> {
        val e = prop.path("enum")
        return if (e.isArray) e.map { it.asText() }.toSet() else emptySet()
    }

    private fun defKeys(schema: JsonNode): Set<String> {
        val defs = schema.path("\$defs").let { if (it.isMissingNode) schema.path("definitions") else it }
        return if (defs.isMissingNode) {
            emptySet()
        } else {
            defs.fieldNames().asSequence().toSet()
        }
    }
}
