update whatsapp_messages
   set id = encode(sha256(convert_to(id, 'UTF8')), 'hex')
 where id !~ '^[a-f0-9]{64}$';
