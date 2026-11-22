alter table us_return_purchases add column payment_intent text;
create index us_return_purchases_payment_intent on us_return_purchases (payment_intent) where payment_intent is not null;
