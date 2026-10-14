import type { QueueFilters } from "@/lib/server/admin";

const ALLOWED: Record<keyof QueueFilters, readonly string[] | null> = {
  status: ["submitted", "awaiting_email", "awaiting_parent", "in_review", "approved", "changes_requested", "rejected", "safeguarding_review", "withdrawn"],
  format: ["interview", "write", "voice", "video"],
  trust: ["verified", "community"],
  age: ["age_14_17", "age_18_24", "age_25_plus"],
  channel: ["platform", "website", "blog", "social"],
  media: ["yes", "no"],
  safeguarding: ["yes"],
  q: null,
};

/** Filters from the address, ignoring anything unexpected, plus the query string to keep in links. */
export function parseFilters(params: Record<string, string | string[] | undefined>): { filters: QueueFilters; query: string } {
  const filters: Record<string, string> = {};
  for (const [key, allowed] of Object.entries(ALLOWED)) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 200);
    if (value && (!allowed || allowed.includes(value))) filters[key] = value;
  }
  const query = new URLSearchParams(filters).toString();
  return { filters: filters as QueueFilters, query: query ? `?${query}` : "" };
}
