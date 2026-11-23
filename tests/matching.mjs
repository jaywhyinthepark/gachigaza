import assert from "node:assert/strict";
import { recommend } from "../src/lib/matching.ts";
const plan = {
  owned: true,
  mode: "퇴소",
  origin: "연수원",
  destination: "센텀",
  time: "16:00",
  date: "2099-01-01",
  approved: 1,
  capacity: 3,
  requests: [],
};
const rows = [
  { id: "near", destination: "해운대", time: "15:55" },
  { id: "same", time: "16:30" },
  { id: "late", time: "16:31" },
  { id: "other-start", origin: "본점" },
  { id: "tomorrow", date: "2099-01-02" },
  { id: "full", approved: 3 },
  { id: "early", time: "15:30" },
  { id: "in", mode: "입소" },
].map((r) => ({ ...plan, owned: false, ...r }));
assert.deepEqual(
  recommend([plan, ...rows], rows, "퇴소").map((r) => r.id),
  ["same", "early", "near"],
);
assert.equal(
  recommend([{ ...plan, destination: "constructor" }], rows, "퇴소").length,
  0,
);
console.log(
  "PASS: matching boundaries, date, direction, departure, capacity, exact priority and custom place",
);
