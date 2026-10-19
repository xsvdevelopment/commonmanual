// Owner corroboration for a known issue: how many NHTSA owner complaints filed for
// one vehicle describe the same problem. An entry opts in with `complaintMatch`, a
// list of term groups: a complaint counts when it matches at least one term from
// every group, e.g. [["judder", "shudder"], ["cvt", "transmission"]]. The rule is
// shown with the count, so readers can judge the match themselves.
import * as nhtsa from './sources/nhtsa.js';
import { has } from './diagnose.js';

export function matchesAll(groups, text) {
  const hay = ` ${String(text).toLowerCase()} `;
  return groups.every((g) => g.some((term) => has(hay, String(term).toLowerCase())));
}

export async function ownerReports(entry, { year, make, model }) {
  const rows = await nhtsa.complaintsRaw(year, make, model);
  const hits = rows
    .filter((r) => matchesAll(entry.complaintMatch, `${r.summary} ${r.components}`))
    .sort((a, b) => new Date(b.filed) - new Date(a.filed));
  return {
    count: hits.length,
    total: rows.length,
    match: entry.complaintMatch,
    examples: hits.slice(0, 3).map(({ id, filed, summary }) => ({ id, filed, summary: summary.slice(0, 280) })),
  };
}
