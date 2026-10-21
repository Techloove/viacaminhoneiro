-- Run ONCE in Supabase SQL Editor as project owner AFTER migration 007.
-- Replace only the email with YOUR existing platform operator login.
-- No passwords, provider tokens or service_role keys belong here.
do $$
declare operator_id uuid;
begin
 select id into operator_id from auth.users where lower(email)=lower('SEU_EMAIL_DE_LOGIN') limit 1;
 if operator_id is null then raise exception 'Informe seu e-mail de login já cadastrado antes de executar este script.'; end if;
 insert into via_platform_private.admins(user_id,active) values(operator_id,true) on conflict(user_id) do update set active=true;
end;
$$;
