### Proposal: The Omni-Reviewer (PR Analysis Roll-Up)

**The Oath**
The Omni-Reviewer assumes the monumental responsibility of serving as the ultimate, unified gatekeeper for code quality. Its purpose is to perform a comprehensive analysis of Pull Requests across 11 distinct cognitive axes—including documentation drift, security vulnerabilities, structural inconsistencies, and cryptic code—simultaneously. It solves the profound scaling problem of "bot fatigue" and webhook timeouts by replacing an army of specialized, noisy agents with a single, highly efficient reviewer. This agent is designed for engineering teams who demand rigorous, multi-dimensional code reviews but refuse to accept delayed CI/CD pipelines or cluttered PR timelines.

As the preserver of truth, it **(1) finds and fixes rotten or misleading code comments**, **(2) detects inconsistencies between API documentation and implementation**, and keeps both **(3) API documentation** and **(4) design documentation in sync with code changes**. As the warden of the codebase, it **(5) analyzes commit history for strange or forbidden patterns**, **(6) summarizes suspicious activity**, **(7) flags cryptic, concealed, or masked code**, and **(8) strictly enforces security best practices**. Finally, as the architectural guide, it **(9) defends against structural inconsistencies**, **(10) warns about downstream breakage**, and **(11) evaluates release notes for completeness and importance alignment**.

It solves the profound scaling problem of "bot fatigue" and webhook timeouts by replacing an army of noisy, specialized agents with one silent, multidimensional reviewer. This agent is designed for engineering teams who demand rigorous, exhaustive code reviews but refuse to accept delayed CI/CD pipelines or cluttered PR timelines.

**The Reagents**
To execute this, the workspace requires a GitHub Integration with "Read & Write" access to Pull Requests and Repository Contents. It relies entirely on the native `@guildai/agents-sdk`, utilizing `gitHubTools` for fetching PR diffs, reading full file states, and posting inline review comments. Crucially, it requires advanced access to `task.llm.generateText` with the explicit capability to enforce **strict JSON output** (Structured Generation). It operates entirely as a serverless webhook responder and does not require a persistent VM or code-execution sandbox.

**The Ritual**
The agent executes via a highly optimized, "Two-Lens" loop triggered by `pull_request` (opened or synchronized) events. 
1. **Context Gathering:** It fetches the PR's `.patch` diffs (to pinpoint the exact changes) alongside the full raw content of the modified files (to provide necessary architectural context).
2. **The Rubric Interrogation:** To prevent "prompt dilution," the agent forces the LLM to evaluate the code against a strict JSON rubric. The prompt commands the LLM to analyze the file across all 11 disciplines (e.g., `documentation_sync`, `security_patterns`, `structural_violations`) and return a JSON object containing either `null` or an actionable `suggestion` for each category.
3. **Execution:** The agent's ES5 loop parses the returned JSON. For every category where the LLM flagged an issue, the agent uses the GitHub API to seamlessly post a native, inline ````suggestion` review comment directly on the offending line of the PR.

**The Proof**
Success is definitively measured by deploying the Omni-Reviewer against a "Gauntlet PR"—a test branch deliberately seeded with a rotten docstring, an exposed security anti-pattern, and a structural violation. A successful test will prove that the agent can identify all three distinct issues in a single execution pass and post three perfectly formatted, actionable inline suggestions without hitting webhook timeout limits. In production, ultimate success is measured by the "Acceptance Rate" of its suggested commits and a measurable decrease in human PR review times.
