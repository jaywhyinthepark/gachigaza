begin;
create extension if not exists pg_cron;
select cron.schedule('bnk-expiry','* * * * *',$job$
 delete from carpool.rides where moment <= now() - interval '24 hours';
 delete from carpool.login_limits where starts < now() - interval '15 minutes';
$job$);
commit;
