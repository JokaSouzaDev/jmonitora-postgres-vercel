import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {closePool,transaction} from '../src/db.js';
import {audit} from '../src/audit.js';
import {raSchema} from '../src/schemas.js';
const filename=process.argv[2];
if(!filename)throw new Error('Uso: npm run db:import-json -- /caminho/relatorios.json');
const schema=z.array(z.object({id:z.string().uuid(),ra:raSchema,observacao:z.string().trim().min(10).max(2000),criadoEm:z.iso.datetime()})).max(10000);
const records=schema.parse(JSON.parse(await readFile(filename,'utf8')));
const authorEmail=process.env.ADMIN_EMAIL?.trim().toLowerCase();
if(!authorEmail)throw new Error('Configure ADMIN_EMAIL para definir o responsável pela importação.');
try{
  const count=await transaction(async client=>{
    const author=(await client.query("SELECT id FROM app_users WHERE email=$1 AND role='ADMIN' AND active=TRUE",[authorEmail])).rows[0];
    if(!author)throw new Error('Administrador não encontrado. Execute db:seed.');
    let inserted=0;
    for(const r of records){
      const student=(await client.query('SELECT id,ra FROM students WHERE ra=$1 FOR SHARE',[r.ra])).rows[0];
      if(!student)throw new Error(`Aluno não cadastrado: RA ${r.ra}. Cadastre corretamente antes de importar. Nenhum registro foi importado.`);
      const existing=(await client.query('SELECT student_ra,observation FROM reports WHERE id=$1',[r.id])).rows[0];
      if(existing){if(existing.student_ra!==r.ra||existing.observation!==r.observacao)throw new Error('ID de relatório já utilizado com outros dados. Importação cancelada.');continue;}
      await client.query(`INSERT INTO reports(id,student_id,student_ra,author_id,observation,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$6)`,[r.id,student.id,student.ra,author.id,r.observacao,r.criadoEm]);
      await audit(client,author.id,'REPORT_IMPORTED','report',r.id);inserted++;
    }return inserted;
  });console.log(`${count} novos relatórios importados; ${records.length-count} já existentes.`);
}finally{await closePool();}
