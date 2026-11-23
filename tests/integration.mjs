// Run only against an empty, disposable database and its matching app instance.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import pg from "pg";
const root = process.env.TEST_ORIGIN;
if (!root || !process.env.TEST_DATABASE_URL || !process.env.TEST_ENTRY_CODE)
  throw Error("Set the three TEST_* variables documented in README.");
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
try {
  assert.equal(
    (await db.query("select count(*)::int n from carpool.members")).rows[0].n,
    0,
  );
  const api = root + "/api/carpool";
  const post = (cookie, body, origin = root) =>
    fetch(api, {
      method: "POST",
      headers: { cookie, origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const get = async (cookie) =>
    (await (await fetch(api, { headers: { cookie } })).json()).rides;
  async function login(name) {
    const res = await post("", {
      action: "login",
      nickname: name,
      code: process.env.TEST_ENTRY_CODE,
    });
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie").split(";")[0];
  }
  assert.equal((await fetch(api)).status, 401);
  assert.equal(
    (await post("", { action: "login" }, "https://example.org")).status,
    403,
  );
  const owner = await login("작성자"),
    a = await login("동기"),
    b = await login("동기");
  const draft = {
    action: "create",
    mode: "퇴소",
    origin: "본점",
    destination: "서면",
    date: "2099-11-24",
    time: "12:00",
    capacity: 2,
    link: "https://open.kakao.com/o/testPrivate",
  };
  const made = await post(owner, draft);
  assert.equal(made.status, 200);
  const { id } = await made.json();
  assert.equal((await get(a))[0].link, "");
  for (const action of ["edit", "delete", "approved", "rejected"])
    assert.equal((await post(a, { ...draft, id, action })).status, 403);
  assert.equal((await post(owner, { id, action: "apply" })).status, 409);
  for (const cookie of [a, b])
    assert.equal((await post(cookie, { id, action: "apply" })).status, 200);
  assert.equal((await post(a, { id, action: "apply" })).status, 409);
  const requests = (await get(owner))[0].requests;
  const approve = (q) =>
    post(owner, { action: "approved", id, requestId: q.id });
  assert.deepEqual(
    (await Promise.all(requests.map(approve))).map((r) => r.status).sort(),
    [200, 409],
  );
  const joined = (await get(a))[0].link ? a : b,
    waiting = joined === a ? b : a;
  assert.equal((await get(joined))[0].link, draft.link);
  assert.equal((await get(waiting))[0].requests.length, 1);
  assert.equal((await get(owner))[0].approved, 2);
  await post(joined, { id, action: "cancel" });
  assert.equal((await get(joined))[0].link, "");
  assert.equal(
    (
      await post(owner, {
        action: "rejected",
        id,
        requestId: (await get(waiting))[0].requests[0].id,
      })
    ).status,
    200,
  );
  assert.equal((await get(waiting))[0].requests[0].status, "rejected");
  assert.equal(
    (await post(owner, { ...draft, id, action: "edit", destination: "센텀" }))
      .status,
    200,
  );
  assert.equal((await get(a))[0].destination, "센텀");
  await db.query("update carpool.rides set moment=now()-interval '24 hours'");
  assert.equal((await get(owner)).length, 0);
  const job = (
    await fs.readFile(new URL("../sql/cleanup.sql", import.meta.url), "utf8")
  ).split("$job$")[1];
  await db.query(job);
  assert.equal(
    (await db.query("select count(*)::int n from carpool.requests")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from carpool.rides")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from carpool.members")).rows[0].n,
    3,
  );
  const newId = (await (await post(owner, draft)).json()).id;
  assert.equal(
    (await post(owner, { action: "delete", id: newId })).status,
    200,
  );
  for (let i = 0; i < 11; i++) {
    const res = await post("", {
      action: "login",
      nickname: "a",
      code: "invalid",
    });
    if (i === 10) assert.equal(res.status, 429);
  }
  console.log(
    "PASS: sessions, authorization, shared reads, duplicate and concurrent requests, link visibility, edit/delete, expiry, cascade, rate limit",
  );
} finally {
  await db.end();
}
