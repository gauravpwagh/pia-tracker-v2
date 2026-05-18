package `in`.gov.ir.pia.forms

import com.fasterxml.jackson.databind.ObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * Unit tests for [SchemaDiffClassifier].
 *
 * Gate requirement (phasing.md § 1.5):
 *   "The diff classifier correctly labels at least 10 hand-crafted pairs
 *    (5 backwards-compatible, 5 breaking)."
 *
 * We test 12 pairs (6 BC + 6 breaking) to exceed the minimum.
 */
class SchemaDiffClassifierTest {
    private val classifier = SchemaDiffClassifier()
    private val mapper = ObjectMapper()

    private fun schema(json: String) = mapper.readTree(json)

    private fun assertBC(
        old: String,
        new: String,
    ) {
        val result = classifier.classify(schema(old), schema(new))
        assertThat(result)
            .`as`("Expected BackwardsCompatible but got $result")
            .isInstanceOf(SchemaDiffClassifier.Result.BackwardsCompatible::class.java)
    }

    private fun assertBreaking(
        old: String,
        new: String,
        vararg reasonFragments: String,
    ) {
        val result = classifier.classify(schema(old), schema(new))
        assertThat(result)
            .`as`("Expected Breaking but got $result")
            .isInstanceOf(SchemaDiffClassifier.Result.Breaking::class.java)
        val reasons = (result as SchemaDiffClassifier.Result.Breaking).reasons
        for (fragment in reasonFragments) {
            assertThat(reasons.any { it.contains(fragment) })
                .`as`("Expected a reason containing '$fragment', got: $reasons")
                .isTrue()
        }
    }

    // ── Backwards-compatible cases (6) ────────────────────────────────────────

    @Test
    fun `BC-1 adding an optional property is backwards-compatible`() {
        val old = """{"properties":{"name":{"type":"string"}}}"""
        val new = """{"properties":{"name":{"type":"string"},"notes":{"type":"string"}}}"""
        assertBC(old, new)
    }

    @Test
    fun `BC-2 widening maxLength is backwards-compatible`() {
        val old = """{"properties":{"name":{"type":"string","maxLength":128}}}"""
        val new = """{"properties":{"name":{"type":"string","maxLength":256}}}"""
        assertBC(old, new)
    }

    @Test
    fun `BC-3 adding an enum value is backwards-compatible`() {
        val old = """{"properties":{"status":{"type":"string","enum":["DRAFT","ACTIVE"]}}}"""
        val new = """{"properties":{"status":{"type":"string","enum":["DRAFT","ACTIVE","ARCHIVED"]}}}"""
        assertBC(old, new)
    }

    @Test
    fun `BC-4 making a required field optional is backwards-compatible`() {
        val old = """{"required":["name","code"],"properties":{"name":{"type":"string"},"code":{"type":"string"}}}"""
        val new = """{"required":["name"],"properties":{"name":{"type":"string"},"code":{"type":"string"}}}"""
        assertBC(old, new)
    }

    @Test
    fun `BC-5 adding a new defs entry is backwards-compatible`() {
        val old = """{"properties":{"x":{"type":"string"}},"${'$'}defs":{"Addr":{"type":"object"}}}"""
        val new = """{"properties":{"x":{"type":"string"}},"${'$'}defs":{"Addr":{"type":"object"},"Phone":{"type":"string"}}}"""
        assertBC(old, new)
    }

    @Test
    fun `BC-6 relaxing minLength is backwards-compatible`() {
        val old = """{"properties":{"code":{"type":"string","minLength":3}}}"""
        val new = """{"properties":{"code":{"type":"string","minLength":1}}}"""
        assertBC(old, new)
    }

    // ── Breaking cases (6) ────────────────────────────────────────────────────

    @Test
    fun `BR-1 removing a property is breaking`() {
        val old = """{"properties":{"name":{"type":"string"},"code":{"type":"string"}}}"""
        val new = """{"properties":{"name":{"type":"string"}}}"""
        assertBreaking(old, new, "'code' was removed")
    }

    @Test
    fun `BR-2 narrowing maxLength is breaking`() {
        val old = """{"properties":{"name":{"type":"string","maxLength":256}}}"""
        val new = """{"properties":{"name":{"type":"string","maxLength":64}}}"""
        assertBreaking(old, new, "maxLength narrowed")
    }

    @Test
    fun `BR-3 removing an enum value is breaking`() {
        val old = """{"properties":{"status":{"type":"string","enum":["DRAFT","ACTIVE","LEGACY"]}}}"""
        val new = """{"properties":{"status":{"type":"string","enum":["DRAFT","ACTIVE"]}}}"""
        assertBreaking(old, new, "enum values removed")
    }

    @Test
    fun `BR-4 making an optional field required is breaking`() {
        val old = """{"required":["name"],"properties":{"name":{"type":"string"},"code":{"type":"string"}}}"""
        val new = """{"required":["name","code"],"properties":{"name":{"type":"string"},"code":{"type":"string"}}}"""
        assertBreaking(old, new, "'code' was added to 'required'")
    }

    @Test
    fun `BR-5 removing a defs entry is breaking`() {
        val old = """{"properties":{},"${'$'}defs":{"Addr":{"type":"object"},"Phone":{"type":"string"}}}"""
        val new = """{"properties":{},"${'$'}defs":{"Addr":{"type":"object"}}}"""
        assertBreaking(old, new, "'Phone' was removed")
    }

    @Test
    fun `BR-6 changing a property type is breaking`() {
        val old = """{"properties":{"count":{"type":"string"}}}"""
        val new = """{"properties":{"count":{"type":"integer"}}}"""
        assertBreaking(old, new, "type changed")
    }
}
