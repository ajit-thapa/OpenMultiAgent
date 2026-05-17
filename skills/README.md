# Multi-Agent Skills Specifications

> Comprehensive specifications for a production-grade multi-agent system with governance and quality monitoring.

## Overview

This directory contains detailed skill definitions for six specialized agents, plus a meta-agent (`agent-watcher`) that monitors and governs their outputs. Each skill is a standalone, production-ready agent specification with clear identity, purpose, scope, and output contracts.

## Skills Included

| Skill | Version | Purpose | Status |
|-------|---------|---------|--------|
| [doc-generator](#doc-generator) | 1.0.0 | Documentation specialist from source code or natural language | Production-ready |
| [code-reviewer](#code-reviewer) | 1.0.0 | Senior code review engineer with multi-dimensional evaluation | Production-ready |
| [architecture-reviewer](#architecture-reviewer) | 1.0.0 | Principal software architect evaluating system designs | Production-ready |
| [test-writer](#test-writer) | 1.0.0 | QA and test automation engineer generating comprehensive test suites | Production-ready |
| [compliance-reviewer](#compliance-reviewer) | 1.0.0 | Security and regulatory compliance auditor | Production-ready |
| [agent-watcher](#agent-watcher) | 1.0.0 | Meta-agent that monitors and governs all other agents | Production-ready |

## Token Optimization Guide

### Context Caching Strategies

#### 1. Shared Preamble Cache
Inject a single cached block containing:
- Coding standards and style guides (language-specific)
- Framework versions and compatibility matrix
- Security policies and compliance requirements

This reduces per-request tokens by ~500–1000 tokens across all agents.

```markdown
[CACHED]
# Shared Context
- Framework: React 18.x, Node.js 18+
- Auth: JWT (RS256), OAuth 2.0 PKCE
- Compliance: OWASP Top 10, SOC 2, GDPR
```

#### 2. Agent Evaluation Results Reuse
When multiple agents evaluate the same code:
- Store code-reviewer's findings in context
- Have compliance-reviewer reference those findings (avoids re-parsing)
- Save ~300 tokens per downstream agent

#### 3. Tiered Evaluation
- **Tier 1 (Fast)**: compliance-reviewer scans for blocking issues only (policy violations, hardcoded secrets)
- **Tier 2 (Full)**: If Tier 1 passes, run code-reviewer and test-writer in parallel
- **Tier 3 (Governance)**: agent-watcher validates all outputs

Saves ~40% token cost on routine checks.

#### 4. Diff-Only Review
When reviewing PRs:
- Pass only changed lines to code-reviewer, not entire file
- Reduces input tokens by ~70% for large files
- Set context: "Only review lines marked ADDED/MODIFIED"

#### 5. Selective Skill Invocation
```
Decision Tree:
  If (file_type == "test") → test-writer only
  If (file_type == "config" || file_type == "infra") → compliance-reviewer, architecture-reviewer
  If (file_type == "api") → code-reviewer, architecture-reviewer
  If (file_type == "doc") → doc-generator only
  Else → code-reviewer + test-writer
```

Avoids unnecessary skill invocations (~2000 tokens saved per decision).

### Prompt Compression

#### 6. Schema-First Input
Instead of prose, provide structured input:
```yaml
review_target: userService.ts
language: TypeScript
scope: [correctness, security, performance]
exclude: [style, naming, comments]
context: "Handle payment processing; PCI-DSS relevant"
```

Saves ~15% on ambiguity-driven re-reading.

#### 7. Confidence Thresholds
Set agent thresholds to skip verbose explanations:
- `confidence_threshold: 85` → agent provides concise output only
- `confidence_threshold: 60` → agent includes full rationale

#### 8. Output Format Constraints
Limit output tokens:
```
doc-generator: max 2000 tokens
code-reviewer: max 1500 tokens (15 findings max)
architecture-reviewer: max 2000 tokens
test-writer: max 3000 tokens (50 test cases max)
compliance-reviewer: max 2000 tokens
agent-watcher: max 1000 tokens (summary only)
```

### Batch Processing

#### 9. Group Related Reviews
Review 5 files in a single context:
- Pass all 5 files to code-reviewer once
- Agent provides cross-file findings (duplicated logic, shared issues)
- Saves ~60% vs. serial reviews

#### 10. Cache Invalidation Strategy
Refresh shared cache only when:
- Framework version changes
- Compliance requirements update
- Standard library updates

Keep cache active for 7+ days per project.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Input (Code, Spec, or Prompt)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Routing Logic (Skill Decision)           │
│ • Detect input type (code, API, arch, config, test spec)    │
│ • Select 1–3 agents based on input                          │
│ • Set output constraints (token limit, format)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌────────────────┐ ┌─────────────────┐
   │ code-reviewer│ │ doc-generator  │ │ test-writer     │
   └──────────────┘ └────────────────┘ └─────────────────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   agent-watcher (Governance)                │
│ • Accuracy scoring per agent                                │
│ • Conflict detection between agents                         │
│ • Confidence threshold validation                           │
│ • Human escalation for blocking issues                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │ Final Output │
                   │ (Annotated)  │
                   └──────────────┘
```

## Skill File Reference

Each skill is documented in its own file with:
- **Identity** — Name, version, role, compatible platforms
- **Purpose** — What the agent does and what it doesn't
- **System Prompt** — Complete instructions for the agent
- **Inputs** — What kinds of input the agent accepts
- **Outputs** — Output formats and examples
- **Behaviours** — How the agent handles edge cases
- **Constraints** — Limits and boundaries
- **Escalation** — When to involve a human

## Usage Example

### Single-Agent Review (Code)
```
invoke: code-reviewer
input: src/services/paymentService.ts
context: "Payment processor; PCI-DSS in scope"
output_format: structured (findings by severity)
max_tokens: 1500
```

### Multi-Agent Workflow (Full Assessment)
```
1. code-reviewer → identify correctness and security issues
2. test-writer → generate tests for the identified issues
3. compliance-reviewer → verify regulatory alignment
4. agent-watcher → synthesize findings and flag conflicts
output: Consolidated report with remediation roadmap
```

### Governance-Only (Validation)
```
invoke: agent-watcher
input: outputs from 3+ agents
action: detect conflicts, score confidence, escalate if needed
output: system health dashboard + open alerts
```

## Integration Checklist

- [ ] Load all 6 skill definitions into your agent orchestrator
- [ ] Configure agent-watcher as the final output gate
- [ ] Set confidence thresholds per skill (see individual skill files)
- [ ] Enable parallel invocation for independent agents
- [ ] Implement escalation webhook (for blocking findings)
- [ ] Set up rolling accuracy tracking (7-day window)
- [ ] Cache shared context for > 7 days
- [ ] Monitor composite output score (target: 80+/100)

## Support & Maintenance

- **Version Updates**: Skills are versioned independently. Update one skill without affecting others.
- **Baseline Tuning**: Each organization may adjust confidence thresholds and escalation rules based on team maturity.
- **Feedback Loop**: Route agent-watcher outputs back to skill developers for continuous improvement.

## License

All skill specifications are provided as-is for use in multi-agent systems. Adapt freely to your context.
