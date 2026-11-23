begin;
create schema carpool;
revoke all on schema carpool from public;
create table carpool.members (
 id uuid primary key default gen_random_uuid(), nickname text not null check(length(trim(nickname)) between 1 and 20),
 token_hash text not null unique
);
create table carpool.login_limits (
 bucket text primary key, starts timestamptz not null, attempts integer not null
);
create table carpool.rides (
 id uuid primary key default gen_random_uuid(), creator uuid not null references carpool.members,
 mode text not null check(mode in ('입소','퇴소')),
 origin text not null check(length(trim(origin)) between 1 and 50),
 destination text not null check(length(trim(destination)) between 1 and 50),
 check((mode='입소' and destination='연수원') or (mode='퇴소' and origin in ('연수원','본점'))),
 moment timestamptz not null, capacity smallint not null check(capacity between 2 and 4),
 link text not null default '', unique(creator,mode,origin,destination,moment)
);
create index on carpool.rides(moment);
create table carpool.requests (
 ride uuid references carpool.rides on delete cascade,
 member uuid references carpool.members, status text not null check(status in ('pending','approved','rejected')),
 primary key(ride,member)
);
alter table carpool.members enable row level security;
alter table carpool.login_limits enable row level security;
alter table carpool.rides enable row level security;
alter table carpool.requests enable row level security;
-- The server login inherits this group. Browser-facing roles receive no grants.
create role bnk_app nologin;
grant usage on schema carpool to bnk_app;
grant select,insert on carpool.members to bnk_app;
grant select,insert,update on carpool.login_limits to bnk_app;
grant select,insert,update,delete on carpool.rides,carpool.requests to bnk_app;
create policy server_access on carpool.members to bnk_app using(true) with check(true);
create policy server_access on carpool.login_limits to bnk_app using(true) with check(true);
create policy server_access on carpool.rides to bnk_app using(true) with check(true);
create policy server_access on carpool.requests to bnk_app using(true) with check(true);
commit;
