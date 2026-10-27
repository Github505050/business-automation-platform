import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeApp} from '../server/index.mjs';

async function harness(t) {
  const folder=mkdtempSync(path.join(os.tmpdir(),'northstar-test-'));
  const app=makeApp(path.join(folder,'test.sqlite'));
  const server=await app.start(0);
  t.after(async()=>{await app.close(server);rmSync(folder,{force:true,recursive:true});});
  const url=`http://127.0.0.1:${server.address().port}`;
  const makeVisitor=()=>{
    let cookie='';
    async function call(endpoint,method='GET',body){const opts={method,headers:{}};if(cookie)opts.headers.cookie=cookie;if(method!=='GET'){opts.headers['content-type']='application/json';opts.body=JSON.stringify(body||{});}const resp=await fetch(url+endpoint,opts);const set=resp.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:resp.status,data:await resp.json()};}
    return call;
  };
  return {app,makeVisitor};
}

test('separate visitor sessions persist after refresh and cannot mutate each other',async(t)=>{
 const {makeVisitor}=await harness(t);const a=makeVisitor(),b=makeVisitor();
 const a0=(await a('/api/state')).data,b0=(await b('/api/state')).data;
 assert.equal(a0.leads.length,9);assert.equal(b0.leads.length,9);
 assert.ok(a0.leads.every(x=>!('session' in x)),'session token must not leak to client');
 assert.notEqual(a0.leads[0].id,b0.leads[0].id);
 const made=await a('/api/leads','POST',{name:'Verified Lead',email:'verified@example.com',company:'Acme',value:1200});assert.equal(made.status,201);
 const next=(await a('/api/state')).data;assert.equal(next.leads.length,10);assert.equal((await b('/api/state')).data.leads.length,9);
 assert.equal((await b(`/api/leads/${made.data.id}`,'PATCH',{status:'Won'})).status,404);
 assert.equal((await a(`/api/leads/${made.data.id}`,'PATCH',{status:'Qualified'})).status,200);
 assert.equal((await a('/api/state')).data.leads.find(l=>l.id===made.data.id).status,'Qualified');
});

test('lead capture logs actual execution and toggles stop capture',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 const before=(await c('/api/state')).data;
 let r=await c('/api/inquiry','POST',{name:'New Request',email:'new@example.com',service:'Website'});assert.equal(r.status,201);
 const after=(await c('/api/state')).data;assert.equal(after.executions.length,before.executions.length+1);assert.equal(after.executions[0].kind,'capture');assert.equal(after.executions[0].mode,'automatic');
 await c('/api/workflows/capture','PATCH',{enabled:false});r=await c('/api/inquiry','POST',{name:'Blocked',email:'blocked@example.com'});assert.equal(r.status,409);
 assert.equal((await c('/api/state')).data.leads.length,10);
});

test('conversion creates one customer even on repeated updates',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();const first=(await c('/api/state')).data;
 const lead=first.leads[0];
 let r=await c(`/api/leads/${lead.id}`,'PATCH',{status:'Won'});assert.equal(r.status,200);
 r=await c(`/api/leads/${lead.id}`,'PATCH',{status:'Won'});assert.equal(r.status,200);
 const after=(await c('/api/state')).data;
 assert.equal(after.customers.filter(x=>x.source_lead===lead.id).length,1);
 assert.equal(after.executions.filter(x=>x.kind==='conversion').length,1);
});

test('due followup is idempotent, manual run is logged, disabled rule blocks',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 let r=await c('/api/workflows/followup/run','POST');assert.equal(r.status,200);assert.ok(r.data.created>=1);
 let after=(await c('/api/state')).data;const count=after.tasks.filter(x=>x.automation_key?.startsWith('followup:')).length;assert.ok(count>=1);
 r=await c('/api/workflows/followup/run','POST');assert.equal(r.data.created,0);
 after=(await c('/api/state')).data;assert.equal(after.tasks.filter(x=>x.automation_key?.startsWith('followup:')).length,count);
 assert.equal(after.executions.filter(x=>x.kind==='followup').length,2);
 await c('/api/workflows/followup','PATCH',{enabled:false});assert.equal((await c('/api/workflows/followup/run','POST')).status,409);
});

test('project completion only with nonempty all-Done tasks and reopens',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 await c('/api/projects','POST',{name:'Completion test',status:'In progress'});let data=(await c('/api/state')).data;
 const p=data.projects.find(p=>p.name==='Completion test');assert.equal(p.status,'In progress');
 await c('/api/tasks','POST',{title:'Milestone',project_id:p.id,status:'To do'});data=(await c('/api/state')).data;const task=data.tasks.find(x=>x.project_id===p.id);
 await c(`/api/tasks/${task.id}`,'PATCH',{status:'Done'});data=(await c('/api/state')).data;
 assert.equal(data.projects.find(x=>x.id===p.id).status,'Completed');assert.ok(data.executions.some(x=>x.kind==='completion'));
 await c(`/api/tasks/${task.id}`,'PATCH',{status:'In progress'});data=(await c('/api/state')).data;assert.equal(data.projects.find(x=>x.id===p.id).status,'In progress');
});

test('validation, reset, isolation and generated analytics data',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 assert.equal((await c('/api/leads','POST',{name:'Missing Email'})).status,400);
 assert.equal((await c('/api/leads','POST',{name:'X',email:'x@example.com',follow_up:'2026-99-99'})).status,400);
 assert.equal((await c('/api/reset','POST',{confirm:false})).status,400);
 await c('/api/leads','POST',{name:'Temporary',email:'tmp@example.com'});
 assert.equal((await c('/api/state')).data.leads.length,10);
 assert.equal((await c('/api/reset','POST',{confirm:true})).status,200);
 const data=(await c('/api/state')).data;assert.equal(data.leads.length,9);assert.equal(data.executions.length,0);assert.equal(data.workflows.filter(w=>w.enabled).length,4);
});

test('customer, project, task and lead CRUD delete paths operate on owned records',async(t)=>{
 const {makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 const customer=await c('/api/customers','POST',{name:'CRUD Customer',email:'crud@example.com',company:'Original Co'});assert.equal(customer.status,201);
 let d=(await c('/api/state')).data;const cid=d.customers.find(x=>x.name==='CRUD Customer').id;
 assert.equal((await c(`/api/customers/${cid}`,'PATCH',{company:'Updated Co'})).status,200);
 assert.equal((await c('/api/state')).data.customers.find(x=>x.id===cid).company,'Updated Co');
 assert.equal((await c('/api/projects','POST',{name:'CRUD Project',customer_id:cid,description:'Temporary project'})).status,201);
 d=(await c('/api/state')).data;const pid=d.projects.find(x=>x.name==='CRUD Project').id;
 assert.equal((await c(`/api/projects/${pid}`,'PATCH',{deadline:'2026-12-31'})).status,200);
 assert.equal((await c('/api/tasks','POST',{title:'CRUD Task',project_id:pid})).status,201);
 d=(await c('/api/state')).data;const tid=d.tasks.find(x=>x.title==='CRUD Task').id;
 assert.equal((await c(`/api/tasks/${tid}`,'PATCH',{priority:'High'})).status,200);
 assert.equal((await c(`/api/tasks/${tid}`,'DELETE')).status,200);
 assert.equal((await c(`/api/projects/${pid}`,'DELETE')).status,200);
 assert.equal((await c(`/api/customers/${cid}`,'DELETE')).status,200);
 const lead=(await c('/api/leads','POST',{name:'Disposable',email:'disposable@example.com'})).data.id;
 assert.equal((await c(`/api/leads/${lead}`,'DELETE')).status,200);
 d=(await c('/api/state')).data;
 assert.equal(d.customers.some(x=>x.id===cid),false);
 assert.equal(d.projects.some(x=>x.id===pid),false);
 assert.equal(d.tasks.some(x=>x.id===tid),false);
 assert.equal(d.leads.some(x=>x.id===lead),false);
});

test('scheduler executes genuinely as scheduled and never duplicates due followups',async(t)=>{
 const {app,makeVisitor}=await harness(t);const c=makeVisitor();await c('/api/state');
 app.schedulerTick();const first=(await c('/api/state')).data;
 assert.ok(first.executions.some(x=>x.kind==='followup'&&x.mode==='scheduled'&&x.status==='success'));
 const count=first.tasks.filter(x=>x.automation_key?.startsWith('followup:')).length;
 app.schedulerTick();const second=(await c('/api/state')).data;
 assert.equal(second.tasks.filter(x=>x.automation_key?.startsWith('followup:')).length,count);
 assert.equal(second.executions.filter(x=>x.kind==='followup').length,1);
});