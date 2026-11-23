export type Mode = "입소" | "퇴소";
type Status = "pending" | "approved" | "rejected";
type Request = { id: string; name: string; status: Status };
export type Ride = {
  id: string;
  mode: Mode;
  origin: string;
  destination: string;
  date: string;
  time: string;
  capacity: number;
  owner: string;
  owned: boolean;
  approved: number;
  requests: Request[];
  link: string;
  closed?: boolean;
};

const near: Record<string, string[]> = {
  광안리: ["수영"],
  수영: ["광안리", "센텀"],
  센텀: ["수영", "해운대"],
  해운대: ["센텀"],
  연산: ["동래"],
  동래: ["연산"],
  사상: ["사상터미널"],
  사상터미널: ["사상"],
  덕천: ["대저"],
  대저: ["덕천"],
};
const minutes = (t: string) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function recommend(rides: Ride[], listed: Ride[], mode: Mode) {
  return listed
    .flatMap((r) => {
      if (
        r.mode !== mode ||
        r.owned ||
        r.closed ||
        r.approved >= r.capacity ||
        r.requests.length
      )
        return [];
      const times = rides
        .filter(
          (m) =>
            m.owned &&
            m.mode === mode &&
            m.date === r.date &&
            (mode === "입소" || m.origin === r.origin),
        )
        .map((m) => ({
          place: mode === "입소" ? m.origin : m.destination,
          diff: Math.abs(minutes(r.time) - minutes(m.time)),
        }))
        .filter((m) => m.diff <= 30);
      const place = mode === "입소" ? r.origin : r.destination;
      const match = times
        .map((m) => ({
          ...m,
          rank:
            m.place === place
              ? 0
              : Object.hasOwn(near, m.place) && near[m.place].includes(place)
                ? 1
                : 2,
        }))
        .filter((m) => m.rank < 2)
        .sort((a, b) => a.rank - b.rank || a.diff - b.diff)[0];
      return match ? [{ ...r, ...match }] : [];
    })
    .sort((a, b) => a.rank - b.rank || a.diff - b.diff);
}
