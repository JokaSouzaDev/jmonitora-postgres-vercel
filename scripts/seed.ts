import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { closePool, transaction } from '../src/db.js';
import { audit } from '../src/audit.js';
import { userCreateSchema } from '../src/schemas.js';
const parsed=userCreateSchema.safeParse({name:process.env.ADMIN_NAME,email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,role:'ADMIN'});
if(!parsed.success)throw new Error('Configure ADMIN_NAME, ADMIN_EMAIL e uma ADMIN_PASSWORD válida (8 a 72 bytes).');
try{
  const v=parsed.data;const hash=await bcrypt.hash(v.password,12);
  await transaction(async client=>{
    const result=await client.query(`INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')
      ON CONFLICT(LOWER(email)) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
      role='ADMIN',active=TRUE,approval_status='APPROVED',session_version=app_users.session_version+1,
      version=app_users.version+1,updated_at=NOW() RETURNING id`,[randomUUID(),v.name,v.email,hash]);
    await audit(client,result.rows[0].id,'ADMIN_SEEDED','user',result.rows[0].id);
  });console.log('Administrador configurado. Sessões anteriores dessa conta foram revogadas.');
}finally{await closePool();}
