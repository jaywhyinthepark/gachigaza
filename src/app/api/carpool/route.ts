import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Pool, type PoolClient } from "pg";
import { boardQuery } from "../../../lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 8000,
});
const cookie = process.env.NODE_ENV === "production" ? "__Host-bnk" : "bnk";
const hash = (s: string) => createHash("sha256").update(s).digest();
class Problem extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: number, message: string): never {
  throw new Problem(code, message);
}
function reply(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
function error(e: unknown) {
  console.error("BNK_SERVER_ERROR", (e as { code?: string })?.code ?? "UNKNOWN");
  if (e instanceof Problem) return reply({ error: e.message }, e.code);
  if ((e as { code?: string }).code === "23505")
    return reply({ error: "이미 등록된 일정 또는 신청이다." }, 409);
  return reply({ error: "서버 연결을 확인한 후 다시 시도해 주세요." }, 503);
}
async function member(req: NextRequest, db: Pool | PoolClient) {
  const token = req.cookies.get(cookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401, "입장이 필요하다.");
  const result = await db.query(
    "select id,nickname from carpool.members where token_hash=$1",
    [hash(token).toString("hex")],
  );
  return result.rows[0] || fail(401, "다시 입장해 주세요.");
}
export async function GET(req: NextRequest) {
  try {
    const user = await member(req, pool);
    return reply({
      nickname: user.nickname,
      rides: (await pool.query(boardQuery, [user.id])).rows,
    });
  } catch (e) {
    return error(e);
  }
}
function string(v: unknown, max: number) {
  if (typeof v !== "string" || v.trim().length > max)
    fail(400, "입력값을 확인해 주세요.");
  return v.trim();
}
function uuid(v: unknown) {
  if (
    typeof v !== "string" ||
    !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v)
  )
    fail(400, "잘못된 식별자이다.");
  return v;
}
async function login(req: NextRequest, b: Record<string, unknown>) {
  const secret = process.env.ENTRY_CODE,
    salt = process.env.RATE_LIMIT_SECRET;
  if (!secret || !salt) fail(503, "서버 입장 설정이 필요하다.");
  const ip =
    process.env.VERCEL === "1"
      ? (req.headers.get("x-vercel-forwarded-for") || "shared").split(",")[0]
      : "local";
  const key = createHmac("sha256", salt).update(ip).digest("hex");
  const valid = timingSafeEqual(hash(string(b.code, 256)), hash(secret));
  const cost = valid ? 0 : 1;
  const limit = await pool.query(
    `insert into carpool.login_limits as l values($1,now(),$2)
 on conflict(bucket) do update set attempts=case when l.starts<=now()-interval '15 minutes' then $2 else least(11,l.attempts+$2) end,
 starts=case when l.starts<=now()-interval '15 minutes' then now() else l.starts end returning attempts`,
    [key, cost],
  );
  if (limit.rows[0].attempts >= 10)
    fail(429, "입장 시도가 많다. 15분 뒤 다시 시도해 주세요.");
  if (!valid) fail(403, "입장코드를 확인해 주세요.");
  const name = string(b.nickname, 20);
  if (!name) fail(400, "닉네임을 입력해 주세요.");
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "insert into carpool.members(nickname,token_hash) values($1,$2)",
    [name, hash(token).toString("hex")],
  );
  const res = reply({ ok: true });
  res.cookies.set(cookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 86400 * 365,
  });
  return res;
}
export async function POST(req: NextRequest) {
  try {
    if (
      req.headers.get("origin") !== req.nextUrl.origin &&
      req.headers.get("origin") !== process.env.APP_ORIGIN
    )
      fail(403, "요청 주소를 확인해 주세요.");
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      fail(415, "JSON 요청이 필요하다.");
    const raw = await req.text();
    if (raw.length > 4096) fail(413, "입력값이 너무 길다.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      fail(400, "잘못된 요청이다.");
    }
    if (!b || typeof b !== "object") fail(400, "잘못된 요청이다.");
    if (b.action === "login") return await login(req, b);
    const db = await pool.connect();
    try {
      await db.query("begin");
      const user = await member(req, db);
      let id = b.id,
        seats = 1;
      if (b.action !== "create") {
        const ride = (
          await db.query(
            "select * from carpool.rides where id=$1 and moment>now()-interval '24 hours' for update",
            [uuid(id)],
          )
        ).rows[0];
        if (!ride) fail(404, "삭제된 일정이다.");
        const own = ride.creator === user.id;
        if (
          ["edit", "delete", "approved", "rejected"].includes(b.action) &&
          !own
        )
          fail(403, "작성자만 관리할 수 있다.");
        if (
          ["apply", "approved"].includes(b.action) &&
          ride.moment.getTime() <= Date.now()
        )
          fail(409, "이동 시각이 지났다.");
        seats += (
          await db.query(
            "select count(*)::int n from carpool.requests where ride=$1 and status='approved'",
            [id],
          )
        ).rows[0].n;
        if (["apply", "approved"].includes(b.action) && seats >= ride.capacity)
          fail(409, "모집이 완료되었다.");
        if (b.action === "apply" && own)
          fail(409, "자기 일정에는 신청할 수 없다.");
      }
      switch (b.action) {
        case "create":
        case "edit": {
          const origin = string(b.origin, 50),
            destination = string(b.destination, 50),
            link = string(b.link, 250);
          if (
            !origin ||
            !destination ||
            !(b.mode === "입소"
              ? destination === "연수원"
              : b.mode === "퇴소" && ["연수원", "본점"].includes(origin))
          )
            fail(400, "이동 구간을 확인해 주세요.");
          if (![2, 3, 4].includes(b.capacity) || b.capacity < seats)
            fail(409, "현재 탑승 인원과 정원을 확인해 주세요.");
          if (
            link &&
            !/^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/.test(link)
          )
            fail(400, "카카오톡 오픈채팅 주소를 확인해 주세요.");
          const date = string(b.date, 10),
            time = string(b.time, 5),
            moment = new Date(date + "T" + time + ":00+09:00");
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
            !Number.isFinite(+moment) ||
            +moment <= Date.now() ||
            new Date(+moment + 9 * 3600000).toISOString().slice(0, 10) !== date
          )
            fail(400, "미래의 날짜와 시각을 입력해 주세요.");
          const inputs = [
            user.id,
            b.mode,
            origin,
            destination,
            moment,
            b.capacity,
            link,
          ];
          if (b.action === "create")
            id = (
              await db.query(
                "insert into carpool.rides(creator,mode,origin,destination,moment,capacity,link) values($1,$2,$3,$4,$5,$6,$7) returning id",
                inputs,
              )
            ).rows[0].id;
          else
            await db.query(
              "update carpool.rides set mode=$2,origin=$3,destination=$4,moment=$5,capacity=$6,link=$7 where creator=$1 and id=$8",
              [...inputs, id],
            );
          break;
        }
        case "delete":
          await db.query("delete from carpool.rides where id=$1", [id]);
          break;
        case "apply":
          await db.query(
            "insert into carpool.requests values($1,$2,'pending')",
            [id, user.id],
          );
          break;
        case "cancel":
          await db.query(
            "delete from carpool.requests where ride=$1 and member=$2",
            [id, user.id],
          );
          break;
        case "approved":
        case "rejected":
          if (
            !(
              await db.query(
                "update carpool.requests set status=$3 where ride=$1 and member=$2 and status='pending'",
                [id, uuid(b.requestId), b.action],
              )
            ).rowCount
          )
            fail(409, "이미 처리된 신청이다.");
          break;
        default:
          fail(400, "잘못된 작업이다.");
      }
      await db.query("commit");
      return reply({ id });
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      db.release();
    }
  } catch (e) {
    return error(e);
  }
}
