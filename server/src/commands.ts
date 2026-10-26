import type { DatabaseSync } from "node:sqlite";
import type { ApiCommand, ApiEvent, ApiViolation, BatchHint, CommandsResponse, Ref, StoredGoal, StoredPriority } from "./api.ts";
import { publish, toApiEvent } from "./live.ts";
import { toApiWorkItem } from "./work.ts";
import { lookup, read } from "./read.ts";
import { checkRanks, goalLints, type Row } from "./rules.ts";
import { DEFAULTS, inTransaction, write, type Command, type WriteResult } from "./write.ts";

/**
 * The batch behind POST /api/commands (plan E-1). The commands run in order through write(), in one transaction.
 * A create names itself with a ref ("$goal"); a later command uses it as an id or as a key field, and the server puts the key there (E-2).
 * The MCP route will call runCommands too.
 */

/** Only goals and work items are written through the API in the MLP (E-10), and a Priority's rank, for drag to reorder on Home. */
// The contract names an update for every kind the API writes, so the app can send it (f55879d left priority out).
const API_KINDS = ["goal", "work_item", "priority"] as const satisfies readonly Extract<ApiCommand, { op: "update" }>["kind"][];

/** The fields that hold a goal key, so a ref may stand there. A ref anywhere else is plain text. */
const KEY_FIELDS: Record<(typeof API_KINDS)[number], readonly string[]> = { goal: ["promotion_milestone", "parent"], work_item: ["goal"], priority: [] };

/** A re-rank swaps ranks one command at a time, so a tie is checked once the batch ends (checkRanks). */
const DEFERRED: Partial<Record<string, readonly string[]>> = { priority: ["no-rank-ties"] };

type CommandsAnswer = { status: 200 | 400 | 403 | 404 | 409 | 422; body: CommandsResponse };

const STATUS = { stale: 409, exists: 409, invalid: 422, not_found: 404, bad_command: 400, unknown_actor: 403 } as const;

const isObject = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const isRef = (value: unknown): value is Ref => typeof value === "string" && /^\$[A-Za-z0-9_-]+$/.test(value);

/** Thrown by resolve in a check, for a command that names a ref whose create was refused. */
class Skip {
  readonly ref: string;
  constructor(ref: string) {
    this.ref = ref;
  }
}

/** Thrown inside the transaction to stop the batch and roll it back. */
class Stop {
  readonly answer: CommandsAnswer;
  constructor(answer: CommandsAnswer) {
    this.answer = answer;
  }
}

const bad = (at: number, message: string): Stop => new Stop({ status: 400, body: { ok: false, at, error: "bad_command", message } });

/** Run a CommandsRequest as `actor`. With `check: true` the batch runs and is rolled back, and the answer is the same (plan, Checking before Create). */
export function runCommands(db: DatabaseSync, actor: string, request: unknown, today: string): CommandsAnswer {
  if (!isObject(request) || !Array.isArray(request.commands) || request.commands.length === 0) {
    return bad(0, "a request is { commands: [...] } with at least one command").answer;
  }
  const commands = request.commands as unknown[];
  const check = request.check === true;
  const outer = !db.isTransaction;
  // One save is one write and one time: every Event of the batch shares this timestamp (Frontend Engineer, History rows).
  const time = new Date().toISOString();
  try {
    const answer = inTransaction<CommandsAnswer>(db, (answer: CommandsAnswer) => answer.status === 200 && !check, () => {
      const ids: Record<Ref, string> = {};
      const events: ApiEvent[] = [];
      // A check goes on past an invalid command, so the New goal rail sees every check at once. Each write rolls back its own savepoint.
      const all: (ApiViolation & { at: number })[] = [];
      let first: { at: number; violations: ApiViolation[] } | undefined;
      const refused = new Set<string>();
      const skipped = new Set<string>();
      // NF2: a check carries each goal's lints, by command, from the row as written (or as sent, when refused).
      const hints = new Map<number, BatchHint[]>();
      const lint = (at: number, command: Command, result: WriteResult) => {
        if (!check || command.kind !== "goal" || command.op === "comment") return;
        const row = result.ok ? result.entity : command.op === "create" ? { ...DEFAULTS.goal, ...command.fields } : { ...read(db, "goal", command.id), ...command.fields };
        hints.set(at, goalLints(row).map((h) => ({ ...h, at })));
      };
      // The org unit and period of each re-ranked Priority, with the last command that ranked it.
      const ranked = new Map<string, { orgUnit: string; period: string; at: number }>();
      const run = (at: number, command: Command): Extract<WriteResult, { ok: true }> | undefined => {
        const result = write(db, actor, command, today, time, DEFERRED[command.kind]);
        if (result.ok && command.kind === "priority") {
          const { org_unit, period } = result.entity as { org_unit: string; period: string };
          ranked.set(`${org_unit}\u0000${period}`, { orgUnit: org_unit, period, at });
        }
        lint(at, command, result);
        if (!result.ok) {
          if (!check || result.error !== "invalid") throw new Stop(failure(at, command.kind, result, today));
          first ??= { at, violations: result.violations };
          all.push(...result.violations.map((v) => ({ ...v, at })));
          return undefined;
        }
        events.push(...result.events.map(toApiEvent));
        return result;
      };
      commands.forEach((raw, at) => {
        const ref = isObject(raw) && isRef(raw.ref) ? raw.ref : undefined;
        // The entity this command changes, as a key when its ref is known. A skipped command leaves it unchecked for the rest of the batch.
        const target = isObject(raw) && typeof raw.id === "string" ? (isRef(raw.id) ? ids[raw.id] : raw.id) : undefined;
        let command: Command;
        try {
          command = resolve(at, raw, ids, refused);
        } catch (error) {
          // A command that names a refused create cannot run; the refusal is already counted.
          if (error instanceof Skip) {
            // Codebase QA Q11: say which commands a check could not run, so the rail knows more checks follow.
            if (ref) refused.add(ref);
            if (target) skipped.add(target);
            all.push({ rule: "not-checked", message: `not checked yet: it names ${error.ref}, whose create was refused`, at });
            return;
          }
          throw error;
        }
        // Codebase QA N4: a later command on an entity a skipped command changed would answer stale and hide every refusal.
        if (check && target && skipped.has(target)) {
          all.push({ rule: "not-checked", message: `not checked yet: it changes ${target} after a command that could not be checked`, at });
          return;
        }
        if (command.op === "create" && command.kind === "goal" && command.fields.state === "In Progress") {
          // A check first tests the create in its final state, so every In Progress rule runs, in a savepoint it always rolls back.
          // Then it stores what a save stores, so a check and a save give the same keys and versions.
          if (check) {
            const probe = inTransaction(db, () => false, () => write(db, actor, command, today, time));
            lint(at, command, probe);
            if (!probe.ok) {
              if (probe.error !== "invalid") throw new Stop(failure(at, command.kind, probe, today));
              first ??= { at, violations: probe.violations };
              all.push(...probe.violations.map((v) => ({ ...v, at })));
              if (ref) refused.add(ref);
              return;
            }
          }
          // E-5: the state lifecycle starts at Backlog, so an In Progress create is a Backlog create and a state Event.
          const created = run(at, { ...command, fields: { ...command.fields, state: "Backlog" } });
          if (created) run(at, { op: "update", kind: "goal", id: created.entity.id as string, base_version: 1, fields: { state: "In Progress" }, reason: command.reason });
          if (ref) {
            if (created) ids[ref] = created.entity.id as string;
            else refused.add(ref);
          }
          return;
        }
        const result = run(at, command);
        if (command.op === "create" && ref) {
          if (result) ids[ref] = result.entity.id as string;
          else refused.add(ref);
        }
      });
      for (const { orgUnit, period, at } of ranked.values()) {
        const violations = checkRanks(lookup(db), orgUnit, period);
        if (violations.length === 0) continue;
        if (!check) throw new Stop({ status: 422, body: { ok: false, at, error: "invalid", violations } });
        first ??= { at, violations };
        all.push(...violations.map((v) => ({ ...v, at })));
      }
      const found = check ? { hints: [...hints.values()].flat() } : {};
      if (first) return { status: 422, body: { ok: false, at: first.at, error: "invalid", violations: first.violations, all, ...found } };
      return { status: 200, body: { ok: true, ids, events, ...found } };
    });
    // ADR 0007: only a committed batch is sent, and only once the outer COMMIT is done.
    if (outer && !check && answer.body.ok) publish(answer.body.events);
    return answer;
  } catch (error) {
    if (error instanceof Stop) return error.answer;
    throw error;
  }
}

/** Check one command's shape and put the keys where its refs stand. */
function resolve(at: number, raw: unknown, ids: Record<Ref, string>, refused: Set<string>): Command {
  if (!isObject(raw)) throw bad(at, "a command is a JSON object");
  const kind = raw.kind as (typeof API_KINDS)[number];
  if (!(API_KINDS as readonly unknown[]).includes(kind)) throw bad(at, `api-kind: the API writes goals and work items, not ${String(raw.kind)}`);
  const key = (value: unknown): unknown => {
    if (!isRef(value)) return value;
    if (refused.has(value)) throw new Skip(value);
    if (!(value in ids)) throw bad(at, `unknown-ref: ${value} is used before the command that creates it`);
    return ids[value];
  };
  if (kind === "priority" && (raw.op !== "update" || !isObject(raw.fields) || Object.keys(raw.fields).join() !== "rank")) {
    throw bad(at, "api-kind: through the API a Priority takes only an update of its rank");
  }
  if (raw.op === "comment") return { op: "comment", kind, id: key(raw.id) as string, text: raw.text as string };
  if (raw.op === "create" && raw.ref !== undefined && (!isRef(raw.ref) || raw.ref in ids || refused.has(raw.ref))) throw bad(at, `ref ${String(raw.ref)} must be "$" and a word, used once`);
  if (raw.fields !== undefined && !isObject(raw.fields)) throw bad(at, "fields is a JSON object");
  const fields: Row = { ...(raw.fields as Row | undefined) };
  for (const field of KEY_FIELDS[kind]) if (field in fields) fields[field] = key(fields[field]);
  const reason = typeof raw.reason === "string" ? raw.reason : undefined;
  if (raw.op === "create") return { op: "create", kind, fields, reason };
  if (raw.op === "update") return { op: "update", kind, id: key(raw.id) as string, base_version: raw.base_version as number, fields, reason };
  throw bad(at, "op is create, update, or comment");
}

function failure(at: number, kind: string, result: Exclude<WriteResult, { ok: true }>, today: string): CommandsAnswer {
  const status = STATUS[result.error];
  if (result.error === "stale") {
    const current = kind === "work_item" ? toApiWorkItem(result.current, today) : kind === "priority" ? (result.current as StoredPriority) : (result.current as StoredGoal);
    return { status, body: { ok: false, at, error: "stale", current } };
  }
  if (result.error === "invalid") return { status, body: { ok: false, at, error: "invalid", violations: result.violations } };
  return { status, body: { ok: false, at, error: result.error, message: result.message } };
}
