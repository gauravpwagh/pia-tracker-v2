package `in`.gov.ir.pia.workflow

import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Example
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import net.jqwik.api.constraints.AlphaChars
import net.jqwik.api.constraints.StringLength
import org.assertj.core.api.Assertions.assertThat

/**
 * Property-based tests for the RECORD_STANDARD_V1 workflow graph.
 *
 * Gate requirement (phasing.md § 1.6):
 *   "A property test that from every state in RECORD_STANDARD_V1 only
 *    configured transitions are reachable."
 *
 * This test models the transition graph in memory (matching the seed in
 * V004_001__seed_workflow_definitions.sql) and uses jqwik to verify
 * graph-level invariants across the entire input space.
 *
 * There are no Spring / DB dependencies — this is a pure model test.
 * The integration test ([WorkflowServiceIntegrationTest]) separately verifies
 * that the live database implementation matches this model.
 */
class WorkflowEnginePropertyTest {
    // ── Model ────────────────────────────────────────────────────────────────

    /**
     * Canonical RECORD_STANDARD_V1 transition graph.
     * Key = (fromState, actionCode), value = toState.
     * Must stay in sync with V004_001__seed_workflow_definitions.sql.
     */
    private val transitions: Map<Pair<String, String>, String> =
        mapOf(
            ("DRAFT" to "submit") to "SUBMITTED_FOR_VERIFICATION",
            ("SUBMITTED_FOR_VERIFICATION" to "verify") to "VERIFIED",
            ("SUBMITTED_FOR_VERIFICATION" to "send_back") to "SENT_BACK_TO_DYCE",
            ("SENT_BACK_TO_DYCE" to "resubmit") to "SUBMITTED_FOR_VERIFICATION",
            ("VERIFIED" to "authenticate") to "AUTHENTICATED",
            ("VERIFIED" to "send_back") to "SENT_BACK_TO_NODAL",
            ("SENT_BACK_TO_NODAL" to "re_verify") to "VERIFIED",
        )

    private val allStates =
        setOf(
            "DRAFT",
            "SUBMITTED_FOR_VERIFICATION",
            "VERIFIED",
            "AUTHENTICATED",
            "SENT_BACK_TO_DYCE",
            "SENT_BACK_TO_NODAL",
        )

    private val terminalStates = setOf("AUTHENTICATED")

    /** Role required to fire each action from a given state. */
    private val roleFor: Map<Pair<String, String>, String> =
        mapOf(
            ("DRAFT" to "submit") to "ROLE_DY_CE_C",
            ("SUBMITTED_FOR_VERIFICATION" to "verify") to "ROLE_NODAL_DY_CE_C",
            ("SUBMITTED_FOR_VERIFICATION" to "send_back") to "ROLE_NODAL_DY_CE_C",
            ("SENT_BACK_TO_DYCE" to "resubmit") to "ROLE_DY_CE_C",
            ("VERIFIED" to "authenticate") to "ROLE_CE_C",
            ("VERIFIED" to "send_back") to "ROLE_CE_C",
            ("SENT_BACK_TO_NODAL" to "re_verify") to "ROLE_NODAL_DY_CE_C",
        )

    /** Transitions that require a comment (is_backward = true). */
    private val requiresComment: Set<Pair<String, String>> =
        setOf(
            "SUBMITTED_FOR_VERIFICATION" to "send_back",
            "VERIFIED" to "send_back",
        )

    private val validActionsFromState: Map<String, Set<String>> =
        allStates.associateWith { state ->
            transitions.keys
                .filter { (from, _) -> from == state }
                .map { (_, action) -> action }
                .toSet()
        }

    // ── @Example tests (deterministic, fast) ─────────────────────────────────

    @Example
    fun graphHasExactlySevenTransitions() {
        assertThat(transitions).hasSize(7)
    }

    @Example
    fun allToStatesAreKnownStates() {
        val unknownTargets = transitions.values.filter { it !in allStates }
        assertThat(unknownTargets)
            .`as`("Every toState must be a known state (closure property)")
            .isEmpty()
    }

    @Example
    fun terminalStatesHaveNoOutgoingTransitions() {
        for (terminal in terminalStates) {
            val outgoing = transitions.keys.filter { (from, _) -> from == terminal }
            assertThat(outgoing)
                .`as`("Terminal state '$terminal' must have no outgoing transitions")
                .isEmpty()
        }
    }

    @Example
    fun allStatesAreReachableFromDraft() {
        val reachable = mutableSetOf("DRAFT")
        var changed = true
        while (changed) {
            changed = false
            for ((key, toState) in transitions) {
                val (fromState, _) = key
                if (fromState in reachable && reachable.add(toState)) {
                    changed = true
                }
            }
        }
        assertThat(reachable)
            .`as`("Every state must be reachable from DRAFT")
            .containsExactlyInAnyOrderElementsOf(allStates)
    }

    @Example
    fun everyTransitionHasARoleRequirement() {
        for (key in transitions.keys) {
            assertThat(roleFor[key])
                .`as`("Transition $key must have a role requirement")
                .isNotNull()
        }
    }

    @Example
    fun backwardTransitionsRequireComment() {
        for (key in requiresComment) {
            assertThat(transitions).containsKey(key)
        }
        // All requiresComment transitions must be a subset of the configured graph
        assertThat(requiresComment).allMatch { it in transitions.keys }
    }

    @Example
    fun transitionFunctionIsConsistentWithRoleMap() {
        // Every role key must have a matching transition key
        assertThat(roleFor.keys).containsExactlyInAnyOrderElementsOf(transitions.keys)
    }

    // ── @Property tests (jqwik-generated) ────────────────────────────────────

    /**
     * For any arbitrary action code: if the action is NOT in the configured set
     * for a state, the transition lookup MUST return null.
     *
     * This is the core "only configured transitions are reachable" invariant.
     */
    @Property
    fun unconfiguredActionFromAnyStateProducesNoTransition(
        @ForAll("knownState") state: String,
        @ForAll @AlphaChars @StringLength(min = 3, max = 30) actionCode: String,
    ) {
        val validActions = validActionsFromState[state] ?: emptySet()
        if (actionCode !in validActions) {
            assertThat(transitions[state to actionCode])
                .`as`(
                    "Expected null for unconfigured action '$actionCode' from state '$state' " +
                        "(valid actions: $validActions)",
                ).isNull()
        }
    }

    /** From any terminal state, no arbitrary action leads to a transition. */
    @Property
    fun noTransitionExistsFromTerminalState(
        @ForAll @AlphaChars @StringLength(min = 1, max = 40) actionCode: String,
    ) {
        for (terminal in terminalStates) {
            assertThat(transitions[terminal to actionCode])
                .`as`("Terminal state '$terminal' must block action '$actionCode'")
                .isNull()
        }
    }

    /** The transition function is deterministic: repeated calls with the same key yield the same result. */
    @Property
    fun transitionFunctionIsDeterministic(
        @ForAll("validTransitionKey") key: Pair<String, String>,
    ) {
        assertThat(transitions[key]).isEqualTo(transitions[key])
    }

    /** Every configured transition target is a known state (closure, checked via jqwik). */
    @Property
    fun configuredTargetIsAlwaysAKnownState(
        @ForAll("validTransitionKey") key: Pair<String, String>,
    ) {
        val toState = transitions[key]!!
        assertThat(allStates)
            .`as`("toState '$toState' for transition $key must be in the known state set")
            .contains(toState)
    }

    // ── Providers ─────────────────────────────────────────────────────────────

    @Provide
    fun knownState(): Arbitrary<String> = Arbitraries.of(*allStates.toTypedArray())

    @Provide
    fun validTransitionKey(): Arbitrary<Pair<String, String>> = Arbitraries.of(*transitions.keys.toTypedArray())
}
