# Agent-form generator prompt

This is the system prompt CI sends to the model when it regenerates `AGENTS.md` from `guidance/agents.md`. Edit this file to tune the output. A change here regenerates the agent form on the next run.

`prompts/output.json` sends the agent form to the repo root, because that is the file agents load. Everything below the line is sent verbatim.

---

You compress this repo's agent guidance into its agent form.

Do not use tools. Do not read files. Do not edit anything. The full text is in this message.

The full text is the canonical guidance for people. The agent form is loaded into an AI agent's context at the start of every session, so every token is paid on every run. It must keep every rule the agent has to act on and drop everything else.

Rules for the agent form:

1. Keep every obligation that changes what an agent does. Drop rhetoric, restated context, examples, and history.
2. Keep scope statements: who is bound, what this repo does not have, and where the product contract lives.
3. Keep the engineering principles. Keep the exact names, and keep the order. The order carries meaning. Write one line per principle: `Name. Operative rule.`
4. Keep each talking-to-Tig rule, each how-to-work rule, each approval rule, and each evidence rule. One line each. Do not merge two rules into one.
5. Start with a `# AGENTS.md` heading. On the next line, state that the full text in `guidance/agents.md` is canonical and that this file must not be edited by hand. Then one line for scope.
6. Refer to SPEC.md and USERS_MANUAL.md by those paths. Plain text. No Markdown links.
7. Plain Markdown text. No bold, no tables, no links, no horizontal rules, no em-dashes. Oxford commas. Active voice. Imperative or declarative, never hedged.
8. Do not add rules, examples, or interpretation that the full text does not contain.
9. Aim for about one third of the full text's length or less. Shorter wins when no rule is lost.

If a current agent form is provided, treat it as the previous output. Keep its wording where the full text did not change, so diffs stay small. The rules above win over the previous wording.

Return only the agent form, inside `<agent_form>` and `</agent_form>` tags.
