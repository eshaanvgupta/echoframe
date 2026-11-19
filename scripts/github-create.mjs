// Explicitly invoked release helper. Credentials stay in process memory, never logs or files.
import {execFileSync} from 'node:child_process';
const owner='eshaanvgupta',name='echoframe';
try{
  const credential=execFileSync('git',['credential','fill'],{input:`protocol=https\nhost=github.com\nusername=${owner}\n\n`,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','pipe']});
  const entries=Object.fromEntries(credential.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  if(!entries.password)throw new Error('Existing GitHub credential unavailable');
  const headers={Authorization:`Bearer ${entries.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const existing=await fetch(`https://api.github.com/repos/${owner}/${name}`,{headers});
  if(existing.ok){const repo=await existing.json();console.log(JSON.stringify({created:false,url:repo.html_url,empty:repo.size===0}));}
  else if(existing.status===404){
    const response=await fetch('https://api.github.com/user/repos',{method:'POST',headers,body:JSON.stringify({name,description:'Local-first Celo agent-commerce evidence recorder, independent verifier and deterministic failure laboratory.',private:false,auto_init:false})});
    if(!response.ok)throw new Error(`GitHub repository creation returned HTTP ${response.status}`);
    const repo=await response.json();console.log(JSON.stringify({created:true,url:repo.html_url,empty:true}));
  }else throw new Error(`GitHub repository lookup returned HTTP ${existing.status}`);
  entries.password='';
}catch(error){console.error(error instanceof Error?error.message:'GitHub creation failed');process.exitCode=1;}
