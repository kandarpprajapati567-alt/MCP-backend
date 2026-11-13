import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpecialistRoleGuidance,
  getSpecialistRoleContract,
  resolveSpecialistAgentRole,
  SPECIALIST_AGENT_ROLES,
} from "../../../src/server/agent/specialist-roles";

test("defines the seven specialist responsibilities in dependency order", () => {
  assert.deepEqual(SPECIALIST_AGENT_ROLES, [
    "planner", "research", "coding", "execution", "analysis", "memory", "synthesizer",
  ]);
  for (const role of SPECIALIST_AGENT_ROLES) {
    const contract = getSpecialistRoleContract(role);
    assert.ok(contract);
    assert.ok(contract.responsibility.length > 40);
    assert.ok(contract.mustNot.length >= 2);
  }
});

test("resolves common specialist labels without changing unknown custom roles", () => {
  assert.equal(resolveSpecialistAgentRole("Research specialist"), "research");
  assert.equal(resolveSpecialistAgentRole("software_engineer"), "coding");
  assert.equal(resolveSpecialistAgentRole("Tool Executor"), "execution");
  assert.equal(resolveSpecialistAgentRole("My custom assistant"), "general");
  assert.equal(getSpecialistRoleContract("My custom assistant"), null);
});

test("role guidance preserves the runtime as the permission authority", () => {
  const guidance = buildSpecialistRoleGuidance("Execution Agent");
  assert.match(guidance, /registered, assigned, schema-valid capabilities/u);
  assert.match(guidance, /permissions, approvals, and execution limits remain enforced by the runtime/u);
});

test("unknown roles receive safe generic guidance without invented capabilities", () => {
  const guidance = buildSpecialistRoleGuidance("custom");
  assert.match(guidance, /Do not infer extra permissions/u);
  assert.doesNotMatch(guidance, /shell|filesystem|network/u);
});
