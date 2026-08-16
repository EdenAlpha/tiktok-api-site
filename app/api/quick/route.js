import { Sandbox } from '@vercel/sandbox';

export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';

const NAME='gca-imperial-quick';
const ROOT='/home/vercel-sandbox';
const DATA=`${ROOT}/imperial.h5`;
const SOURCE='https://gdr-data-lake.s3.amazonaws.com/imperialvalleydas/v1.0.0/DF__UTC_20201113_235932.602.h5';
const EXPECTED='415030456';

async function out(r){let stdout='',stderr='';try{stdout=await r.stdout()}catch{};try{stderr=await r.stderr()}catch{};return {exitCode:r.exitCode,stdout,stderr}}
async function box(){try{return await Sandbox.get({name:NAME})}catch{return await Sandbox.create({name:NAME,runtime:'python3.13',timeout:300000,snapshotExpiration:604800000,persistent:true})}}

export async function GET(req){
 const a=new URL(req.url).searchParams.get('action')||'status';
 try{
  const s=await box(); try{await s.update({timeout:2700000})}catch{}
  if(a==='start'){
   const cmd=`set -euo pipefail
PY=$(command -v python3 || command -v python)
"$PY" -m pip install --disable-pip-version-check -q numpy h5py zstandard
if [ ! -f '${DATA}' ] || [ "$(stat -c%s '${DATA}' 2>/dev/null || echo 0)" != '${EXPECTED}' ]; then curl -fL --retry 5 --connect-timeout 20 -o '${DATA}.part' '${SOURCE}'; test "$(stat -c%s '${DATA}.part')" = '${EXPECTED}'; mv '${DATA}.part' '${DATA}'; fi
cat > '${ROOT}/quick.py' <<'PYCODE'
import json,time,h5py,numpy as np,zstandard as zstd
C=128; NT=30000; RIDGE=1e-2; FIT_STRIDE=4
REGIONS=(('hard',512),('easy',2304))
CONFIGS={
 'gca9':((1,(-2,-1,0,1,2)),(2,(-1,0,1)),(3,(0,))),
 'gca16':((1,(-3,-2,-1,0,1,2,3)),(2,(-2,-1,0,1,2)),(3,(-1,0,1)),(4,(0,))),
 'gca24':((1,(-4,-3,-2,-1,0,1,2,3,4)),(2,(-3,-2,-1,0,1,2,3)),(3,(-2,-1,0,1,2)),(4,(-1,0,1))) }
def stats(d):
 s=ss=0.;n=0
 for i in range(0,d.shape[0],2048):
  x=np.asarray(d[i:min(i+2048,d.shape[0])],np.float64);s+=float(x.sum());ss+=float((x*x).sum());n+=x.size
 m=s/n;return m,float(np.sqrt(max(0.,ss/n-m*m)))
def sh(x,d):
 y=np.zeros_like(x,dtype=np.float64)
 if d==0:y[:]=x
 elif d>0:y[d:]=x[:-d]
 else:y[:d]=x[-d:]
 return y
def feat(R,c,cfg):
 cols=[]
 for off,ds in cfg:
  x=R[c-off].astype(np.float64);cols.extend(sh(x,d) for d in ds)
 return np.stack(cols,axis=1)
def reconstruct(X,eps,cfg):
 step=2.0*float(eps)*(1.0-1e-4);R=np.zeros(X.shape,np.float32);Q=np.zeros(X.shape,np.int32)
 maxoff=max(x[0] for x in cfg);nf=sum(len(x[1]) for x in cfg);fit_idx=np.arange(4,NT-4,FIT_STRIDE,dtype=np.int64)
 for c in range(C):
  pred=None
  if c>=maxoff+1:
   Ft=feat(R,c-1,cfg);yt=R[c-1].astype(np.float64);A=Ft[fit_idx];b=yt[fit_idx];G=A.T@A;h=A.T@b
   try:co=np.linalg.solve(G+RIDGE*np.eye(nf),h)
   except np.linalg.LinAlgError:co=np.linalg.lstsq(G+RIDGE*np.eye(nf),h,rcond=None)[0]
   pred=feat(R,c,cfg)@co
  if pred is None:pred=R[c-1].astype(np.float64) if c else np.zeros(NT,np.float64)
  q=np.rint((X[c].astype(np.float64)-pred)/step).astype(np.int32);Q[c]=q;R[c]=(pred+step*q.astype(np.float64)).astype(np.float32)
 return R,Q,step
def zbytes(Q):
 mn,mx=int(Q.min()),int(Q.max())
 for dt in (np.int8,np.int16,np.int32):
  ii=np.iinfo(dt)
  if mn>=ii.min and mx<=ii.max:break
 return len(zstd.ZstdCompressor(level=19).compress(Q.astype(dt).tobytes()))
t0=time.time();out={'regions':[]}
with h5py.File('${DATA}','r') as f:
 d=f['Acoustic'];_,std=stats(d);eps=.1*std;print(json.dumps({'global_std':std,'eps':eps}),flush=True)
 for region,c0 in REGIONS:
  X=np.asarray(d[:NT,c0:c0+C],np.float64).T; rr=[]
  for name,cfg in CONFIGS.items():
   ts=time.time();R,Q,step=reconstruct(X,eps,cfg);me=float(np.max(np.abs(X-R.astype(np.float64))));zb=zbytes(Q)
   row={'region':region,'config':name,'features':sum(len(x[1]) for x in cfg),'zstd_screen_bytes':zb,'zstd_screen_bps':8*zb/X.size,'zero_fraction':float(np.mean(Q==0)),'pm2_fraction':float(np.mean(np.abs(Q)<=2)),'q_std':float(np.std(Q.astype(np.float64))),'maxerr':me,'step':step,'seconds':time.time()-ts}
   rr.append(row);print(json.dumps(row),flush=True)
  out['regions'].append({'region':region,'best':min(rr,key=lambda x:x['zstd_screen_bytes']),'all':rr})
out.update(global_std=std,eps=eps,seconds=time.time()-t0,scope='Fast screening proxy only: exact GCA reconstruction and strict hard-error verification, correction stream measured with Zstd-19. Not an exact charged GCA stream and not an official comparator result.')
json.dump(out,open('${ROOT}/quick.json','w'),indent=2)
PYCODE
rm -f '${ROOT}/quick.log' '${ROOT}/quick.exit' '${ROOT}/quick.pid' '${ROOT}/quick.json'
nohup bash -lc 'python3 ${ROOT}/quick.py > ${ROOT}/quick.log 2>&1; echo $? > ${ROOT}/quick.exit' >/dev/null 2>&1 & echo $! > '${ROOT}/quick.pid'
echo PID=$(cat '${ROOT}/quick.pid'); echo DATA_SIZE=$(stat -c%s '${DATA}')`;
   const r=await out(await s.runCommand('bash',['-lc',cmd])); return Response.json({ok:r.exitCode===0,action:a,name:s.name,result:r});
  }
  const cmd=`if [ -f '${ROOT}/quick.pid' ] && kill -0 $(cat '${ROOT}/quick.pid') 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi
if [ -f '${ROOT}/quick.exit' ]; then echo EXIT=$(cat '${ROOT}/quick.exit'); fi
echo '---TAIL---'; tail -n 100 '${ROOT}/quick.log' 2>/dev/null || true; echo '---JSON---'; test -f '${ROOT}/quick.json' && cat '${ROOT}/quick.json' || true`;
  const r=await out(await s.runCommand('bash',['-lc',cmd])); return Response.json({ok:r.exitCode===0,action:'status',name:s.name,status:s.status,result:r});
 }catch(e){return Response.json({ok:false,action:a,error:String(e),stack:e?.stack||null},{status:500})}
}
