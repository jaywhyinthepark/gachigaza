"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { recommend, type Ride, type Mode } from "../lib/matching";
const places = [
  "부산역",
  "김해공항",
  "사상터미널",
  "노포터미널",
  "서면",
  "연산",
  "동래",
  "수영",
  "광안리",
  "센텀",
  "해운대",
  "덕천",
  "사상",
  "대저",
  "기타(직접 입력)",
];
const localDate = (d: Date) =>
  new Date(+d + 9 * 3600000).toISOString().slice(0, 10);
function validChatLink(link: string) {
  return !link || /^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/.test(link);
}
const districts: Record<string, string> = {
  연산: "연산역, 교대역",
  동래: "동래역, 미남역",
  광안리: "광안역, 금련산역",
  센텀: "센텀시티역, 벡스코역",
};
export default function Home() {
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<Mode>("입소");
  const [page, setPage] = useState<"board" | "create" | "mine" | "detail">(
    "board",
  );
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState("");
  const [dateFilter, setDateFilter] = useState(localDate(new Date()));
  const [placeFilter, setPlaceFilter] = useState("전체");
  const [origin, setOrigin] = useState("부산역");
  const [destination, setDestination] = useState("부산역");
  const [other, setOther] = useState("");
  const [rideDate, setRideDate] = useState(localDate(new Date()));
  const [rideTime, setRideTime] = useState("13:20");
  const [capacity, setCapacity] = useState(3);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [edit, setEdit] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const submitting = useRef(false);
  async function refresh() {
    const seq = ++revision.current;
    const res = await fetch("/api/carpool", { cache: "no-store" });
    const data = await res.json();
    if (seq !== revision.current) return;
    if (res.status === 401) {
      setNickname("");
      setRides([]);
      return;
    }
    if (!res.ok) throw Error(data.error);
    setNickname(data.nickname);
    setRides(data.rides);
  }
  useEffect(() => {
    const reload = () =>
      refresh()
        .catch(() => setNotice("일정을 불러오지 못했다. 연결을 확인해 주세요."))
        .finally(() => setReady(true));
    reload();
    const timer = setInterval(reload, 15000);
    window.addEventListener("focus", reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", reload);
    };
  }, []);
  async function write(
    action: string,
    values: Record<string, unknown> = {},
    done?: (id: string) => void,
  ) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/carpool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      await refresh();
      done?.(data.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "다시 시도해 주세요.");
      await refresh().catch(() => {});
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const listed = useMemo(
    () =>
      rides
        .filter(
          (r) =>
            r.mode === mode &&
            r.date === dateFilter &&
            (placeFilter === "전체" ||
              r.origin === placeFilter ||
              r.destination === placeFilter),
        )
        .sort((a, b) => a.time.localeCompare(b.time)),
    [rides, mode, dateFilter, placeFilter],
  );
  const current = rides.find((r) => r.id === selected);
  const myRides = rides.filter((r) => r.owned || r.requests.length > 0);
  const recommendations = recommend(rides, listed, mode);
  function changeMode(m: Mode) {
    setMode(m);
    setPlaceFilter("전체");
    setOrigin(m === "입소" ? "부산역" : "연수원");
    setDestination("부산역");
    setNotice("");
  }
  function register() {
    const from =
      mode === "입소" && origin === "기타(직접 입력)" ? other.trim() : origin;
    const to =
      mode === "퇴소" && destination === "기타(직접 입력)"
        ? other.trim()
        : mode === "입소"
          ? "연수원"
          : destination;
    if (!nickname.trim())
      return setNotice("먼저 상단에서 닉네임을 입력해야 한다.");
    if (
      !from ||
      !to ||
      !rideDate ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(rideTime)
    )
      return setNotice("장소, 날짜와 시간을 정확히 입력해야 한다.");
    if (other.length > 50)
      return setNotice("기타 장소명은 50자 이내로 입력한다.");
    if (!validChatLink(link.trim()))
      return setNotice(
        "카카오톡 오픈채팅 링크는 https://open.kakao.com/ 형식이어야 한다.",
      );
    if (new Date(`${rideDate}T${rideTime}:00+09:00`).getTime() <= Date.now())
      return setNotice("미래의 이동 시각만 등록할 수 있다.");
    void write(
      edit ? "edit" : "create",
      {
        id: edit,
        mode,
        origin: from,
        destination: to,
        date: rideDate,
        time: rideTime,
        capacity,
        link: link.trim(),
      },
      (id) => {
        setEdit("");
        setSelected(id);
        setDateFilter(rideDate);
        setPlaceFilter("전체");
        setPage("detail");
      },
    );
  }
  function startForm(r?: Ride) {
    const m = r?.mode ?? mode;
    const place = m === "입소" ? r?.origin : r?.destination;
    const choice = place
      ? places.includes(place)
        ? place
        : places[14]
      : places[0];
    setEdit(r?.id ?? "");
    setMode(m);
    setOther(place && choice === places[14] ? place : "");
    setOrigin(m === "입소" ? choice : (r?.origin ?? "연수원"));
    setDestination(m === "퇴소" ? choice : "부산역");
    setRideDate(r?.date ?? dateFilter);
    setRideTime(r?.time ?? "13:20");
    setCapacity(r?.capacity ?? 3);
    setLink(r?.link ?? "");
    setNotice("");
    setPage("create");
  }
  const filterPlaces = [
    ...new Set([
      ...(mode === "퇴소" ? ["연수원", "본점"] : []),
      ...places.slice(0, -1),
      ...rides
        .filter((r) => r.mode === mode && r.date === dateFilter)
        .map((r) => (mode === "입소" ? r.origin : r.destination)),
    ]),
  ];
  const inputPlaces = places.map((p) => (
    <option key={p} value={p}>
      {districts[p] ? p + " (" + districts[p] + ")" : p}
    </option>
  ));
  return (
    <div className="shell">
      <main className="app">
        <header className="top">
          <div>
            <h1>BNK 카풀</h1>
            <p>부산은행 동기 카풀 게시판</p>
          </div>
          {nickname && <strong>{nickname}</strong>}
        </header>
        {!ready ? (
          <p>불러오는 중…</p>
        ) : !nickname ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void write("login", { code, nickname: name }, () => setCode(""));
            }}
          >
            <h2>동기 입장</h2>
            <label className="field">
              공통 입장코드
              <input
                required
                type="password"
                maxLength={256}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label className="field">
              닉네임
              <input
                required
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              입장하기
            </button>
            <p className="info">
              같은 브라우저에서는 입장이 유지된다. 기기나 브라우저를 바꾸면 새
              계정으로 입장한다.
            </p>
          </form>
        ) : (
          <>
            {page === "board" && (
              <>
                <div className="tabs">
                  <button
                    className={mode === "입소" ? "active" : ""}
                    onClick={() => changeMode("입소")}
                  >
                    🏫 입소
                  </button>
                  <button
                    className={mode === "퇴소" ? "active" : ""}
                    onClick={() => changeMode("퇴소")}
                  >
                    🏠 퇴소
                  </button>
                </div>
                <div className="hint">
                  <strong>
                    {mode === "입소"
                      ? "부산 각지 → 연수원"
                      : "연수원·본점 → 부산 각지"}
                  </strong>
                  <p>
                    {mode === "입소"
                      ? "거점 도착 예정 시각 기준"
                      : "연수원·본점 출발 예정 시각 기준"}
                  </p>
                </div>
                <button className="primary" onClick={() => startForm()}>
                  + 카풀 일정 등록
                </button>
                {recommendations.length > 0 && (
                  <section>
                    <h2>나와 맞는 카풀</h2>
                    <p className="info">
                      내 일정과 30분 이내인 카풀이다. 인근 생활권은 실제 택시
                      경로를 확인한 뒤 신청한다.
                    </p>
                    {recommendations.map((r) => (
                      <button
                        className="ride recommendation"
                        key={r.id}
                        onClick={() => {
                          setSelected(r.id);
                          setPage("detail");
                        }}
                      >
                        <strong>
                          {r.time} · {r.origin} → {r.destination}
                        </strong>
                        <span>
                          {r.rank === 0 ? "동일 장소" : "인근 생활권"} ·{" "}
                          {r.diff}분 차이
                        </span>
                      </button>
                    ))}
                  </section>
                )}
                <section>
                  <div className="sectionHead">
                    <h2>동기 이동 일정</h2>
                    <small>{listed.length}건 · 시간순</small>
                  </div>
                  <div className="filters">
                    <label>
                      날짜
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                      />
                    </label>
                    <label>
                      장소
                      <select
                        value={placeFilter}
                        onChange={(e) => setPlaceFilter(e.target.value)}
                      >
                        <option value="전체">전체 장소</option>
                        {filterPlaces.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {listed.length === 0 && (
                    <p className="empty">선택한 조건의 일정이 없다.</p>
                  )}
                  {listed.map((r) => (
                    <button
                      className="ride"
                      key={r.id}
                      onClick={() => {
                        setSelected(r.id);
                        setPage("detail");
                        setNotice("");
                      }}
                    >
                      <div className="rideTop">
                        <strong>{r.time}</strong>
                        <span className="pill">
                          {r.closed || r.approved >= r.capacity
                            ? "모집 완료"
                            : "모집 중"}{" "}
                          · {r.approved}/{r.capacity}명
                        </span>
                      </div>
                      <div className="route">
                        {r.origin} → {r.destination}
                      </div>
                      <div className="muted">
                        {r.owner}
                        {r.owned ? " · 내 일정" : ""}
                      </div>
                    </button>
                  ))}
                </section>
              </>
            )}
            {page === "create" && (
              <section>
                <h2>{edit ? "카풀 일정 수정" : "내 카풀 일정 등록"}</h2>
                <div className="tabs">
                  <button
                    className={mode === "입소" ? "active" : ""}
                    onClick={() => changeMode("입소")}
                  >
                    입소
                  </button>
                  <button
                    className={mode === "퇴소" ? "active" : ""}
                    onClick={() => changeMode("퇴소")}
                  >
                    퇴소
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="origin">출발지</label>
                  <select
                    id="origin"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                  >
                    {mode === "입소" ? (
                      inputPlaces
                    ) : (
                      <>
                        <option>연수원</option>
                        <option>본점</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="destination">도착지</label>
                  {mode === "입소" ? (
                    <div className="locked">연수원 🔒</div>
                  ) : (
                    <select
                      id="destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    >
                      {inputPlaces}
                    </select>
                  )}
                </div>
                {((mode === "입소" && origin === "기타(직접 입력)") ||
                  (mode === "퇴소" && destination === "기타(직접 입력)")) && (
                  <div className="field">
                    <label htmlFor="other">기타 장소명</label>
                    <input
                      id="other"
                      value={other}
                      maxLength={50}
                      onChange={(e) => setOther(e.target.value)}
                      placeholder="예: 장산역, 민락동"
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="rideDate">
                    {mode === "입소" ? "출발 거점 도착 날짜" : "퇴소 날짜"}
                  </label>
                  <input
                    id="rideDate"
                    type="date"
                    value={rideDate}
                    onChange={(e) => setRideDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rideTime">
                    {mode === "입소"
                      ? "거점 도착 예정 시각"
                      : "본점·연수원 출발 예정 시각"}
                  </label>
                  <input
                    id="rideTime"
                    type="time"
                    value={rideTime}
                    onChange={(e) => setRideTime(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>총 탑승 인원 (본인 포함)</label>
                  <div className="tabs">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCapacity(n)}
                        className={capacity === n ? "active" : ""}
                      >
                        {n}명
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="link">카카오톡 오픈채팅 링크 (선택)</label>
                  <input
                    id="link"
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://open.kakao.com/..."
                  />
                  <small>
                    작성자와 승인된 동승자만 볼 수 있다. 링크를 외부에 공유하면
                    다른 사람도 입장할 수 있다.
                  </small>
                </div>
                <button className="primary" disabled={busy} onClick={register}>
                  {edit ? "수정 저장" : "일정 등록하기"}
                </button>
              </section>
            )}
            {page === "detail" && current && (
              <section>
                <button className="back" onClick={() => setPage("board")}>
                  ← 게시판으로
                </button>
                <h2>카풀 상세</h2>
                <div className="detailCard">
                  <span className="pill">
                    {current.mode} · {current.date}
                  </span>
                  <h3>{current.time}</h3>
                  <strong>
                    {current.origin} → {current.destination}
                  </strong>
                  <p>
                    작성자 {current.owner} · 탑승 {current.approved}/
                    {current.capacity}명
                  </p>
                </div>
                {current.owned ? (
                  <>
                    <h2>작성자 관리</h2>
                    <button
                      className="secondary"
                      onClick={() => startForm(current)}
                    >
                      일정 수정
                    </button>
                    {current.requests.map((q) => (
                      <div className="request" key={q.id}>
                        <span>
                          {q.name} ·{" "}
                          {q.status === "pending"
                            ? "승인 대기"
                            : q.status === "approved"
                              ? "승인됨"
                              : "거절됨"}
                        </span>
                        {q.status === "pending" && (
                          <div className="requestActions">
                            <button
                              disabled={
                                current.approved >= current.capacity ||
                                !!current.closed
                              }
                              onClick={() =>
                                write("approved", {
                                  id: current.id,
                                  requestId: q.id,
                                })
                              }
                            >
                              승인
                            </button>
                            <button
                              onClick={() =>
                                write("rejected", {
                                  id: current.id,
                                  requestId: q.id,
                                })
                              }
                            >
                              거절
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm("일정과 신청 내역을 삭제할까?"))
                          void write("delete", { id: current.id }, () =>
                            setPage("mine"),
                          );
                      }}
                    >
                      일정 삭제
                    </button>
                  </>
                ) : (
                  <>
                    <p className="info">
                      작성자가 승인하면 등록된 오픈채팅 링크를 확인할 수 있다.
                    </p>
                    {current.requests.length > 0 ? (
                      <>
                        <span className="pill">
                          {current.requests[0]?.status === "approved"
                            ? "승인 완료"
                            : current.requests[0]?.status === "pending"
                              ? "승인 대기"
                              : "거절됨"}
                        </span>
                        <button
                          className="secondary"
                          onClick={() => write("cancel", { id: current.id })}
                        >
                          {current.requests[0]?.status === "approved"
                            ? "참여 취소"
                            : "신청 취소"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary"
                        disabled={
                          !!current.closed ||
                          current.approved >= current.capacity
                        }
                        onClick={() => write("apply", { id: current.id })}
                      >
                        동승 신청하기
                      </button>
                    )}
                  </>
                )}
                {current.link && validChatLink(current.link) && (
                  <a
                    className="primary anchor"
                    href={current.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    카카오톡 오픈채팅 입장
                  </a>
                )}
                <p className="info">
                  실제 집결 장소와 시각은 동승자끼리 조율한다. 일정과 신청
                  내역은 이동 예정 시각 24시간 후 삭제된다.
                </p>
              </section>
            )}
            {page === "mine" && (
              <section>
                <h2>내 일정</h2>
                {myRides.length === 0 && (
                  <p className="empty">아직 작성하거나 신청한 일정이 없다.</p>
                )}
                {myRides.map((r) => (
                  <button
                    className="ride"
                    key={r.id}
                    onClick={() => {
                      setSelected(r.id);
                      setPage("detail");
                    }}
                  >
                    <strong>
                      {r.date} · {r.time}
                    </strong>
                    <span>
                      {r.origin} → {r.destination}
                    </span>
                    <small>
                      {r.owned
                        ? "내가 작성한 일정"
                        : "내 신청 · " +
                          {
                            pending: "승인 대기",
                            approved: "승인 완료",
                            rejected: "거절됨",
                          }[r.requests[0].status]}
                    </small>
                  </button>
                ))}
              </section>
            )}
            {page === "detail" && !current && (
              <p className="empty">삭제되었거나 만료된 일정이다.</p>
            )}
            <nav className="bottomNav">
              <button
                className={page === "board" ? "selected" : ""}
                onClick={() => setPage("board")}
              >
                ▤<small>게시판</small>
              </button>
              <button
                className={page === "create" ? "selected" : ""}
                onClick={() => startForm()}
              >
                ⊕<small>일정 등록</small>
              </button>
              <button
                className={page === "mine" ? "selected" : ""}
                onClick={() => setPage("mine")}
              >
                ♙<small>내 일정</small>
              </button>
            </nav>
          </>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
      </main>
    </div>
  );
}
