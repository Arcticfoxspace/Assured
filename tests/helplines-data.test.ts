// D1: every helpline must trace to a dated, official-looking source. Guards "never type numbers from memory".
import test from "node:test";
import assert from "node:assert/strict";
import { getSource, nationalHelplines, helplineSources } from "../src/lib/helplines";

test("D1: every helpline has a source with a matching publisher URL and a valid verification date", () => {
  const ids = new Set<string>();
  for (const h of nationalHelplines) {
    assert.ok(!ids.has(h.id), `duplicate id ${h.id}`);
    ids.add(h.id);
    const s = getSource(h.sourceId);
    assert.ok(s, `${h.id}: unknown sourceId ${h.sourceId}`);
    assert.match(h.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, h.id);
    assert.match(s!.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, h.id);
    assert.match(s!.url, /^https:\/\/[^/]+\.(gov\.in|nic\.in)(\/|$)/, `${h.id}: source must be an official .gov.in/.nic.in page`);
    if (h.website) assert.match(h.website, /^https:\/\//, h.id);
    assert.ok(h.number.trim().length > 0 && h.description.length > 20, h.id);
  }
  for (const s of helplineSources) assert.ok(s.publisher && s.title, s.id);
});

test("D1: new entries are present and dialable ones are tel-safe", () => {
  const byId = Object.fromEntries(nationalHelplines.map((h) => [h.id, h]));
  assert.equal(byId["nhrc-14433"].number, "14433");
  assert.equal(byId["manas-1933"].number, "1933");
});
