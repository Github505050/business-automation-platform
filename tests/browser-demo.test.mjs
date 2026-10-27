import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const source=readFileSync(new URL('../public/offline-api.js',import.meta.url),'utf8');
function demo(){
 const storage=new Map(),localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
 const window={localStorage};const sandbox={window,localStorage,crypto:{randomUUID:()=>crypto.randomUUID()},Date,Math,Error,JSON,Number,RegExp};
 let n=0;sandbox.crypto={randomUUID:()=>`demo-id-${++n}`};vm.runInNewContext(source,sandbox);
 return {api:window.northstarDemoApi,store:storage};
}

test('seeded data appears and is browser-persistent',async()=>{
 const {api,store}=demo();const a=await api('state');assert.equal(a.leads.length,9);assert.equal(a.projects.length,4);assert.equal(a.scheduler,false);assert.ok(store.get('northstar-public-demo-v2'));
});
test('create, update, delete lead and maintain state',async()=>{
 const {api}=demo();const created=await api('leads','POST',{name:'Demo Contact',email:'test@demo.example',company:'Acme'});
 let s=await api('state');assert.equal(s.leads.length,10);assert.ok(s.leads.find(x=>x.id===created.id));
 await api(`leads/${created.id}`,'PATCH',{status:'Qualified'});
 s=await api('state');assert.equal(s.leads.find(x=>x.id===created.id).status,'Qualified');
 await api(`leads/${created.id}`,'DELETE');assert.equal((await api('state')).leads.length,9);
});
test('fictional inquiry workflow records the local execution',async()=>{
 const {api}=demo();await api('inquiry','POST',{name:'Inquiry Contact',email:'inquiry@example.test',company:'Example'});
 const s=await api('state');assert.equal(s.leads.length,10);assert.equal(s.executions[0].kind,'capture');assert.equal(s.executions[0].mode,'automatic');
});
test('winning a lead converts it exactly once',async()=>{
 const {api}=demo();const l=(await api('state')).leads.find(x=>x.status==='New');
 await api(`leads/${l.id}`,'PATCH',{status:'Won'});await api(`leads/${l.id}`,'PATCH',{status:'Won'});
 const s=await api('state');assert.equal(s.customers.filter(x=>x.source_lead===l.id).length,1);assert.equal(s.executions.filter(x=>x.kind==='conversion').length,1);
});
test('manual follow-ups cannot create duplicate tasks',async()=>{
 const {api}=demo();const a=await api('workflows/followup/run','POST',{});const b=await api('workflows/followup/run','POST',{});
 assert.ok(a.created>0);assert.equal(b.created,0);assert.equal((await api('state')).tasks.filter(x=>x.automation_key).length,a.created);
});
test('completed project requires tasks and reopens when task changes',async()=>{
 const {api}=demo();const p=await api('projects','POST',{name:'Empty Project'});
 const s1=await api('state');const empty=s1.projects.find(x=>x.name==='Empty Project');assert.notEqual(empty.status,'Completed');
 await api('tasks','POST',{title:'Finish this',project_id:empty.id,status:'Done'});
 let s=await api('state');assert.equal(s.projects.find(x=>x.id===empty.id).status,'Completed');
 const t=s.tasks.find(x=>x.project_id===empty.id);await api(`tasks/${t.id}`,'PATCH',{status:'To do'});
 s=await api('state');assert.equal(s.projects.find(x=>x.id===empty.id).status,'In progress');
});
test('reset restores sample data',async()=>{
 const {api}=demo();await api('leads','POST',{name:'Temporary',email:'temp@demo.example'});
 await api('reset','POST',{confirm:true});const s=await api('state');assert.equal(s.leads.length,9);assert.equal(s.executions.length,0);
});
test('form validation and toggle behavior',async()=>{
 const {api}=demo();await assert.rejects(()=>api('leads','POST',{name:'Bad',email:'not-an-email'}));
 await api('workflows/capture','PATCH',{enabled:false});await assert.rejects(()=>api('inquiry','POST',{name:'Valid',email:'ok@demo.example'}));
 const s=await api('state');assert.equal(s.workflows.find(x=>x.kind==='capture').enabled,0);
});