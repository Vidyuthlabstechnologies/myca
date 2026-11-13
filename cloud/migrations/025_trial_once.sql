alter table users add column trial_started_at timestamptz;
update users u set trial_started_at = first.at
  from (select created_by, min(created_at) as at from businesses where not demo and kind <> 'household' and created_by is not null group by created_by) first
 where first.created_by = u.id;
