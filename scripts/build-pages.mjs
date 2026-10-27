/** Generate a transparent, free GitHub Pages edition from the full-stack source. */
import {cpSync, rmSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'_site');
rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});cpSync(path.join(root,'public'),dest,{recursive:true});
function change(name,fn){const p=path.join(dest,name);const input=readFileSync(p,'utf8');const output=fn(input);writeFileSync(p,output);}
change('index.html',s=>s.replaceAll('href="/','href="./').replaceAll('src="/','src="./')
  .replace('<script type="module" src="./app.js"></script>', '<script src="./offline-api.js"></script><script type="module" src="./app.js"></script>')
  .replace('Private demo workspace','Browser demo workspace')
  .replace('Private demo workspace','Browser demo workspace')
  .replace('All systems ready','Interactive browser showcase')
  .replace('Four connected workflows, one simple command center.','Try four browser-simulated workflows without creating an account.')
  .replace('Northstar Ops — a private, interactive business workflow automation demo.', 'Northstar Ops — a free interactive browser demonstration of business operations.'));
change('app.js',s=>{
 const start=s.indexOf('async function api(');const stop=s.indexOf('async function refresh(');
 if(start<0||stop<start)throw new Error('Unable to locate API adapter');
 s=s.slice(0,start)+`async function api(path,method='GET',body){return window.northstarDemoApi(path,method,body);}\n`+s.slice(stop);
 s=s.replace('function render(){if(!state.data)return;',`function render(){if(!state.data)return;`)
    .replace('document.getElementById(\'main-content\').innerHTML=`<div class="page">',`document.getElementById('main-content').innerHTML=\`<div class="page"><div class="banner-note" role="status" style="margin:0 0 20px">\${icon('info')} <strong>Interactive portfolio demo:</strong> Changes save in this browser. Workflow actions are simulated locally. The separate Node.js and SQLite implementation is available in the <a href="https://github.com/Github505050/business-automation-platform" target="_blank" rel="noopener">source repository</a>.</div>`);
 s=s.replace('The backend creates a real lead, records the automatic execution, and adds an in-app notification — inside your private demo.', 'This browser demonstration creates a fictional lead, adds an execution log and shows an in-app notification. No message is sent.');
 s=s.replace('Automation executions are performed on the server, not in the browser. The follow-up scheduler runs once per minute while the server process is online. Other workflows fire from real business actions.', 'Portfolio mode: workflow triggers are simulated in your browser and their outcomes are saved locally. Click Run now for follow-ups; there is no autonomous scheduler on GitHub Pages. The separate Node.js backend contains genuine server-side implementations.');
 s=s.replace('Let the system handle repetitive steps, with a real audit trail.','Try event-driven workflow simulations with a local execution history.');
 s=s.replace('Actual logged runs; manual tests are labeled','Locally logged demo runs; manual tests are labeled');
 s=s.replace('Checks due follow-ups on the running server and creates each task only once.','Click Run now to check due follow-ups and create each task once in this browser.');
 s=s.replace('Your records are isolated from other visitors using a secure session cookie.','Your fictional records stay in this browser’s local storage, separate from other visitors.');
 s=s.replace('Configure server-generated in-app alerts','Configure browser demo notifications');
 s=s.replace('Northstar Ops is a full-stack fictional business operations demo. Information, companies, names and statistics are illustrative and belong exclusively to the visitor\'s workspace. It is not a commercial customer deployment.','This public edition is an interactive browser demonstration. All names and analytics are fictional. A separate full-stack Node.js/SQLite implementation is available in GitHub; this page does not use a server database.');
 s=s.replace('<span>Node.js backend</span><span>SQLite database</span><span>4 workflows</span>', '<span>Browser persistence</span><span>Local workflow simulations</span><span>4 workflows</span>');
 s=s.replace('The backend creates a real lead','The browser demo creates a lead');
 return s;
});
change('case-study.html',s=>s.replaceAll('href="/','href="./').replaceAll('src="/','src="./')
 .replace('genuine server-side workflow automation.', 'an interactive browser showcase, with a separate working Node.js backend in the repository.')
 .replace('Full-stack automation case study', 'Business automation portfolio case study')
 .replace('INDEPENDENT FULL-STACK PORTFOLIO PROJECT','INDEPENDENT BUSINESS AUTOMATION PORTFOLIO')
 .replace('executing server-side workflows.','demonstrating interactive workflows in the browser, backed by a separate Node.js/SQLite source implementation.')
 .replace('REAL CRUD','INTERACTIVE CRUD').replace('PRIVATE DEMO DATA','LOCAL DEMO DATA').replace('SERVER AUTOMATIONS','WORKFLOW SIMULATIONS')
 .replace('Four real backend workflows handle inquiry capture, due follow-ups, conversion, and completion.', 'Four interactive browser simulations demonstrate inquiry capture, due follow-ups, lead conversion, and project completion. The repository also contains the separate backend implementation.')
 .replace('actual records inside each visitor\'s demo.', 'fictional records saved in each visitor\'s browser.')
 .replace('Audit every workflow','Inspect demo workflow history')
 .replace('The manual follow-up trigger executes the real server workflow and prevents duplicates.', 'The public demo runs the follow-up simulation on demand and prevents duplicate tasks; the separate backend includes a server-side workflow.')
 .replace('Real interactions.', 'Useful interactions.')
 .replace('real, persistent changes.', 'changes saved in the visitor’s browser.')
 .replace('Separate visitor data', 'Browser-isolated data')
 .replace('Public production hosting has not yet been configured; a server with persistent storage is required for l', 'This GitHub Pages demo stores data locally and does not run scheduled server workflows. The separate Node.js backend needs a server and database for production use. l')
 .replace('a server with persistent storage is required for live backend operations', 'the separate Node.js backend requires hosting and durable storage for server operations')
 );
writeFileSync(path.join(dest,'.nojekyll'),'');
console.log('Pages demo build generated at',dest);