import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const out = path.resolve('output/core-audit');
const file = fs.readdirSync(out).filter(name => /^live-\d+\.db$/.test(name)).sort().at(-1);
const db = new DatabaseSync(path.join(out, file), { readOnly: true });
console.log(db.prepare(`SELECT COUNT(*) AS encrypted_messages,
 SUM(CASE WHEN content_text != '' THEN 1 ELSE 0 END) AS plaintext_leaks
 FROM messages WHERE ciphertext_payload IS NOT NULL`).get());
console.log(db.prepare(`SELECT m.id, c.type AS destination_type, length(m.ciphertext_payload) AS envelope_bytes,
 m.ciphertext_payload = original.ciphertext_payload AS copied_source_ciphertext
 FROM messages m JOIN messages original ON original.id = m.forwarded_from_message_id
 JOIN chats c ON c.id = m.chat_id`).all());
db.close();
