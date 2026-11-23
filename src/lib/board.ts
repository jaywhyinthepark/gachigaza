export const boardQuery = `select r.id,r.mode,r.origin,r.destination,r.capacity,m.nickname as owner,
 r.creator=$1 as owned,to_char(r.moment at time zone 'Asia/Seoul','YYYY-MM-DD') as date,
 to_char(r.moment at time zone 'Asia/Seoul','HH24:MI') as time,
 r.moment <= now() as closed, 1 + t.seats as approved, t.requests,
 case when r.creator=$1 or t.joined then r.link else '' end as link
from carpool.rides r join carpool.members m on m.id=r.creator
cross join lateral (
 select count(*) filter(where q.status='approved')::int as seats,
 bool_or(q.member=$1 and q.status='approved') as joined,
 coalesce(jsonb_agg(jsonb_build_object('id',q.member,'name',a.nickname,'status',q.status))
 filter(where r.creator=$1 or q.member=$1),'[]'::jsonb) as requests
 from carpool.requests q join carpool.members a on a.id=q.member where q.ride=r.id
) t where r.moment > now()-interval '24 hours' order by r.moment,r.id
`;
