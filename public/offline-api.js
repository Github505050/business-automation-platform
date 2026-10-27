/* Northstar Ops public showcase: browser-persistent, fictional-only workspace.
 * This adapter performs real local CRUD and event-driven simulations.
 * It is NOT the Node.js/SQLite backend or an autonomous scheduler.
 */
(() => {
  'use strict';
  const KEY = 'northstar-public-demo-v2';
  const kinds = ['capture', 'followup', 'conversion', 'completion'];
  const leadStages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
  const taskStatuses = ['To do', 'In progress', 'Done'];
  const projectStatuses = ['Planning', 'In progress', 'Completed', 'On hold'];
  const priorities = ['Low', 'Medium', 'High'];
  const date = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const stamp = () => new Date().toISOString();
  const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const text = (v, max = 250) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  function error(message) { throw new Error(message); }
  function required(v, name, max = 250) { const x = text(v, max); if (!x) error(`${name} is required.`); return x; }
  function email(v) { const x = text(v, 160).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) error('Enter a valid email address.'); return x; }
  function choice(v, list, fallback) { if (v === undefined || v === null || v === '') return fallback; if (!list.includes(v)) error('Unsupported option.'); return v; }
  function validDate(v) { const x = text(v, 10); if (x && (!/^\d{4}-\d{2}-\d{2}$/.test(x) || Number.isNaN(Date.parse(x)) || new Date(x).toISOString().slice(0, 10) !== x)) error('Use a real YYYY-MM-DD date.'); return x; }
  function log(s, type, detail, seeded = 0) { s.activities.unshift({ id: uid(), type, detail, seeded, created_at: stamp() }); s.activities.length = Math.min(s.activities.length, 80); }
  function notify(s, title, detail) { if (s.settings.notifications_enabled) { s.notifications.unshift({ id: uid(), title, detail, is_read: 0, created_at: stamp() }); s.notifications.length = Math.min(s.notifications.length, 50); } }
  function execute(s, kind, mode, details, status = 'success') { s.executions.unshift({ id: uid(), kind, status, mode, details, created_at: stamp() }); s.executions.length = Math.min(s.executions.length, 80); }
  function on(s, kind) { return !!s.workflows.find(w => w.kind === kind)?.enabled; }
  function find(s, table, id) { const row = s[table].find(r => r.id === id); if (!row) error('Record not found.'); return row; }
  function link(s, table, id) { if (!id) return null; find(s, table, id); return id; }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { error('Unable to save demo changes. Check browser storage permissions.'); } }
  function seed() {
    const s = { leads: [], customers: [], projects: [], tasks: [], workflows: kinds.map(kind => ({kind, enabled: 1})), activities: [], executions: [], notifications: [], settings: {notifications_enabled: 1}, workspace:'Browser-only fictional demo', scheduler:false };
    const sample = [
      ['Olivia Chen','olivia@atlasdemo.example','Atlas Studio','Brand identity','Qualified','High',6800,-1],
      ['Liam Carter','liam@helio.example','Helio Labs','Web development','Proposal','High',12500,2],
      ['Sofia Patel','sofia@river.example','River & Co.','Marketing automation','New','Medium',4200,3],
      ['Noah Wilson','noah@kinetic.example','Kinetic Media','Website redesign','Contacted','Medium',7600,-2],
      ['Maya Torres','maya@nova.example','Nova Social','Social strategy','Qualified','High',5200,5],
      ['Ethan Brooks','ethan@monogram.example','Monogram','Email flows','Proposal','Low',3600,4],
      ['Ava Martin','ava@everly.example','Everly Goods','Web development','New','Medium',8900,6],
      ['Leo Jackson','leo@orbit.example','Orbit Design','CRM setup','Lost','Low',2700,null],
      ['Isabella Lee','isabella@flora.example','Flora House','Brand identity','Won','Medium',4900,null]
    ];
    sample.forEach((a,i) => s.leads.push({id:uid(),name:a[0],email:a[1],company:a[2],service:a[3],status:a[4],priority:a[5],value:a[6],notes:`Fictional inquiry: ${a[3]}`,follow_up:a[7]===null?'':date(a[7]),created_at:new Date(Date.now()-i*86400000).toISOString(),updated_at:stamp()}));
    for (const [name, mail, company] of [['Harper Lane','harper@form.example','Form & Function'],['James Miller','james@uplift.example','Uplift Agency'],['Amelia Reed','amelia@bright.example','Brightfield'],['Oliver Green','oliver@work.example','Workwell']]) s.customers.push({id:uid(),name,email:mail,company,notes:'Fictional customer',source_lead:null,created_at:stamp()});
    const win=s.leads[8];s.customers.push({id:uid(),name:win.name,email:win.email,company:win.company,notes:'Seeded demonstration conversion',source_lead:win.id,created_at:stamp()});
    [['Website experience refresh','In progress',14,0],['CRM onboarding','In progress',8,1],['Spring brand launch','Planning',29,2],['Email campaign setup','On hold',20,3]].forEach(([name,status,days,client],n)=>{
      const p={id:uid(),customer_id:s.customers[client].id,name,description:'Fictional sample project',status,deadline:date(days),created_at:stamp()};s.projects.push(p);
      const titles=[['Audit current pages','Design component library','Implement responsive layout','QA review'],['Map intake workflow','Import sample leads','Configure automations'],['Concept exploration','Client review','Prepare final assets'],['Write email sequence','Build email templates','Review tracking']][n];
      titles.forEach((title,i)=>s.tasks.push({id:uid(),project_id:p.id,lead_id:null,title,description:'Fictional project task',status:i===0?'Done':i===1&&n<2?'In progress':'To do',priority:i===2?'High':'Medium',due_at:date(n*4+i*2+1),automation_key:null,created_at:stamp()}));
    });
    log(s,'seed','Browser demo opened with fictional records',1);notify(s,'Welcome to Northstar Ops','Your edits are saved in this browser only.');return s;
  }
  function load() {
    try { const v=localStorage.getItem(KEY); if(v) { const s=JSON.parse(v); if(Array.isArray(s.leads)&&Array.isArray(s.tasks)&&Array.isArray(s.workflows)) return s; } } catch {}
    const s=seed();save(s);return s;
  }
  function conversion(s, lead) {
    if (!on(s,'conversion') || lead.status!=='Won' || s.customers.some(c=>c.source_lead===lead.id)) return;
    s.customers.unshift({id:uid(),name:lead.name,email:lead.email,company:lead.company,notes:lead.notes,source_lead:lead.id,created_at:stamp()});
    execute(s,'conversion','automatic',`${lead.name} converted to a customer`);log(s,'conversion',`${lead.name} converted into a customer`);notify(s,'Lead converted',`${lead.name} is now a customer`);
  }
  function completion(s, projectId) {
    if(!projectId||!on(s,'completion')) return;
    const p=find(s,'projects',projectId), ts=s.tasks.filter(t=>t.project_id===projectId);
    if (p.status==='Completed'&&ts.some(t=>t.status!=='Done')) {p.status='In progress';log(s,'project',`${p.name} reopened after a task changed`);return;}
    if(p.status==='Completed'||ts.length===0||ts.some(t=>t.status!=='Done'))return;
    p.status='Completed';execute(s,'completion','automatic',`${p.name} completed: all ${ts.length} tasks finished`);log(s,'project',`${p.name} completed via browser demo automation`);notify(s,'Project completed',`${p.name} — all tasks finished`);
  }
  function followup(s) {
    if(!on(s,'followup'))error('Enable this workflow before running it.');let created=0;
    for(const lead of s.leads.filter(l=>l.follow_up&&l.follow_up<=date(0)&&!['Won','Lost'].includes(l.status))) {
      const key=`followup:${lead.id}:${lead.follow_up}`;if(s.tasks.some(t=>t.automation_key===key))continue;
      s.tasks.unshift({id:uid(),project_id:null,lead_id:lead.id,title:`Follow up: ${lead.name}`,description:'Created by browser demo workflow',status:'To do',priority:lead.priority,due_at:lead.follow_up,automation_key:key,created_at:stamp()});created++;log(s,'task',`Follow-up task created for ${lead.name}`);notify(s,'Follow-up due',`${lead.name} needs attention`);
    }
    execute(s,'followup','manual',`Browser test: ${created} follow-up task${created===1?'':'s'} created`);return created;
  }
  function writeLead(s, d, current=null, inquiry=false) {
    const name=required(d.name??current?.name,'Name',100), mail=email(d.email??current?.email), status=choice(d.status,leadStages,current?.status||'New');
    const amount=Number(d.value??current?.value??0);if(!Number.isFinite(amount)||amount<0||amount>1e8)error('Enter a valid opportunity value.');
    const lead={...current,id:current?.id||uid(),name,email:mail,company:text(d.company??current?.company,100),service:text(d.service??current?.service,120),status:inquiry?'New':status,priority:choice(d.priority,priorities,current?.priority||'Medium'),value:amount,notes:text(d.notes??current?.notes,1500),follow_up:validDate(d.follow_up??current?.follow_up),created_at:current?.created_at||stamp(),updated_at:stamp()};
    if(current)Object.assign(current,lead);else s.leads.unshift(lead);
    log(s,'lead',`${name} ${current?'updated':'added to the pipeline'}`);
    if(inquiry){execute(s,'capture','automatic',`Browser-demo inquiry from ${name}`);notify(s,'New fictional inquiry',`${name} submitted an example inquiry`);}
    if(lead.status==='Won')conversion(s,lead);
    return lead;
  }
  function updateCustomer(s,d,row=null){const name=required(d.name??row?.name,'Customer name',100),mail=email(d.email??row?.email);const record={...row,id:row?.id||uid(),name,email:mail,company:text(d.company??row?.company,100),notes:text(d.notes??row?.notes,1500),source_lead:row?.source_lead||null,created_at:row?.created_at||stamp()};if(row)Object.assign(row,record);else s.customers.unshift(record);log(s,'customer',`${name} ${row?'updated':'added'}`);}
  function updateProject(s,d,row=null){const name=required(d.name??row?.name,'Project name',120),status=choice(d.status,projectStatuses,row?.status||'Planning');const record={...row,id:row?.id||uid(),customer_id:link(s,'customers',d.customer_id===undefined?row?.customer_id:d.customer_id),name,description:text(d.description??row?.description,1000),status,deadline:validDate(d.deadline??row?.deadline),created_at:row?.created_at||stamp()};if(row)Object.assign(row,record);else s.projects.unshift(record);log(s,'project',`${name} ${row?'updated':'created'}`);}
  function updateTask(s,d,row=null){const title=required(d.title??row?.title,'Task title',140),project_id=link(s,'projects',d.project_id===undefined?row?.project_id:d.project_id),lead_id=link(s,'leads',d.lead_id===undefined?row?.lead_id:d.lead_id);const oldProject=row?.project_id;const record={...row,id:row?.id||uid(),project_id,lead_id,title,description:text(d.description??row?.description,700),status:choice(d.status,taskStatuses,row?.status||'To do'),priority:choice(d.priority,priorities,row?.priority||'Medium'),due_at:validDate(d.due_at??row?.due_at),automation_key:row?.automation_key||null,created_at:row?.created_at||stamp()};if(row)Object.assign(row,record);else s.tasks.unshift(record);log(s,'task',`${title} ${record.status==='Done'?'completed':row?'updated':'created'}`);completion(s,project_id);if(oldProject&&oldProject!==project_id)completion(s,oldProject);}
  async function handle(path,method='GET',d={}){
    if(method==='GET'&&path==='state')return load();
    const s=load(),[table,id,act]=path.split('/');let result={ok:true};
    if(table==='reset'&&method==='POST'){if(d.confirm!==true)error('Reset confirmation required.');const fresh=seed();save(fresh);return result;}
    if(table==='inquiry'&&method==='POST'){if(!on(s,'capture'))error('Lead capture workflow is disabled.');result.id=writeLead(s,d,null,true).id;}
    else if(['leads','customers','projects','tasks'].includes(table)){
      if(method==='POST'&&!id){if(table==='leads')result.id=writeLead(s,d).id;else if(table==='customers')updateCustomer(s,d);else if(table==='projects')updateProject(s,d);else updateTask(s,d);}
      else if(method==='PATCH'&&id){const row=find(s,table,id);if(table==='leads')writeLead(s,d,row);else if(table==='customers')updateCustomer(s,d,row);else if(table==='projects')updateProject(s,d,row);else updateTask(s,d,row);}
      else if(method==='DELETE'&&id){const row=find(s,table,id);s[table]=s[table].filter(r=>r.id!==id);
        if(table==='leads')s.tasks=s.tasks.filter(t=>t.lead_id!==id);
        if(table==='customers')s.projects.forEach(p=>{if(p.customer_id===id)p.customer_id=null;});
        if(table==='projects')s.tasks=s.tasks.filter(t=>t.project_id!==id);
        log(s,table.slice(0,-1),`${row.name||row.title} deleted`);
        if(table==='tasks'&&row.project_id)completion(s,row.project_id);
      }else error('Unknown action.');
    }else if(table==='workflows'&&id&&kinds.includes(id)){
      if(method==='PATCH'){const w=s.workflows.find(w=>w.kind===id);w.enabled=d.enabled?1:0;log(s,'workflow',`${id} workflow ${w.enabled?'enabled':'disabled'}`);}
      else if(method==='POST'&&act==='run'&&id==='followup')result.created=followup(s);
      else error('This workflow runs from its corresponding demo action.');
    }else if(table==='settings'&&method==='PATCH')s.settings.notifications_enabled=d.notifications_enabled?1:0;
    else if(table==='notifications'&&id==='read'&&method==='POST')s.notifications.forEach(n=>n.is_read=1);
    else error('Unknown action.');
    save(s);return result;
  }
  window.northstarDemoApi=handle;
})();