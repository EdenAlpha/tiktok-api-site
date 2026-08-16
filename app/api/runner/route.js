import { Sandbox } from '@vercel/sandbox';
import { createHash } from 'node:crypto';

export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';

const NAME='gca-imperial-py313';
const ROOT='/home/vercel-sandbox/bridge_jobs';
const RAW='https://raw.githubusercontent.com/EdenAlpha/tiktok-api-site/main/vercel_jobs';

async function output(r){let stdout='',stderr='';try{stdout=await r.stdout()}catch{};try{stderr=await r.stderr()}catch{};return {exitCode:r.exitCode,stdout,stderr}}
function validJob(x){return typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(x)}
async function sandbox(){const s=await Sandbox.get({name:NAME});try{await s.update({timeout:2700000})}catch{};return s}
async function fetchJob(job){const r=await fetch(`${RAW}/${encodeURIComponent(job)}.sh`,{cache:'no-store'});if(!r.ok)throw new Error(`job fetch ${r.status}`);const text=await r.text();if(text.length>100000)throw new Error('job too large');return text}

export async function GET(req){
 const u=new URL(req.url),mode=u.searchParams.get('mode')||'status',job=u.searchParams.get('job');
 if(!validJob(job))return Response.json({ok:false,error:'invalid job'}, {status:400});
 try{
  const s=await sandbox();
  const dir=`${ROOT}/${job}`;
  if(mode==='start'){
   const script=await fetchJob(job);const sha=createHash('sha256').update(script).digest('hex');
   const b64=Buffer.from(script,'utf8').toString('base64');
   const cmd=`set -euo pipefail\nmkdir -p '${dir}'\nif [ -f '${dir}/sha256' ] && [ \"$(cat '${dir}/sha256')\" = '${sha}' ] && [ -f '${dir}/pid' ] && kill -0 $(cat '${dir}/pid') 2>/dev/null; then echo ALREADY_RUNNING; exit 0; fi\nprintf '%s' '${b64}' | base64 -d > '${dir}/job.sh'\nchmod 700 '${dir}/job.sh'\necho '${sha}' > '${dir}/sha256'\nrm -f '${dir}/log' '${dir}/exit' '${dir}/pid'\nnohup bash -lc \"bash '${dir}/job.sh' > '${dir}/log' 2>&1; echo \\\$? > '${dir}/exit'\" >/dev/null 2>&1 & echo $! > '${dir}/pid'\necho PID=$(cat '${dir}/pid')\necho SHA256=${sha}`;
   const r=await output(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,mode,job,sandbox:s.name,result:r});
  }
  if(mode==='run'){
   const script=await fetchJob(job);const sha=createHash('sha256').update(script).digest('hex');
   const b64=Buffer.from(script,'utf8').toString('base64');
   const cmd=`set -euo pipefail\nmkdir -p '${dir}'\nprintf '%s' '${b64}' | base64 -d > '${dir}/job.sh'\nchmod 700 '${dir}/job.sh'\necho '${sha}' > '${dir}/sha256'\nbash '${dir}/job.sh'`;
   const r=await output(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,mode,job,sha256:sha,result:r});
  }
  if(mode==='stop'){
   const cmd=`if [ -f '${dir}/pid' ] && kill -0 $(cat '${dir}/pid') 2>/dev/null; then kill $(cat '${dir}/pid') && echo STOPPED; else echo NOT_RUNNING; fi`;
   const r=await output(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:true,mode,job,result:r});
  }
  const cmd=`if [ -f '${dir}/pid' ] && kill -0 $(cat '${dir}/pid') 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi\nif [ -f '${dir}/exit' ]; then echo EXIT=$(cat '${dir}/exit'); fi\nif [ -f '${dir}/sha256' ]; then echo SHA256=$(cat '${dir}/sha256'); fi\necho '---TAIL---'\ntail -n 200 '${dir}/log' 2>/dev/null || true`;
  const r=await output(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,mode:'status',job,sandbox:s.name,status:s.status,result:r});
 }catch(e){return Response.json({ok:false,mode,job,error:String(e),stack:e?.stack||null},{status:500})}
}
