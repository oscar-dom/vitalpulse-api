import { type Issue, ValidationError } from "../errors/app.error.js";

// Shared pieces of FHIR search (https://hl7.org/fhir/R4/search.html): reading the
// parameters, the token, date and string matching rules, sorting and paging.

export const DEFAULT_COUNT = 10;
export const MAX_COUNT = 50;

/** Search parameters as received: name (with any :modifier) to all its values. */
export type SearchParams = Map<string, string[]>;

/**
 * Collects the query string. A parameter given twice is AND (both must hold); a comma
 * inside one value is OR, handled by each parameter.
 */
export const readSearchParams = (query: Record<string, unknown>): SearchParams => {
  const params: SearchParams = new Map();
  for (const [name, raw] of Object.entries(query)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (value): value is string => typeof value === "string",
    );
    if (values.length > 0) params.set(name, values);
  }
  return params;
};

/**
 * Parameters the server does not know. FHIR says to ignore them, so a generic client
 * still gets results, unless the client sends "Prefer: handling=strict", which asks
 * for an error instead.
 */
export const dropUnknownParams = (
  params: SearchParams,
  known: readonly string[],
  preferHeader: string | undefined,
): void => {
  const unknown = [...params.keys()].filter((name) => !known.includes(name));
  if (unknown.length === 0) return;

  if (/handling\s*=\s*strict/i.test(preferHeader ?? "")) {
    throw new ValidationError(
      unknown.map((name) => ({
        code: "not-supported",
        diagnostics: `Unknown or unsupported search parameter "${name}". Supported: ${known.join(", ")}.`,
      })),
    );
  }
  for (const name of unknown) params.delete(name);
};

/**
 * One condition per value of a parameter, all of which must hold (AND). Inside a value,
 * comma-separated options are alternatives (OR).
 */
export const allOf = <Condition>(
  values: string[],
  toCondition: (option: string) => Condition,
): (Condition | { $or: Condition[] })[] =>
  values.map((value) => {
    const options = value.split(",").map(toCondition);
    return options.length === 1 ? options[0]! : { $or: options };
  });

const invalid = (parameter: string, message: string): Issue => ({
  code: "invalid",
  diagnostics: `Parameter "${parameter}": ${message}`,
});

/** The only value of a parameter that may appear once (_count, _sort...). */
const single = (params: SearchParams, name: string): string | undefined => {
  const values = params.get(name);
  if (values && values.length > 1) {
    throw new ValidationError([invalid(name, "may only appear once")]);
  }
  return values?.[0];
};

/** _count (page size, 0 = only the total) and _page (1-based). */
export const readPaging = (params: SearchParams) => {
  const issues: Issue[] = [];
  const countText = single(params, "_count");
  const pageText = single(params, "_page");

  let count = DEFAULT_COUNT;
  if (countText !== undefined) {
    if (!/^\d+$/.test(countText)) issues.push(invalid("_count", "must be a whole number >= 0"));
    // A larger page than the server allows is reduced to the maximum, as FHIR permits.
    else count = Math.min(Number(countText), MAX_COUNT);
  }

  let page = 1;
  if (pageText !== undefined) {
    if (!/^[1-9]\d*$/.test(pageText)) issues.push(invalid("_page", "must be a whole number >= 1"));
    else page = Number(pageText);
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { count, page };
};

/**
 * _sort: comma-separated fields, "-" in front for descending. `fields` maps each
 * search parameter that can be sorted on to the stored field.
 */
export const readSort = (
  params: SearchParams,
  fields: Record<string, string>,
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> => {
  const text = single(params, "_sort");
  if (text === undefined) return fallback;

  const sort: Record<string, 1 | -1> = {};
  for (const item of text.split(",")) {
    const name = item.trim().replace(/^-/, "");
    const field = fields[name];
    if (!field) {
      throw new ValidationError([
        invalid("_sort", `cannot sort by "${name}". Use: ${Object.keys(fields).join(", ")}.`),
      ]);
    }
    sort[field] = item.trim().startsWith("-") ? -1 : 1;
  }
  return sort;
};

/** A token value: "system|code", "code" (any system) or "system|" (any code). */
export const parseToken = (value: string): { system?: string; code?: string } => {
  const bar = value.indexOf("|");
  if (bar === -1) return { code: value };
  return {
    system: value.slice(0, bar) || undefined,
    code: value.slice(bar + 1) || undefined,
  };
};

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * String matching as FHIR defines it: by default the field starts with the value,
 * ignoring case; ":exact" is the whole value, case included; ":contains" is anywhere.
 */
export const stringMatcher = (value: string, modifier?: string): RegExp => {
  const text = escapeRegex(value.trim());
  if (modifier === "exact") return new RegExp(`^${text}$`);
  if (modifier === "contains") return new RegExp(text, "i");
  return new RegExp(`^${text}`, "i");
};

// A date search value: YYYY, YYYY-MM, YYYY-MM-DD or a full dateTime with time zone.
const DATE_VALUE =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

const DATE_PREFIXES = ["eq", "ne", "gt", "lt", "ge", "le"] as const;

/**
 * The period a date value stands for. "2026-10" means all of October 2026: it starts
 * on October 1st and ends right before November 1st.
 */
const datePeriod = (text: string): { start: Date; end: Date } | undefined => {
  const match = DATE_VALUE.exec(text);
  if (!match) return undefined;
  const [, year, month, day, hour] = match;

  if (hour !== undefined) {
    const instant = new Date(text);
    if (Number.isNaN(instant.getTime())) return undefined;
    // Precision of the seconds given (or of the minute when there are none).
    const step = match[6] === undefined ? 60_000 : 1000;
    return { start: instant, end: new Date(instant.getTime() + step) };
  }

  const y = Number(year);
  const m = month === undefined ? 0 : Number(month) - 1;
  const d = day === undefined ? 1 : Number(day);
  const start = new Date(Date.UTC(y, m, d));
  if (start.getUTCMonth() !== m || start.getUTCDate() !== d) return undefined;
  const end =
    day !== undefined
      ? new Date(Date.UTC(y, m, d + 1))
      : month !== undefined
        ? new Date(Date.UTC(y, m + 1, 1))
        : new Date(Date.UTC(y + 1, 0, 1));
  return { start, end };
};

/**
 * A MongoDB condition for one date parameter value with its prefix, on a field that
 * stores an instant. The value is a period (see datePeriod); "ge2026-10" means from
 * the start of October, "lt2026-10" before it, "eq2026-10" (the default) within it.
 */
export const dateCondition = (parameter: string, value: string): Record<string, unknown> => {
  const prefix = DATE_PREFIXES.find((candidate) => value.startsWith(candidate));
  const period = datePeriod(prefix ? value.slice(2) : value);
  if (!period) {
    throw new ValidationError([
      invalid(
        parameter,
        `"${value}" is not a date. Use [prefix]YYYY[-MM[-DD[Thh:mm[:ss]zone]]], prefix one of ${DATE_PREFIXES.join(", ")}.`,
      ),
    ]);
  }

  const { start, end } = period;
  switch (prefix ?? "eq") {
    case "gt":
      return { $gte: end };
    case "ge":
      return { $gte: start };
    case "lt":
      return { $lt: start };
    case "le":
      return { $lt: end };
    case "ne":
      return { $not: { $gte: start, $lt: end } };
    default:
      return { $gte: start, $lt: end };
  }
};

/** "true" or "false", for token parameters on a boolean like Patient.active. */
export const parseBoolean = (parameter: string, value: string): boolean => {
  if (value !== "true" && value !== "false") {
    throw new ValidationError([invalid(parameter, "must be true or false")]);
  }
  return value === "true";
};

/** 400 for a parameter value outside a closed list. */
export function assertOneOf<T extends string>(
  parameter: string,
  value: string,
  allowed: readonly T[],
): asserts value is T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ValidationError([
      invalid(parameter, `"${value}" is not one of ${allowed.join(", ")}`),
    ]);
  }
}
