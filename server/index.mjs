import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const KINDS = ['capture', 'followup', 'conversion', 'completion'];
const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
const TASK_STATES = ['To do', 'In progress', 'Done'];
const PROJECT_STATES = ['Planning', 'In progress', 'Completed', 'On hold'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
const dateOffset = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const id = () => randomUUID();
const safeText = (value, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const truthy = v => v === true || v === 1;
const emailValid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160;
const fail = (code, message) => { const e = new Error(message); e.status = code; throw e; };
function required(text, name, max = 250) { const v = safeText(text, max); if (!v) fail(400, `${name} is required.`); return v; }
function choice(value, valid, fallback) { if (value === undefined || value === null || value === '') return fallback; if (!valid.includes(value)) fail(400, 'Unsupported option.'); return value; }
function validDate(value) { const v = safeText(value, 10); if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v)) fail(400, 'Use a real YYYY-MM-DD date.'); return v; }
const getCookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(item => item.trim().split('=').map(x => decodeURIComponent(x || '')))).northstar_session;
const duration = (d = now()) => d;

export function makeApp(databasePath = process.env.SQLITE_PATH || path.join(ROOT, 'northstar.sqlite')) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, created_at TEXT NOT NULL, touched_at TEXT NOT NULL, notifications_enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS workflows(session TEXT NOT NULL, kind TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(session,kind));
    CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, session TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', service TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New', priority TEXT NOT NULL DEFAULT 'Medium', value REAL NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', follow_up TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session);
    CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY, session TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', source_lead TEXT UNIQUE, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_customers_session ON customers(session);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, session TEXT NOT NULL, customer_id TEXT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Planning', deadline TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_projects_session ON projects(session);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, session TEXT NOT NULL, project_id TEXT, lead_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'To do', priority TEXT NOT NULL DEFAULT 'Medium', due_at TEXT NOT NULL DEFAULT '', automation_key TEXT UNIQUE, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session);
    CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY, session TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY, session TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, session TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  `);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
  function activity(session, type, detail, seeded = 0) { run('INSERT INTO activities VALUES(?,?,?,?,?,?)', id(), session, type, detail, seeded, now()); }
  function notice(session, title, detail) { if (one('SELECT notifications_enabled FROM sessions WHERE token=?', session)?.notifications_enabled) run('INSERT INTO notifications VALUES(?,?,?,?,?,?)', id(), session, title, detail, 0, now()); }
  function execution(session, kind, status, mode, details) { run('INSERT INTO executions VALUES(?,?,?,?,?,?,?)', id(), session, kind, status, mode, details, now()); }
  function enabled(session, kind) { return Boolean(one('SELECT enabled FROM workflows WHERE session=? AND kind=?', session, kind)?.enabled); }
  function own(table, session, itemId) { const item = one(`SELECT * FROM ${table} WHERE session=? AND id=?`, session, itemId); if (!item) fail(404, 'Record not found.'); return item; }
  function ensureLink(table, session, itemId) { if (itemId) own(table, session, itemId); return itemId || null; }
  function newLead(session, data, mode = 'manual') {
    const name = required(data.name, 'Name', 100); const email = safeText(data.email, 160).toLowerCase(); if (!emailValid(email)) fail(400, 'Enter a valid email address.');
    const status = choice(data.status, STAGES, 'New'), priority = choice(data.priority, PRIORITIES, 'Medium');
    const value = Number(data.value || 0); if (!Number.isFinite(value) || value < 0 || value > 100000000) fail(400, 'Enter a valid opportunity value.');
    const recent=one('SELECT COUNT(*) count FROM leads WHERE session=? AND created_at>?', session, new Date(Date.now()-3600000).toISOString()).count;
    if (recent >= 40) fail(429, 'This demo has reached its hourly inquiry limit.');
    const leadId = id();
    transaction(() => {
      run('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', leadId, session, name, email, safeText(data.company,100), safeText(data.service,120), status, priority, value, safeText(data.notes,1500), validDate(data.follow_up), now(), now());
      activity(session, 'lead', `${name} was added to the pipeline`);
      if (mode === 'inquiry' && enabled(session,'capture')) { execution(session,'capture','success','automatic', `Inquiry received from ${name}`); notice(session, 'New inquiry received', `${name} submitted a project inquiry`); }
    });
    if (status === 'Won') convert(session, leadId);
    return one('SELECT * FROM leads WHERE id=?', leadId);
  }
  function convert(session, leadId) {
    if (!enabled(session, 'conversion')) return false;
    const lead = own('leads', session, leadId);
    if (lead.status !== 'Won') return false;
    if (one('SELECT id FROM customers WHERE session=? AND source_lead=?', session, leadId)) return false;
    transaction(() => {
      run('INSERT OR IGNORE INTO customers VALUES(?,?,?,?,?,?,?,?)', id(), session, lead.name, lead.email, lead.company, lead.notes, leadId, now());
      execution(session, 'conversion', 'success', 'automatic', `${lead.name} converted to a customer`);
      activity(session, 'conversion', `${lead.name} converted into a customer`);
      notice(session, 'Lead converted', `${lead.name} is now a customer`);
    });
    return true;
  }
  function checkProject(session, projectId) {
    if (!projectId || !enabled(session, 'completion')) return false;
    const project = own('projects', session, projectId);
    const t = all('SELECT status FROM tasks WHERE session=? AND project_id=?', session, projectId);
    if (project.status === 'Completed' && t.some(t => t.status !== 'Done')) {
      run("UPDATE projects SET status='In progress' WHERE id=? AND session=?", projectId, session);
      activity(session, 'project', `${project.name} reopened after a task changed`);
      return false;
    }
    if (project.status === 'Completed' || !t.length || t.some(t => t.status !== 'Done')) return false;
    transaction(() => {
      run("UPDATE projects SET status='Completed' WHERE id=? AND session=?", projectId, session);
      execution(session, 'completion', 'success', 'automatic', `${project.name} completed: all ${t.length} tasks finished`);
      activity(session, 'project', `${project.name} was completed automatically`);
      notice(session, 'Project completed', `${project.name} — all tasks finished`);
    });
    return true;
  }
  function followups(session, mode = 'automatic') {
    if (!enabled(session, 'followup')) { if (mode === 'manual') fail(409, 'Enable this workflow before running it.'); return 0; }
    const eligible = all("SELECT * FROM leads WHERE session=? AND follow_up<>'' AND follow_up<=? AND status NOT IN ('Won','Lost')", session, dateOffset(0));
    let created = 0;
    transaction(() => {
      for (const lead of eligible) {
        const key = `followup:${lead.id}:${lead.follow_up}`;
        if (one('SELECT id FROM tasks WHERE automation_key=?', key)) continue;
        run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)', id(), session, null, lead.id, `Follow up with ${lead.name}`, `Due follow-up for ${lead.company || lead.name}`, 'To do', lead.priority, lead.follow_up, key, now());
        activity(session, 'task', `Follow-up task created for ${lead.name}`);
        notice(session, 'Follow-up due', `Reach out to ${lead.name}`);
        created++;
      }
      execution(session, 'followup', created ? 'success' : 'skipped', mode, created ? `${created} follow-up task${created > 1?'s':''} created` : 'No new follow-ups due');
    });
    return created;
  }
  function seed(session) {
    const leads = [
      ['Olivia Chen','olivia@atlasdemo.example','Atlas Studio','Brand identity','Qualified','High',6800,dateOffset(-1)],
      ['Liam Carter','liam@helio.example','Helio Labs','Web development','Proposal','High',12500,dateOffset(2)],
      ['Sofia Patel','sofia@river.example','River & Co.','Marketing automation','New','Medium',4200,dateOffset(3)],
      ['Noah Wilson','noah@kinetic.example','Kinetic Media','Website redesign','Contacted','Medium',7600,dateOffset(-2)],
      ['Maya Torres','maya@nova.example','Nova Social','Social strategy','Qualified','High',5200,dateOffset(5)],
      ['Ethan Brooks','ethan@monogram.example','Monogram','Email flows','Proposal','Low',3600,dateOffset(4)],
      ['Ava Martin','ava@everly.example','Everly Goods','Web development','New','Medium',8900,dateOffset(6)],
      ['Leo Jackson','leo@orbit.example','Orbit Design','CRM setup','Lost','Low',2700,''],
      ['Isabella Lee','isabella@flora.example','Flora House','Brand identity','Won','Medium',4900,'']
    ];
    const leadIds = [];
    leads.forEach((l, i) => { const lid = id(); leadIds.push(lid); run('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', lid, session, l[0],l[1],l[2],l[3],l[4],l[5],l[6],`Demo inquiry · ${l[3]}`,l[7],new Date(Date.now()-i*86400000).toISOString(),now()); });
    const customers = [ ['Harper Lane','harper@form.example','Form & Function'],['James Miller','james@uplift.example','Uplift Agency'],['Amelia Reed','amelia@bright.example','Brightfield'],['Oliver Green','oliver@work.example','Workwell'] ];
    const cids = customers.map(c => { const cid=id(); run('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)',cid,session,c[0],c[1],c[2],'Demo customer',null,now()); return cid; });
    run('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)', id(), session, 'Isabella Lee', 'isabella@flora.example', 'Flora House', 'Seeded demo conversion', leadIds[8], now());
    const projects = [ ['Website experience refresh','In progress',dateOffset(14),0],['CRM onboarding','In progress',dateOffset(8),1],['Spring brand launch','Planning',dateOffset(29),2],['Email campaign setup','On hold',dateOffset(20),3] ];
    projects.forEach((p, n) => {
      const pid=id();run('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',pid,session,cids[p[3]],p[0],`Portfolio sample project for ${customers[p[3]][2]}`,p[1],p[2],now());
      const taskNames = n===0?['Audit current pages','Design component library','Implement responsive layout','QA review']:n===1?['Map intake workflow','Import sample leads','Configure automations']:n===2?['Concept exploration','Client review','Prepare final assets']:['Write email sequence','Build email templates','Review tracking'];
      taskNames.forEach((title,i) => run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)', id(),session,pid,null,title,'Demo project task',i===0?'Done':i===1&&n<2?'In progress':'To do',i===2?'High':'Medium',dateOffset(n*4+i*2+1),null,now()));
    });
    activity(session, 'seed', 'Demo workspace created with fictional sample records', 1);
    notice(session, 'Welcome to Northstar Ops', 'Explore your private sample workspace. Changes are saved on this server.');
  }
  function makeSession(req, headers) {
    let token = getCookie(req); const isValid = token && /^[a-f0-9]{64}$/.test(token);
    if (isValid && one('SELECT token FROM sessions WHERE token=? AND touched_at>?', token, new Date(Date.now()-SESSION_TTL).toISOString())) {
      run('UPDATE sessions SET touched_at=? WHERE token=?', now(), token); return token;
    }
    token = randomBytes(32).toString('hex');
    transaction(() => {
      run('INSERT INTO sessions(token,created_at,touched_at) VALUES(?,?,?)',token,now(),now());
      KINDS.forEach(kind=>run('INSERT INTO workflows VALUES(?,?,1)',token,kind));
      seed(token);
    });
    headers['Set-Cookie'] = `northstar_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL/1000)}${process.env.NODE_ENV==='production'?'; Secure':''}`;
    return token;
  }
  function workspace(s) {
    // Never echo the private bearer session token into frontend JSON.
    const rows = table => all(`SELECT * FROM ${table} WHERE session=? ORDER BY created_at DESC`, s).map(({session: _secret, ...record})=>record);
    return {
      leads:rows('leads'),
      customers:rows('customers'),
      projects:rows('projects'),
      tasks:rows('tasks'),
      workflows:all('SELECT kind,enabled FROM workflows WHERE session=?',s),
      activities:rows('activities').slice(0,80),
      executions:rows('executions').slice(0,80),
      notifications:rows('notifications').slice(0,50),
      settings:one('SELECT notifications_enabled FROM sessions WHERE token=?',s),
      workspace:'Private fictional demo',
      scheduler:process.env.ENABLE_SCHEDULER !== '0'
    };
  }
  function writeLead(s, d, rid) {
    const old = own('leads',s,rid);
    const name=required(d.name ?? old.name,'Name',100), email=safeText(d.email ?? old.email,160).toLowerCase();if(!emailValid(email))fail(400,'Enter a valid email address.');
    const status=choice(d.status,STAGES,old.status), priority=choice(d.priority,PRIORITIES,old.priority);
    const value=Number(d.value ?? old.value);if(!Number.isFinite(value)||value<0||value>100000000)fail(400,'Invalid value.');
    run('UPDATE leads SET name=?, email=?,company=?,service=?,status=?,priority=?,value=?,notes=?,follow_up=?,updated_at=? WHERE id=? AND session=?',name,email,safeText(d.company??old.company,100),safeText(d.service??old.service,120),status,priority,value,safeText(d.notes??old.notes,1500),validDate(d.follow_up??old.follow_up),now(),rid,s);
    activity(s,'lead',`${name} updated · ${status}`);if(status==='Won')convert(s,rid);
  }
  function writeCustomer(s,d,rid=null){
    const old=rid?own('customers',s,rid):{};
    const name=required(d.name??old.name,'Customer name',100),email=safeText(d.email??old.email,160).toLowerCase();if(!emailValid(email))fail(400,'Enter a valid email address.');
    const company=safeText(d.company??old.company,100),notes=safeText(d.notes??old.notes,1500);
    if(rid)run('UPDATE customers SET name=?,email=?,company=?,notes=? WHERE id=? AND session=?',name,email,company,notes,rid,s);
    else run('INSERT INTO customers VALUES(?,?,?,?,?,?,?,?)',id(),s,name,email,company,notes,null,now());
    activity(s,'customer',`${name} ${rid?'updated':'added'}`);
  }
  function writeProject(s,d,rid=null){
    const old=rid?own('projects',s,rid):{};
    const name=required(d.name??old.name,'Project name',120),description=safeText(d.description??old.description,1000);
    const customerId=ensureLink('customers',s,d.customer_id===undefined?old.customer_id:d.customer_id);
    const status=choice(d.status,PROJECT_STATES,old.status||'Planning'),deadline=validDate(d.deadline??old.deadline);
    if(rid)run('UPDATE projects SET name=?,description=?,customer_id=?,status=?,deadline=? WHERE id=? AND session=?',name,description,customerId,status,deadline,rid,s);
    else run('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',id(),s,customerId,name,description,status,deadline,now());
    activity(s,'project',`${name} ${rid?'updated':'created'}`);
  }
  function writeTask(s,d,rid=null){
    const old=rid?own('tasks',s,rid):{};
    const title=required(d.title??old.title,'Task title',140),description=safeText(d.description??old.description,700);
    const projectId=ensureLink('projects',s,d.project_id===undefined?old.project_id:d.project_id);
    const leadId=ensureLink('leads',s,d.lead_id===undefined?old.lead_id:d.lead_id);
    const status=choice(d.status,TASK_STATES,old.status||'To do'),priority=choice(d.priority,PRIORITIES,old.priority||'Medium'),due=validDate(d.due_at??old.due_at);
    if(rid)run('UPDATE tasks SET title=?,description=?,project_id=?,lead_id=?,status=?,priority=?,due_at=? WHERE id=? AND session=?',title,description,projectId,leadId,status,priority,due,rid,s);
    else run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),s,projectId,leadId,title,description,status,priority,due,null,now());
    activity(s,'task',`${title} ${status==='Done'?'completed':rid?'updated':'created'}`);
    if(projectId)checkProject(s,projectId);
    if(old.project_id && old.project_id!==projectId)checkProject(s,old.project_id);
  }
  function resetSession(s){
    transaction(()=>{
      ['tasks','projects','customers','leads','activities','executions','notifications'].forEach(t=>run(`DELETE FROM ${t} WHERE session=?`,s));
      run('UPDATE workflows SET enabled=1 WHERE session=?',s);
      run('UPDATE sessions SET notifications_enabled=1 WHERE token=?',s);
      seed(s);
    });
  }
  const typeMap={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const hits=new Map();
  function rate(req) {
    const key=req.socket.remoteAddress||'unknown'; const t=Date.now();const existing=hits.get(key)||[];const recent=existing.filter(x=>t-x<60000);recent.push(t);hits.set(key,recent);if(recent.length>150)fail(429,'Too many requests. Try again shortly.');
    if(hits.size>3000)for(const [k,v] of hits)if(v[v.length-1]<t-60000)hits.delete(k);
  }
  async function handler(req,res){
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
    function reply(status,data){ res.writeHead(status, {...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); }
    try {
      rate(req);
      const url=new URL(req.url||'/', 'http://localhost');
      if(url.pathname==='/health')return reply(200,{status:'ok',service:'northstar-ops'});
      if(!url.pathname.startsWith('/api/')){
        if(!['GET','HEAD'].includes(req.method))return reply(405,{error:'Method not allowed.'});
        const pathname=url.pathname==='/'?'/index.html':url.pathname;
        const relative=path.posix.normalize(decodeURIComponent(pathname));
        if(relative.includes('..')||relative.startsWith('/.'))return reply(404,{error:'Not found.'});
        const location=path.resolve(PUBLIC, '.'+relative);
        if(!location.startsWith(PUBLIC+path.sep))return reply(404,{error:'Not found.'});
        try { const bytes=await readFile(location);res.writeHead(200,{...headers,'Content-Type':typeMap[path.extname(location)]||'application/octet-stream','Cache-Control':'public, max-age=60'});res.end(req.method==='HEAD'?undefined:bytes); }
        catch { res.writeHead(404,headers);res.end('Not found'); }return;
      }
      if(!['GET','POST','PATCH','DELETE'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method!=='GET'){
        const origin=req.headers.origin;
        if(origin){const host=req.headers['x-forwarded-host']||req.headers.host||'';if(new URL(origin).host!==host)fail(403,'Cross-site requests are not allowed.');}
        if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'JSON body required.');
      }
      const session=makeSession(req,headers);
      const parts=url.pathname.split('/').filter(Boolean).slice(1);
      const [resource,record,action]=parts;
      if(req.method==='GET'){
        if(resource==='state')return reply(200,workspace(session));
        fail(404,'Endpoint not found.');
      }
      let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>20000)fail(413,'Request too large.');}
      let data;try {data=JSON.parse(text||'{}');}catch{fail(400,'Invalid JSON.');}
      if(!data||Array.isArray(data)||typeof data!=='object')fail(400,'Expected a JSON object.');
      if(resource==='reset' && req.method==='POST'){if(data.confirm !== true)fail(400,'Reset confirmation required.');resetSession(session);return reply(200,{ok:true});}
      if(resource==='inquiry' && req.method==='POST'){if(!enabled(session,'capture'))fail(409,'Lead capture workflow is disabled.');const v=newLead(session,data,'inquiry');return reply(201,{ok:true,id:v.id});}
      if(resource==='leads'){
        if(!record && req.method==='POST'){const v=newLead(session,data);return reply(201,{ok:true,id:v.id});}
        if(record && req.method==='PATCH'){writeLead(session,data,record);return reply(200,{ok:true});}
        if(record && req.method==='DELETE'){const l=own('leads',session,record);run('DELETE FROM tasks WHERE session=? AND lead_id=?',session,record);run('DELETE FROM leads WHERE session=? AND id=?',session,record);activity(session,'lead',`${l.name} deleted`);return reply(200,{ok:true});}
      }
      if(resource==='customers'){
        if(!record && req.method==='POST'){writeCustomer(session,data);return reply(201,{ok:true});}
        if(record && req.method==='PATCH'){writeCustomer(session,data,record);return reply(200,{ok:true});}
        if(record && req.method==='DELETE'){const c=own('customers',session,record);run('UPDATE projects SET customer_id=NULL WHERE session=? AND customer_id=?',session,record);run('DELETE FROM customers WHERE session=? AND id=?',session,record);activity(session,'customer',`${c.name} deleted`);return reply(200,{ok:true});}
      }
      if(resource==='projects'){
        if(!record && req.method==='POST'){writeProject(session,data);return reply(201,{ok:true});}
        if(record && req.method==='PATCH'){writeProject(session,data,record);return reply(200,{ok:true});}
        if(record && req.method==='DELETE'){const p=own('projects',session,record);run('DELETE FROM tasks WHERE session=? AND project_id=?',session,record);run('DELETE FROM projects WHERE session=? AND id=?',session,record);activity(session,'project',`${p.name} deleted`);return reply(200,{ok:true});}
      }
      if(resource==='tasks'){
        if(!record && req.method==='POST'){writeTask(session,data);return reply(201,{ok:true});}
        if(record && req.method==='PATCH'){writeTask(session,data,record);return reply(200,{ok:true});}
        if(record && req.method==='DELETE'){const t=own('tasks',session,record);run('DELETE FROM tasks WHERE session=? AND id=?',session,record);activity(session,'task',`${t.title} deleted`);if(t.project_id)checkProject(session,t.project_id);return reply(200,{ok:true});}
      }
      if(resource==='workflows' && record){
        if(!KINDS.includes(record))fail(404,'Unknown workflow.');
        if(req.method==='PATCH'){run('UPDATE workflows SET enabled=? WHERE session=? AND kind=?',truthy(data.enabled)?1:0,session,record);activity(session,'workflow',`${record} workflow ${truthy(data.enabled)?'enabled':'disabled'}`);return reply(200,{ok:true});}
        if(req.method==='POST' && action==='run'){
          if(record!=='followup')fail(400,'This workflow runs from its business trigger. Use the relevant form or status change.');
          return reply(200,{ok:true,created:followups(session,'manual')});
        }
      }
      if(resource==='notifications' && record==='read' && req.method==='POST'){run('UPDATE notifications SET is_read=1 WHERE session=?',session);return reply(200,{ok:true});}
      if(resource==='settings' && req.method==='PATCH'){run('UPDATE sessions SET notifications_enabled=? WHERE token=?',truthy(data.notifications_enabled)?1:0,session);return reply(200,{ok:true});}
      fail(404,'Endpoint not found.');
    }catch(err){const status=err.status||500;if(status===500)console.error('[northstar]',err);reply(status,{error:status===500?'Something went wrong. Please try again.':err.message});}
  }
  function schedulerTick(){
    try {
      for(const {token} of all('SELECT token FROM sessions WHERE touched_at>?',new Date(Date.now()-SESSION_TTL).toISOString())){
        const due=one("SELECT 1 FROM leads l WHERE l.session=? AND l.follow_up<>'' AND l.follow_up<=? AND l.status NOT IN ('Won','Lost') AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.automation_key=('followup:'||l.id||':'||l.follow_up)) LIMIT 1",token,dateOffset(0));
        if(due)followups(token,'scheduled');
      }
      const expired=all('SELECT token FROM sessions WHERE touched_at<?',new Date(Date.now()-SESSION_TTL).toISOString());
      for(const {token} of expired){for(const table of ['tasks','projects','customers','leads','activities','executions','notifications','workflows','sessions'])run(`DELETE FROM ${table} WHERE ${table==='sessions'?'token':'session'}=?`,token);}
    }catch(err){console.error('Scheduled workflow error',err);}
  }
  let timer;
  function start(port=Number(process.env.PORT)||3000){const server=http.createServer(handler);return new Promise(resolve=>{server.listen(port,'0.0.0.0',()=>{if(process.env.ENABLE_SCHEDULER!=='0'){timer=setInterval(schedulerTick,60000);timer.unref();}resolve(server);});});}
  async function close(server){if(timer)clearInterval(timer);if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));db.close();}
  return {handler,start,close,db,followups,schedulerTick};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  makeApp().start().then(server=>console.log(`Northstar Ops running on http://localhost:${server.address().port}`));
}