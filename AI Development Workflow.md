# AI Development Workflow

This is an opinionated way to setup and work with Claude Code and Cursor. In particular, this takes a Claude Code first approach, prioritizing and optimizing for majority auto-generated code, using Cursor only when we have to.

For people who are new to working with AI and configuring AI harnesses, use this as your starting point.

For people who are already deep in the space, use this as a source of ideas to alter your current workflow. 

**For everyone, please surface your ideas,** we can add and adapt this document collectively over time. Being a fast moving space, there is no industry-accepted set of best practices so it’s up to us collectively to create one for Lazer. 💪

<aside>
🎯

Your goal should be to not manually write code at all.

When you run into a problem where you have to manually make an edit or write an implementation in the way that you want it, write down a note of what the problem was and what your edit was. Look for patterns to identify where gaps in your AI harness config or your prompting are. 

</aside>

# Concepts

These are some concepts that are important to understand to set the foundation for the rest of the doc. 

### New Mindset

The mindset that you are working with should be that you are working with amnesiac engineers who understand best practices and how to work according a set of conventions, but need a constant set of reference docs each time you start a conversation with them. It’s up to you to define the vision, plan the architecture and review the output while keeping the context of the project in mind. 

> Note how this is different than the “interns” analogy from before. Model capabilities have evolved to a point where you can reliably depend on their output to adapt to your needs.
> 

In particular, you will have to be responsible for the less-obvious mistakes like downstream effects, impacts on the user, and how a particular change fits into the larger plan for the project. Review the thinking alongside the code. 

With your guidance, your AI agents will execute on the vision within the parameters you set as if you were the one writing the code yourself. If the agents deviate from what you had in mind, it is up to you to reconfigure the agents or your prompt to get to the result that you want.

### Context is Everything

The single most important skill to have in effective management of AI agents is in managing the context window. LLMs only have a finite context window and we want to dedicate as much of that context window to the code as possible. Most of the work of configuring an AI harness is in organizing and managing context in a way to maximize effective context use. 

When you are delegating a task to an agent, it is up to you to make sure that it has all the information it needs to build to your vision. This includes all relevant examples, guardrails, instructions, and goals. Nowadays, If you're correcting AI output repeatedly, the problem is usually the context the agent has access to through your prompt and harness config, not the model.

### Progressive Disclosure

This is the key idea in context management and effective AI development workflows. Your goal should be to set up your project in a way that the agent only pulls in information that it needs when it needs it and no more. This means that you should not put everything into one file and instead split things up and make use of the different configuration features to effectively organize information.

These include:

- CLAUDE.md - The always-on baseline. Claude reads this at the start of every session and it stays in context permanently, so every line here has a cost. This is where you put things Claude needs to know for every task.
- Rules - Modular instruction files that load conditionally based on what Claude is working on. Think of rules as CLAUDE.md split by concern, one file per topic, loaded only when relevant.
- Skills - On-demand knowledge and task templates. The full skill content only loads into context when invoked. This is where you put large reference material like framework guides, design system docs, migration playbooks, etc.
- Subagents - Fully isolated context windows. When Claude spawns a subagent, it gets a fresh context that doesn't inherit your conversation history. The subagent does its work (explore, review, research) and returns only a summary. Instead of the main agent reading 50 files and filling your context with exploration noise, a subagent does that in its own context window and the main agent gets back a paragraph of only the relevant info it needs.
- MCPs - A way to get dynamic info from third-party sources. Best used for things like tickets, logs or other live info. This consumes a lot of context so use sparingly.

Non-context related features include:

- Hooks - Deterministic automation that doesn't touch the context window at all. Hooks fire at lifecycle events (before a tool runs, after a file edit, on session start) and execute shell commands. Where everything above is about what Claude knows, hooks are about what Claude must do.
- Commands - Pre-defined slash commands you can invoke manually. While this is still relevant for Cursor, it’s been superseded in Claude Code. In Claude Code, you can use Skills the same as Commands before and if you find yourself needing a complex series of commands, then that’s a signal for subagents instead.

### Working Style

When working with Claude Code and Cursor together, this is how you should think about the two tools:

- Claude Code - you are able to “set it and forget it”, letting it run and build larger chunks of work with you giving instruction then reviewing at the end.
- Cursor - the pair programmer, you are still making manual edits and Cursor pairs with you to build.

When building, you should 

1. Reach for Claude Code first to build out your features. 
2. Only when you absolutely have to, you can reach for Cursor to do hands-on development with AI assistance.

When you are finding yourself manually editing or coding, you should note down why this is, as it’s a signal that your AI harness configuration can be improved. 

# Project Harness Setup

Every project’s AI harness must be checked into git (whenever the client allows). The entire engineering team should be working with the same harness. If a change is needed, that change should be propagated to everyone. The goal is for the entire team to have consistent AI generation. 

It is not unreasonable, in fact expected, to spend several hours configuring your project for AI use. Every project should have it’s own harness. Do not just blindly copy and paste from past projects or online examples, use them for inspiration then customize it for the project.

It is also recommended to lean on Claude Code to create these files for you so that it can take in the context of your project and alter its output accordingly. 

You should actively keep the harness up-to-date and regularly maintain it. If a feature impacts these files, for example introducing a new convention or library, the PR should contain updates to these files as well. 

Everything in your development setup should be used regularly and actively provide value, otherwise you are just burning tokens with no gain. Don’t add MCPs, plugins, skills, etc. as a “just in case”. 

### CLAUDE.md

- Keep it under 500 lines, this is included with every session so is the most “expensive” out of the features.
- Tell Claude about your subagents, skills, and rules: what exists, when to use each one, and that it should outline their usage in every plan it generates. This is the "table of contents" for your harness.
- Include compaction priorities, tell Claude what to preserve when context gets summarized. Without this, important details get lost during auto-compaction.
- Tell Claude to push back when an approach seems wrong rather than blindly implementing, and to suggest CLAUDE.md improvements when it discovers undocumented patterns. This makes your harness self-improving.
- You can have different CLAUDE.md files in nested folders in your project for cases where you might be working within a monorepo. The same rules of keeping this file minimal and using progressive disclosure apply.

### Rules

- One rule file per concern (e.g. `testing.md`, `api-design.md`, `security.md`, `styling.md`). Don't dump everything into one file.
- Use the `paths` parameter to scope the rule to only relevant files.
    - Your React conventions should only load when Claude touches `.tsx` files, your API rules only when it's in your `/routes` directory.
    - Un-scoped rules load every session like CLAUDE.md, avoid that unless the rule is truly universal.
- Rules are the right place for coding standards, language-specific conventions, and framework patterns.
- Organize into subdirectories for larger projects (`frontend/`, `backend/`, `infra/`).
- These should be your Cursor rules too. Keep the same content in `.cursor/rules/*.mdc` with matching scopes, or have a Cursor subagent sync them.

### Subagents

- Subagents are best for work that can be done independently and also involves a large amount of context. The advantage is that it is an agent with it’s own context window that the main agent you are interacting with will spin up, query and only get the relevant info back in its context window.
- If the task involves reading a lot of files and can be done independent of the main task, it should be a subagent. For example with code review, exploration and research.
- There are multiple ways to spawn and work with subagents
    - Ad-hoc - you can tell the main agent you are working with to spawn subagents focused on some subtask part of your prompt.
        - Be as explicit in your instructions as possible for the subagent when using it this way. Ideally define the task for the subagent and the expected response the main agent should get back.
        - If you are finding yourself repeating instructions across your sessions for ad-hoc agents, that’s a signal that it’s worth it to define a specialist agent.
    - Specialists - defined in `.claude/agents/` with a dedicated system prompt, tool restrictions, and optionally a different model. These are clear reusable roles that have specific instructions and constraints that you want enforced each time.
        - Note these inherit your CLAUDE.md so you don’t need to duplicate that.
    - Skills - When you set `context: fork` on a skill, the skill content becomes the task prompt invoking a subagent. Elaborated more below in the Skills section.
- When you are creating specialist subagents, it’s recommended to do so by using the `/agents` flow where you can define the instructions for automatically generating a subagent.
- Agent Teams are a new feature in Claude Code, these work in a similar way by spawning a set of subagents but in this mode, the subagents converse with the main agent as well as each other while actively collaborating on a shared task list.
    - These are only really useful at the moment for read-heavy use like discovery, review and document generation. Feature development can be done with less tokens and time with a well configured Claude Code setup in most cases.
    - This is still an experimental feature, not recommended for most cases, especially since this can burn through tokens without significant gain (7x normal use). Leave the setting off unless you have a usecase you are actively using this for.

### Skills

- Skills are knowledge sources or instructions that only get loaded into context when needed. Organizing information is the most obvious usecase but Skills can also run as a subagent and even invoke other scripts.
    - Skills in general can be a very powerful feature, recommended that you read more into it to see what other usecases it can enable (links in resources below).
- SKILL.md files should be kept under 500 lines. Use the same principles of progressive disclosure here, use the file as a table of contents for the rest of the skill.
- This is where your large knowledge sources live, framework guides, design system documentation, migration playbooks. If your app depends on a third-party integration or framework, it will be good to store that as a skill.
    - In comparison to rules, a general rule of thumb can be “rules for conventions, skills for capabilities”.
- You can use a skill like a command by running `/skill` , you can also parameterize this with `$ARGUMENTS` so you can run `/migrate-table users` or similar.
    - Set `context: fork` on task-oriented skills (deploy, migrate, generate) so they run in an isolated subagent and don't pollute your main context.
- Set `disable-model-invocation: true` on skills you only want to trigger manually.
- Skills can also include and execute scripts. This can help with generating diagrams, doing data analysis or any other programmatic usecase.

### Hooks

- Hook into the Claude Code lifecycle to call a bash script to help with things like auto-running formatting or programmatically blocking access to certain commands or files.
- It is recommended that you have linting and formatting as part of your hook definition so it runs after edits. If you are doing TDD, you can also have test running as a hook which can help the agent get into a self-fixing loop.
- Consider whether a hook should be in your Claude/Cursor definition or Husky (or similar) definition so it can cover manual uses too. For example, pre-commit and pre-push steps should be a non-AI hook.
- Don't over-hook. Every hook that fires inside the Claude loop adds latency. If you're not sure whether something should be a hook or a CLAUDE.md instruction, start with CLAUDE.md and only promote to a hook when you find Claude ignoring it.

### MCPs

- Lets agents connect to external services like GitHub, Sentry, databases, and browsers. This is quite expensive in practice.
    - Every MCP server adds its full set of tool definitions to every single request. A few servers can easily consume 10-20K tokens of context.
- Documentation MCPs like Context7 is good for occasional lookups but If you find yourself frequently looking up the same external documentation, create a skill for it instead.
    - MCP servers for frequent documentation lookups are one of the worst context-to-value tradeoffs you can make.
- Use this feature sparingly. The sweet spot for MCP is live, dynamic data that can't be cached into a skill. Real-time error streams, tickets, database state, browser interactions. If the data is static or slow-changing, it belongs in a skill, not an MCP server.
- The exception is the Shopify MCP. If you work in commerce, you should have this MCP installed.

### Plugins

- Plugins are bundles that package skills, subagents, hooks, and MCP servers into a single installable unit. They are distributed through marketplaces, which are essentially registries (GitHub repos, git URLs, or local directories) that host collections of plugins.
    - Think of plugins as the distribution mechanism. Everything a plugin provides (skills, agents, hooks, MCP servers) works the same as if you had configured it directly in your project. The difference is that plugins let you install and manage these things as a unit rather than copy-pasting files around.
- Use `/plugin` to browse, install, enable, disable, and uninstall plugins. Plugins generally should be scoped to the project and shared with the team.
- Be selective about what you install. Each plugin's hooks, MCP servers, and skills add to your context and processing overhead. The same principle as MCPs applies here: if you're not actively using it, it's costing you tokens for no benefit. Don't install a marketplace's worth of plugins "just in case."
- Be very careful with third-party plugins. Plugins are a security risk since they can include hooks that execute arbitrary shell commands, MCP servers that run processes, and skills that can read and modify your codebase. Anthropic does not control or verify what third-party plugins contain.

### Other Notes

- Check your settings.json to ensure you are not allowing dangerous operations.
- You should be explicitly denying access to env or production config files with secrets.
- Be aware of the model that you are using, don’t just use Opus for everything including trivial changes.
- You can use `/context` to debug your context window use.

### Meta Concepts

These are meta concepts that is recommended to implement on every project as they have been universally helpful.

**Librarian**

This is recommended to keep context on project conventions and goals.

- Have a designated Skill or `docs/` folder to document the project, how features work, what conventions are, how data flows, any gotchas, and any other context relevant to the project.
    - This is both for agents to use and new engineers to read when onboarding.
- Have a designated librarian subagent that is invoked with every major feature addition or update to always keep the project info up to date and current.
- Every feature addition or update should include updates to the project info. Looking at the diffs here in a PR can give context on what the change was and help to uncover some downstream effects or non-obvious problems.
- Your CLAUDE.md should have the explicit instruction to always inform the librarian about major feature additions or updates and it must keep the project info skill or docs folder up to date.

**Harness Improver**

This is recommended to continuously improve your Claude Code and Cursor configuration.

- Have a skill for Claude Code and Cursor documentation and best practices.
    - Two separate skills instead of combined into one.
- Create a subagent for harness improvements, designated to always look to optimize and improve the project harness setup, particularly after a major implementation or change.
- Your CLAUDE.md should have the explicit instruction to always inform this agent about Claude Code changes or the user expressing a preference or some sort of systematic request while working.

**Cursor Sync**

Because we are taking a Claude Code first approach. This is recommended to ensure Cursor behaviour doesn’t drift from Claude Code behaviour.

- Create a subagent tasked with keeping the cursor configuration up to date with the claude code configuration.
- Your CLAUDE.md should have the instruction to always call this subagent after a change to the Claude Code configuration.

# Prompting

This is an area that everyone thinks is easy, however there is a difference between how experienced engineers and junior engineers structure their prompts for the best results. 

Claude can read your codebase, but it can't read your mind. The most common source of bad results isn't poor prompt formatting; it's unstated assumptions.

You don't need to fill in a formal template every time. But before you hit Enter, it's worth a quick mental scan: is there anything I know about this task that Claude can't infer from the your harness and the code alone?

- **Always use plan mode first** for any non-trivial change.
- Screenshots can be your best friend, give context to what a design looks like or what the current state of the UI is.
    - When capturing a screenshot, capture only the relevant area of the screen that relates to the task. Don’t just capture your entire desktop.
- Over-specify your prompts. Make sure the agent knows everything it needs to know to implement what you want to implement, in the way that you want it done.
    - A general rule of thumb is that the length of your prompt should be proportional to the complexity of the task. A one-liner makes sense for a quick fix, but not a major feature implementation.
- Verbalize your internal thoughts as you are thinking through a change, don’t just assume the agent will be able to come to the same conclusions as you or think in the same way.
- Every new change or feature should have a fresh conversation to keep the context focused on what is actively being worked on. Use `/clear`
- A reference mental checklist to run through is:
    - Goal - what is the single concrete outcome?
    - Context - what files, patterns, skills are relevant? What subagents should it invoke and how?
    - Constraints - what boundaries exist? what files should it not touch? what commands should it not run?
    - Examples - are there examples in the codebase or that you can provide to steer the approach.
    - Steps - is there an order you want the implementation to happen in.
    - Verification - how should the agent check it’s work, are there particular things you want it to double check at the end.
- Some common patterns for reference:
    - Implementation - Point to existing patterns, specify verification, describe exactly how you want it to work and what files that this should impact.
    - Bug fix - Describe the symptom, the likely location for where the cause is, what fixed means, paste in the error trace, take a screenshot, describe what you tried already.
    - Exploration - Define what you need to find, what are all the areas to check, invoke subagents to be used in parallel, define the format you want it to return to you in.
    - Refactoring - Specify what’s changing and what must be preserved, detail what functionality must be preserved, give history on why something was implemented in a particular way in the first place.
    - Meta-Prompting - Get the agent to write the prompt for you before executing, encourage it to ask you questions for clarifications and interrogate you.
- Some other tips
    - If you find yourself repeatedly correcting the same type of mistake across prompts, it's a harness problem. Encode the fix into your CLAUDE.md, a rule, or a skill so it's handled automatically.
    - If you are finding yourself refining the requirements of the task as you work through a problem, it may be better to start fresh with a clear set of new requirements. It’s better to iterate on implementation rather than requirements.

# Review

- **You own everything that ships.** Treat every diff like a PR with your name on it (because it is). AI-generated code should be reviewed more carefully than human code. AI output can be confidently wrong in ways that look plausible at a glance.
- Have a dedicated review agent to check for quality, consistency, edge cases, and downstream effects in its own context. This catches things you'll miss when you're deep in implementation mode.
- Use different models to review. The model that wrote the code has blind spots. Run your review agent on a different model. A second perspective catches a surprising amount.
    - A workflow can be: implement in Claude Code and use Cursor agents to review.
- Interrogate the reasoning. When something looks unusual or overly complex, don't just accept it. Ask Claude why it implemented something a particular way.
- When output is fundamentally wrong, re-prompt. Don't manually rewrite the whole thing. If you're making extensive edits, that's a signal your instructions were insufficient or your harness is misconfigured.
- Track your corrections. Every time you have to manually edit AI output, note what the correction was and why. If a pattern emerges, that's a signal to update your harness. The goal is to never make the same correction thrice.
- Watch for the common AI failure modes:
    - Downstream effects are not accounted for. AI doesn't hold your full mental model of the system. A change to a shared utility, a model field, or an API contract can break consumers Claude doesn't know about. Trace the blast radius yourself.
    - Needle-in-a-haystack bugs can be introduced. AI-generated code can introduce subtle issues buried in otherwise correct-looking output. These don't show up in a quick scan. Read carefully, especially in concurrency, auth, and resource management.
    - Agents can still result in overly complex abstractions, wrapper classes, and design patterns when a simpler approach can work.
    - Agents can still miss project conventions. Especially common when your conventions differ from what's common in the broader ecosystem.
    - The happy path and obvious errors get covered, but the weird edge cases (network timeouts mid-transaction, partial failures, concurrent access) can get missed and could use more error handling.

# Workflow

### Orientation

- Use the agent to help you orient around a codebase and think through an implementation. interrogate it to remind yourself how a feature is currently working or why something was designed in a particular way.
    - You can also ask the agent to interrogate you to ensure you have thought of everything.
- Have a clear plan in your mind for what needs to change, what are the things to watch out for and how you would do it if you were to implement it manually.
- You can use the agent to help you write a prompt to use to invoke the implementation.
- Try to break up large tasks into separate medium tasks. Your goal should be to avoid compaction as much as possible.

### Execution

- Use plan mode first for every non-trivial feature or implementation.
- Review the plan in detail, if you are missing information from the plan or if you think there is any ambiguity, ask for changes. Don’t assume anything.
    - Treat the plan as a blueprint for exactly what the agent will implement.
- Commit frequently for checkpoints.
    - Claude has checkpoints now (`/rewind`) but you should use your git history as well as a backup.
    - Squash the commits when merging in your PR.
- Keep an eye on the thinking comments as Claude works. This gives you insight into how it’s interpreting your instructions, where it might be getting lost or what is being ignored.
- Compaction should be avoided as much as possible, it can lead to a noticeable decrease in quality and the agent can start to ignore your rules and project conventions.
    - Try to structure your agent tasks in the right size so it can work without compaction.
    - If you have to compact, do it before auto-compaction and trigger it manually with instructions on what to focus on like: `/compact focus on what we did with the auth`
- If you find yourself needing to make two or more significant corrections to a plan or output, it’s better to start from a fresh conversation and try to adjust your initial prompt to be more detailed.
- TDD can be a high-leverage pattern if you are able to operate in this way. First define the tests and commit the tests. Then direct the agent to implement without modifying the tests. You can then use a Hook to create a self-correcting loop.
    - A helpful tip is you can configure the hook to filter out test passes and only focus on test failures to save on context space.

### Parallelism

- Don’t just wait for the agent to load while doing nothing.
- Always look for ways to multitask, when one thread is working, work on another.
- If you are working on a large task with multiple steps, try to structure the steps to be done in parallel.
- When the agent is building one feature, you can start invoking plan mode on the next feature.
- Simplest way is just checkout the repo multiple times and work on different features on different copies.
- The more complex but more organized and structured way is to use worktrees
    - This is recommended to be done with tools like vibe-kanban and Conductor since it can get pretty complex when done manually.
    - More recommendations and guidance around parallel work will come later.

### General Tips

- Once in a while do an audit of your codebase.
    - You can ask Claude to audit your codebase to ensure your librarian docs are up to date, your rules are being enforced and your cursor configuration is in sync.
    - You can also ask Claude to audit your codebase in general for consistent patterns, optimal approaches, no dead code, and ensuring it is a high quality codebase in general.
- Symlink AGENTS.md to CLAUDE.md if you want to support other agentic tools.
- If you truly have personal preferences like if you want the agent to talk to you in a particular way, you can use CLAUDE.local.md which gets gitignored. But use this sparingly, the goal is for the entire team to have consistent AI tooling behaviours as much as possible.

# Example Workflow

This is an example of how to get started with a repo, use this for reference but customize it for your particular project needs. 

1. Manually set up and scaffold your repo (e.g. npm create).
    1. Add in whatever fundamental libraries you typically use (e.g. eslint, prettier, tailwind)
2. Run `/init` to generate an initial CLAUDE.md 
3. Edit this master harness generation prompt with your project specific info (templated placeholders inside). 
    1. This is a one-shot prompt but you may have better luck breaking this up into smaller chunks if anything goes wrong.

### Harness Generation Prompt

Customize this to your particular needs. Depending on the complexity of your project, it may make sense to split this task up into smaller tasks instead of one prompt to do everything. 

```markdown
You are setting up a complete AI development harness for this project. This is a one-time setup that will generate all configuration files for Claude Code and Cursor. The harness must be opinionated, concise, and optimized for progressive disclosure — context should only load when needed.

Before starting, read the existing CLAUDE.md, the project structure, package.json (or equivalent), and any existing config files to understand what we're working with.

After reading the project, and before generating anything, stop and ask me:
- Any clarifying questions about the project, its conventions, or how we work
- Any decisions that need my input (e.g. "I see two patterns for API error handling in the codebase — which one should be the standard?")
- Any gaps in the Project Context below that would help you generate a better harness
- Any project-specific skills, rules, or agents you think would be valuable beyond what's listed below

Only proceed with generation after I've answered your questions.

## Project Context

- Project description: [WHAT DOES THIS PROJECT DO — 2-3 SENTENCES]
- Tech stack: [e.g. Next.js 14 App Router, TypeScript, Prisma, PostgreSQL, Tailwind CSS]
- Frameworks and key libraries: [e.g. React Query, Zod, NextAuth, Stripe SDK]
- Monorepo or single app: [MONOREPO / SINGLE APP / MULTI-PACKAGE]
- Test framework: [e.g. Vitest, Jest, Playwright for e2e]
- Formatter/linter: [e.g. Prettier, ESLint, Biome]
- Package manager: [e.g. npm, pnpm, yarn, bun]
- CI/CD: [e.g. GitHub Actions, Vercel, etc.]
- Key conventions Claude should know: [e.g. "We use barrel exports", "API routes follow /api/v1/ prefix", "All components are co-located with their tests"]
- Common mistakes to prevent: [e.g. "Don't use default exports", "Never use any type", "Don't add dependencies without asking"]
- Design system / UI approach: [e.g. "shadcn/ui with custom theme tokens", "Tailwind only, no CSS modules"]
- External integrations: [e.g. "Stripe for payments", "SendGrid for email", "S3 for file uploads"]

## What to Generate

Generate the complete harness in the following order. Use subagents to parallelize where possible. After all files are generated, run a review stage.

### Phase 1: CLAUDE.md (do this first, everything else depends on it)

Rewrite the existing CLAUDE.md based on the project context above and the current codebase. Follow these rules strictly:

- Keep it under 500 lines. Be ruthless. Every line must earn its place.
- Include: exact build, test, lint, dev, and typecheck commands
- Include: architecture overview with key directories and their purpose
- Include: code conventions specific to this project that differ from defaults
- Include: explicit "never do X, do Y instead" rules based on the common mistakes listed above
- Include: a section listing all subagents with a one-line description of when to use each (leave as placeholder — will be filled in Phase 5)
- Include: a section listing all skills with a one-line description of when to invoke each (leave as placeholder — will be filled in Phase 5)
- Include: instruction that Claude must outline subagent and skill usage in every plan
- Include: instruction to push back when an approach seems wrong rather than blindly implementing
- Include: instruction to suggest CLAUDE.md improvements when it discovers undocumented patterns
- Include: compaction priorities — "When compacting, always preserve: the list of modified files, active test commands, the current implementation plan, and any constraints or decisions made during this session"
- Do NOT include anything Claude can figure out by reading the code
- Do NOT include standard language conventions Claude already knows
- Do NOT import large files with @syntax — reference file paths instead

### Phase 2: Skills and Rules (can be parallelized with each other)

Skills and rules are independent of each other. Use subagents to generate them in parallel.

#### Skills

Create each in its own directory under `.claude/skills/`:

1. **[FRAMEWORK]-patterns/** — How we build features in our stack. Our routing patterns, state management approach, data fetching conventions, component structure. This is reference knowledge. Set user-invocable: false so Claude loads it automatically when building features.

2. **design-system/** — Our UI approach, component library, theming, spacing and color conventions, do's and don'ts. Include a reference.md supporting file with the component inventory if we have a component library. Set user-invocable: false.

3. **project-context/** — High-level project context and codebase research tool. Domain concepts, key business logic, how the system fits together, important architectural decisions and why they were made. Set context: fork with agent: Explore so it can also be invoked as `/project-context [topic]` to research a specific topic in the codebase using $ARGUMENTS. When invoked with arguments, it should explore the codebase and return structured findings with file references. When loaded automatically by Claude, it provides background knowledge.

4. **review-changes/** — Reviews the current changeset for bugs, edge cases, and convention violations. Set context: fork. Should use `git diff` and `git diff --cached` to inspect staged and unstaged changes. Include instructions to check against project conventions, look for downstream effects, and flag anything suspicious.

5. **claude-code-best-practices/** — Knowledge source containing best practices for Claude Code configuration. Covers CLAUDE.md optimization, effective use of subagents, skills, hooks, rules, and progressive disclosure patterns. Set disable-model-invocation: true — this is a reference the harness-expert agent uses, not something invoked during normal development.

6. **cursor-best-practices/** — Knowledge source containing best practices for Cursor configuration. Covers .cursor/rules/ structure, YAML frontmatter activation modes, context management in Cursor, and how to keep Cursor rules in sync with Claude Code rules. Set disable-model-invocation: true — reference for the cursor-expert agent.

For each skill:
- Include YAML frontmatter with appropriate settings (description, context, allowed-tools, visibility)
- Keep SKILL.md under 500 lines, use supporting files for large reference content
- Use $ARGUMENTS where the skill needs dynamic input
- Only set context: fork on task-oriented skills that should run in isolation

#### Rules

Create each in `.claude/rules/`:

1. **code-style.md** — Coding conventions, formatting preferences, naming patterns, import ordering. Scope with glob patterns to relevant file extensions.

2. **testing.md** — How we write tests, framework conventions, what to mock vs not, naming patterns for test files, coverage expectations. Scope to test file patterns.

3. **[FRAMEWORK].md** — Conventions specific to how we use our framework. Component patterns, routing conventions, data fetching approach, state management. Scope to relevant directories and extensions.

4. **api-design.md** — API endpoint structure, error handling patterns, validation approach, response formats. Scope to API route directories.

5. **security.md** — Security practices, things to never do, input validation requirements, auth patterns. No glob scope — always loaded.

6. **database.md** — Database conventions, migration patterns, query patterns, ORM usage. Scope to relevant directories and extensions. Only generate if the project has a database layer.

For each rule:
- Keep it concise and actionable — "do X" and "never do Y, do Z instead" format
- Add YAML frontmatter with paths (glob patterns) for conditional loading where appropriate
- Only include things that differ from defaults or that Claude gets wrong without guidance
- Organize into subdirectories if the project has clear frontend/backend separation

### Phase 3: Subagents (after skills and rules, since agents reference them)

Create each as a markdown file in `.claude/agents/`:

1. **code-reviewer.md** — Reviews code for quality, consistency with project patterns, edge cases, downstream effects, security concerns, and bugs. Restrict to read-only tools: Read, Grep, Glob. Should output findings organized by severity (critical / warning / suggestion). Reference the rules files (including security.md) for the conventions it should enforce. Include specific things to check based on our stack and conventions.

2. **librarian.md** — Maintains project documentation in docs/ and the project-context skill. Has the ability to explore the codebase (Read, Grep, Glob) and write to docs/ and .claude/skills/project-context/. Should be invoked after every major feature addition or update. When invoked, it reads the current changeset, explores affected areas of the codebase, and updates relevant documentation and the project-context skill to reflect the current state.

3. **harness-expert.md** — Reviews and optimizes the Claude Code harness configuration. Has access to the claude-code-best-practices skill. Reads CLAUDE.md, rules, skills, subagent definitions, and hooks. Suggests improvements for token efficiency, progressive disclosure, and overall harness effectiveness. Read-only on all harness files, outputs recommendations. Invoke periodically or when the harness feels stale.

4. **cursor-expert.md** — Maintains Cursor rules in sync with the Claude Code harness. Has access to the cursor-best-practices skill. Reads .claude/rules/ and CLAUDE.md, generates or updates .cursor/rules/*.mdc with appropriate YAML frontmatter and activation modes. Read-only on Claude Code files, write access to .cursor/rules/. Invoke after any change to Claude Code rules or CLAUDE.md.

For each agent:
- Write a focused system prompt that describes its role, expected output format, and what to prioritize
- Set appropriate tool restrictions (most should be read-only)
- Set model: inherit on all agents
- Reference relevant skills via the skills: field in frontmatter where applicable
- Do NOT duplicate CLAUDE.md content — agents inherit it automatically

### Phase 4: Hooks and Cursor Rules (can be parallelized)

#### Hooks

Create hooks in `.claude/settings.json`:

1. **PostToolUse on "Write|Edit"** — Auto-run our formatter after file changes. Use the formatter from the project context above. Scope the command to only run on relevant file extensions to avoid unnecessary token usage.

Only add this one hook. More can be added later if needed — don't over-hook.

#### Cursor Rules

Run the cursor-expert agent created in Phase 3 to generate `.cursor/rules/*.mdc` files from the Claude Code rules and CLAUDE.md. Each Cursor rule should have YAML frontmatter with the appropriate activation mode:
- "Always Apply" for universal standards (matching unscoped Claude Code rules)
- "Auto Attached" with glob patterns for scoped rules (matching the glob patterns from Claude Code rules)
- "Agent Requested" for framework and pattern guidance

### Phase 5: Librarian Initialization and CLAUDE.md Finalization (can be parallelized)

#### Librarian Initialization

1. Create a `docs/` directory with initial project documentation:
   - `docs/architecture.md` — system architecture, key directories, how components connect
   - `docs/conventions.md` — coding conventions, patterns, naming rules (can reference rules files for detail)
   - `docs/data-flow.md` — how data flows through the system, key models, API contracts
   - `docs/features/` — directory for per-feature documentation (start with a README explaining the structure)

2. Ensure the librarian agent and project-context skill reference these docs.

#### Finalize CLAUDE.md

Now that all subagents, skills, and rules are created, update CLAUDE.md:
- Fill in the subagents section with each agent and a one-line description of when to use it
- Fill in the skills section with each skill and a one-line description of when to invoke it
- Verify the file is still under 500 lines after additions — cut anything now redundant because rules, skills, or agents handle it
- Ensure compaction priorities are still present and accurate

### Phase 6: Review

After all files are generated, run a thorough review:

1. Use a subagent to review the complete harness for internal consistency:
   - Does CLAUDE.md reference all agents and skills that exist?
   - Do agent system prompts align with the conventions in the rules?
   - Are glob patterns in rules correct for the actual project structure?
   - Are there any contradictions between CLAUDE.md, rules, and agent instructions?
   - Do agents that reference skills point to skills that actually exist?
   - Do the Cursor rules match and align with the Claude Code rules?

2. Use a separate subagent to review for token efficiency:
   - Is CLAUDE.md under 500 lines?
   - Are all skills under 500 lines?
   - Are rules scoped with glob patterns where possible (not loading unconditionally)?
   - Are read-only agents set to model: inherit?
   - Is any information duplicated across multiple files that should only live in one place?
   - Are skills that should be invisible to Claude marked with disable-model-invocation: true?

3. Run the harness-expert agent to review the overall harness and suggest any final improvements.

4. Fix any issues found in the reviews.

5. Output a summary of everything that was created, organized by directory, with a one-line description of each file.

## Important Rules for This Task

- Read the actual codebase before generating anything. The harness must be tailored to THIS project, not generic boilerplate.
- Be concise in all generated files. Every line should earn its place.
- Follow progressive disclosure: CLAUDE.md is the lean table of contents, rules load conditionally, skills load on demand, subagents run in isolation.
- Do not include instructions for things Claude already does correctly by default.
- All generated files should be ready to commit to git. No placeholder content, no TODOs, no "customize this section."
- Use subagents to parallelize where noted — Phase 2's skills and rules are independent, Phase 4's hooks and Cursor rules are independent, Phase 5's librarian init and CLAUDE.md finalization are independent.
```

1. Review the setup and commit it.
2. Start work on the first feature by planning out what you want. 
3. Prompt Claude in plan mode with a detailed request with full context, instructions, boundaries, etc. 

### Feature Prompt

```markdown
I need to implement a new feature. Before producing a plan, explore the codebase and ask me any questions.

## Feature Description

[DESCRIBE WHAT THE FEATURE DOES FROM THE USER'S PERSPECTIVE — WHAT SHOULD HAPPEN, WHO USES IT, WHAT PROBLEM IT SOLVES]

## Expected Behavior

[DESCRIBE THE SPECIFIC BEHAVIOR — INPUTS, OUTPUTS, USER FLOW, WHAT SUCCESS LOOKS LIKE. BE AS DETAILED AS POSSIBLE. INCLUDE SCREENSHOTS OR MOCKUPS IF AVAILABLE.]

## Scope & Constraints

- Files/directories this should touch: [e.g. "src/features/notifications/, src/api/routes/notifications.ts, the user model"]
- Files/directories this should NOT touch: [e.g. "don't modify the auth system, don't change the database schema for users"]
- Libraries to use: [e.g. "use the existing React Query setup, use Zod for validation"]
- Libraries to NOT use: [e.g. "no new dependencies without asking me first"]
- Performance constraints: [e.g. "must handle 1000 concurrent connections", "page load under 200ms" or "none specific"]
- Compatibility: [e.g. "must work with the existing v1 API contract", "backward compatible with current mobile app" or "none specific"]

## Context

- Related existing code to follow as a pattern: [e.g. "look at how src/features/messages/ is implemented — follow the same structure"]
- Relevant background: [e.g. "we tried a WebSocket approach before but switched to SSE for reliability", "the billing model is changing next quarter so keep this flexible"]
- Related issues/tickets: [e.g. "#423" or "N/A"]

## Instructions

First, use subagents to explore the codebase areas relevant to this feature. Understand how similar features are implemented, what utilities and components can be reused, what the data model looks like, and what the test patterns are.

After exploring, before producing a plan, ask me:
- Any clarifying questions about the requirements or expected behavior
- Any ambiguities that need a decision from me
- Any competing approaches you see with trade-offs I should weigh in on
- Any risks, edge cases, or downstream effects I should know about
- Anything in the existing codebase that conflicts with or complicates this feature

After I've answered your questions, produce a detailed implementation plan that includes:

- **Approach**: Which approach and why, referencing alternatives considered
- **Steps**: Numbered implementation steps in exact execution order. Each step should be a single, verifiable unit of work.
- **Files**: For each step, the files that will be created or modified
- **Skills & Subagents**: Which skills to load and which subagents to use at each step
- **Edge cases**: Explicit list of edge cases this implementation must handle
- **Testing**: What tests to write, what they cover, which patterns to follow
- **Verification**: How to verify each step before moving to the next
- **Downstream effects**: Anything else in the codebase that could be affected

When I approve the plan and exit Plan Mode, implement step by step. For each step: implement, verify, commit. If you hit something unexpected during implementation, stop and tell me rather than making assumptions. After all steps are complete, run the full test suite, use a subagent to review the complete changeset, fix any issues, and give me a summary of what was implemented and anything I should manually verify.
```

1. Check your emails or start looking ahead to the next feature while it’s doing it’s thing.
2. Verify and validate the generated plan. Asking for revisions when necessary. The plan should have everything you need to understand exactly how it will implement the feature.
3. While it’s working on the first feature, start a new Claude session with a prompt for the second feature and get it started planning it in parallel. 
4. After the first feature is implemented, invoke agentic review first in Cursor or in another Claude session. 

### Review Prompt

```markdown
Review the current changeset as a staff-level engineer performing a thorough code review. Run `git diff` and `git diff --cached` to see all staged and unstaged changes. Read every modified file in full to understand the surrounding context, not just the diff lines.

Review the changes against the following criteria:

**Code Quality & Maintainability**
- Is the code clear and readable without comments explaining what it does?
- Are names (variables, functions, types, files) precise and consistent with the rest of the codebase?
- Is the solution appropriately simple? Flag any unnecessary abstractions, wrapper classes, or design patterns where a straightforward approach would do.
- Is there any duplication that should be extracted, or any extraction that's premature?
- Would a new team member understand this code without asking the author?

**Consistency**
- Does the code follow the patterns and conventions already established in this codebase?
- Are there any deviations from how similar things are done elsewhere in the project?
- Is the style consistent with surrounding code (error handling patterns, naming, file structure, imports)?

**Correctness & Edge Cases**
- Does the logic handle null, undefined, empty arrays, empty strings, and zero values correctly?
- Are there race conditions, timing issues, or concurrency concerns in async code?
- Are error cases handled explicitly, or does the code only cover the happy path?
- What happens on network failure, timeout, partial failure, or duplicate requests?
- Are there boundary conditions (first item, last item, single item, maximum size) that aren't covered?
- Could any inputs from users or external systems break this code?

**Downstream Effects**
- Do changes to shared utilities, types, models, or API contracts break any consumers?
- If a function signature, return type, or database schema changed, are all callers updated?
- Could this change affect performance, caching, or rate limiting for other parts of the system?
- Are there side effects that aren't obvious from the function name or interface?

**Security**
- Is user input validated and sanitized before use?
- Are there any hardcoded secrets, API keys, or credentials?
- Is authentication and authorization checked where needed?
- Are there any injection risks (SQL, XSS, command injection)?

**Testing**
- Are the changes covered by tests? Are the tests meaningful or just testing that the code runs?
- Do the tests cover edge cases and error paths, not just the happy path?
- If existing tests were modified, was that justified by the change, or were tests weakened to make them pass?

**Best Practices**
- Are resources (connections, subscriptions, event listeners, timers) properly cleaned up?
- Is error handling specific (catching and handling known errors) rather than generic (catch-all that swallows everything)?
- Are there any performance concerns (N+1 queries, unnecessary re-renders, large payloads, missing pagination)?
- Is anything hardcoded that should be configurable?

## Output Format

Organize your findings into three severity levels. For each issue, include the exact file path, line number or range, the code in question, and a clear explanation of the problem and how to fix it. If there are no issues at a severity level, omit that section.

### Critical (must fix before merging)
Issues that will cause bugs, data loss, security vulnerabilities, or break existing functionality.

### Warning (should fix)
Issues that will cause maintainability problems, violate project conventions, or have a meaningful risk of causing issues.

### Suggestion (consider improving)
Opportunities to improve clarity, simplify logic, or better align with best practices. Not blocking.

---

If no issues are found at any level, say so explicitly — don't invent issues to fill the sections.

After the review, generate a conventional commit message for this changeset. The message should:
- Use conventional commit format (feat:, fix:, refactor:, chore:, docs:, test:, etc.)
- Have a concise subject line under 72 characters summarizing the change
- Have a body (separated by a blank line) explaining what changed and why, not how
- Reference any relevant issue numbers if apparent from the changes

Format the commit message in a code block the user can copy directly.
```

1. Go through review findings to see if anything needs updating. 
2. Then do a manual review by looking at the Git Diff in Cursor.
3. If you need to make a manual change, note down why this is and what the change is. Revisit this list later to look for opportunities to improve your harness. 
4. Commit and make a PR. Start executing the second feature. 

# Resources

- [https://code.claude.com/docs/en/overview](https://code.claude.com/docs/en/overview)
- [https://cursor.com/docs](https://cursor.com/docs)
- [https://code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices)
- [https://claude.com/blog/how-anthropic-teams-use-claude-code](https://claude.com/blog/how-anthropic-teams-use-claude-code)
- [https://claude.com/blog/skills-explained](https://claude.com/blog/skills-explained)
- [https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en)
- [https://github.com/LazerTechnologies/Lazer-Agentic-Infrastructure](https://github.com/LazerTechnologies/Lazer-Agentic-Infrastructure)
- [https://github.com/wesammustafa/Claude-Code-Everything-You-Need-to-Know](https://github.com/wesammustafa/Claude-Code-Everything-You-Need-to-Know?tab=readme-ov-file#ai-agents)