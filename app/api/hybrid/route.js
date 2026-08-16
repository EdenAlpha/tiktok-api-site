import { Sandbox } from '@vercel/sandbox';
export const runtime='nodejs'; export const maxDuration=300; export const dynamic='force-dynamic';
const NAME='gca-imperial-hybrid',ROOT='/home/vercel-sandbox',DATA=`${ROOT}/imperial.h5`,SOURCE='https://gdr-data-lake.s3.amazonaws.com/imperialvalleydas/v1.0.0/DF__UTC_20201113_235932.602.h5',EXPECTED='415030456';
async function out(r){let stdout='',stderr='';try{stdout=await r.stdout()}catch{};try{stderr=await r.stderr()}catch{};return {exitCode:r.exitCode,stdout,stderr}}
async function box(){try{return await Sandbox.get({name:NAME})}catch{return await Sandbox.create({name:NAME,runtime:'python3.13',timeout:300000,snapshotExpiration:604800000,persistent:true})}}
export async function GET(req){const a=new URL(req.url).searchParams.get('action')||'status';try{const s=await box();try{await s.update({timeout:2700000})}catch{}
if(a==='start'){const cmd=`set -euo pipefail
PY=$(command -v python3 || command -v python); "$PY" -m pip install --disable-pip-version-check -q numpy h5py zstandard
if [ ! -f '${DATA}' ] || [ "$(stat -c%s '${DATA}' 2>/dev/null || echo 0)" != '${EXPECTED}' ]; then curl -fL --retry 5 --connect-timeout 20 -o '${DATA}.part' '${SOURCE}'; test "$(stat -c%s '${DATA}.part')" = '${EXPECTED}'; mv '${DATA}.part' '${DATA}'; fi
cat > '${ROOT}/hybrid.py' <<'PYCODE'
import json,time,h5py,numpy as np,zstandard as zstd
C=128;NT=30000;TRAIN=1024;P=32;RIDGE=1e-2;FIT_STRIDE=4
REGIONS=(('hard',512),('easy',2304)); CONFIGS={'h9':((1,(-2,-1,0,1,2)),(2,(-1,0,1)),(3,(0,))),'h16':((1,(-3,-2,-1,0,1,2,3)),(2,(-2,-1,0,1,2)),(3,(-1,0,1)),(4,(0,))),'h24':((1,(-4,-3,-2,-1,0,1,2,3,4)),(2,(-3,-2,-1,0,1,2,3)),(3,(-2,-1,0,1,2)),(4,(-1,0,1)))}
def stats(d):
 s=ss=0.;n=0
 for i in range(0,d.shape[0],2048):
  x=np.asarray(d[i:min(i+2048,d.shape[0])],np.float64);s+=float(x.sum());ss+=float((x*x).sum());n+=x.size
 m=s/n;return m,float(np.sqrt(max(0.,ss/n-m*m)))
def fits(X):
 n=C*(TRAIN-P);A=np.empty((n,P+1),np.float64);y=np.empty(n,np.float64);j=0
 for c in range(C):
  x=np.asarray(X[c,:TRAIN],np.float64)
  for t in range(P,TRAIN):A[j,0]=1.;A[j,1:]=x[t-P:t][::-1];y[j]=x[t];j+=1
 co=np.linalg.lstsq(A,y,rcond=None)[0]
 for _ in range(6):
  r=y-A@co;w=np.minimum(1.,267./np.maximum(np.abs(r),1e-12));sw=np.sqrt(w);co=np.linalg.lstsq(A*sw[:,None],y*sw,rcond=None)[0]
 return np.asarray(co,np.float32)
def sh(x,d):
 y=np.zeros_like(x,dtype=np.float64)
 if d==0:y[:]=x
 elif d>0:y[d:]=x[:-d]
 else:y[:d]=x[-d:]
 return y
def feat(I,c,cfg):
 cols=[]
 for off,ds in cfg:
  x=I[c-off].astype(np.float64);cols.extend(sh(x,d) for d in ds)
 return np.stack(cols,axis=1)
def enc(X,eps,co,cfg=None):
 step=2.*float(eps)*(1.-1e-4);R=np.zeros(X.shape,np.float32);I=np.zeros(X.shape,np.float32);Q=np.zeros(X.shape,np.int32);aa=float(co[0]);bb=np.asarray(co[1:],np.float32)
 fit_idx=np.arange(4,NT-4,FIT_STRIDE,dtype=np.int64); maxoff=max(x[0] for x in cfg) if cfg else 0; nf=sum(len(x[1]) for x in cfg) if cfg else 0
 for c in range(C):
  s=np.zeros(NT,np.float64)
  if cfg is not None and c>=maxoff+1:
   Ft=feat(I,c-1,cfg);yt=I[c-1].astype(np.float64);A=Ft[fit_idx];b=yt[fit_idx]
   try:cs=np.linalg.solve(A.T@A+RIDGE*np.eye(nf),A.T@b)
   except np.linalg.LinAlgError:cs=np.linalg.lstsq(A.T@A+RIDGE*np.eye(nf),A.T@b,rcond=None)[0]
   s=feat(I,c,cfg)@cs
  for t in range(NT):
   pt=0. if t<P else aa+float(np.dot(bb,R[c,t-P:t][::-1].astype(np.float32)))
   pred=pt+s[t];q=int(np.rint((float(X[c,t])-pred)/step));Q[c,t]=q;r=pred+step*q;R[c,t]=r;I[c,t]=r-pt
 return R,Q,step
def zbytes(Q):
 mn,mx=int(Q.min()),int(Q.max())
 for dt in (np.int8,np.int16,np.int32):
  ii=np.iinfo(dt)
  if mn>=ii.min and mx<=ii.max:break
 return len(zstd.ZstdCompressor(level=19).compress(Q.astype(dt).tobytes()))
def row(region,name,X,R,Q,step,secs):return {'region':region,'config':name,'zstd_bytes':zbytes(Q),'zstd_bps':8*zbytes(Q)/X.size,'zero_fraction':float(np.mean(Q==0)),'pm2_fraction':float(np.mean(np.abs(Q)<=2)),'q_std':float(np.std(Q.astype(np.float64))),'maxerr':float(np.max(np.abs(X-R.astype(np.float64)))),'step':step,'seconds':secs}
out={'regions':[]};tall=time.time()
with h5py.File('${DATA}','r') as f:
 d=f['Acoustic'];_,std=stats(d);eps=.1*std;print(json.dumps({'global_std':std,'eps':eps}),flush=True)
 for region,c0 in REGIONS:
  X=np.asarray(d[:NT,c0:c0+C],np.float64).T;tf=time.time();co=fits(X);print(json.dumps({'region':region,'fit_seconds':time.time()-tf}),flush=True)
  rr=[];ts=time.time();R,Q,step=enc(X,eps,co,None);base=row(region,'temporal_ar',X,R,Q,step,time.time()-ts);rr.append(base);print(json.dumps(base),flush=True)
  for name,cfg in CONFIGS.items():
   ts=time.time();R,Q,step=enc(X,eps,co,cfg);r=row(region,name,X,R,Q,step,time.time()-ts);r['gain_proxy_vs_temporal']=base['zstd_bytes']/r['zstd_bytes'];rr.append(r);print(json.dumps(r),flush=True)
  out['regions'].append({'region':region,'baseline':base,'best':min(rr[1:],key=lambda x:x['zstd_bytes']),'all':rr})
out.update(global_std=std,eps=eps,seconds=time.time()-tall,scope='Fast proxy gate. Temporal Huber-AR coefficients are paid-side-info-compatible; shared spatial innovation coefficients are never transmitted and are deterministically refit from prior decoded innovation channels. Exact hard-error reconstruction; Zstd-19 correction bytes are screening only, not final stream bytes.')
json.dump(out,open('${ROOT}/hybrid.json','w'),indent=2)
PYCODE
rm -f '${ROOT}/hybrid.log' '${ROOT}/hybrid.exit' '${ROOT}/hybrid.pid' '${ROOT}/hybrid.json'; nohup bash -lc 'python3 ${ROOT}/hybrid.py > ${ROOT}/hybrid.log 2>&1; echo $? > ${ROOT}/hybrid.exit' >/dev/null 2>&1 & echo $! > '${ROOT}/hybrid.pid'; echo PID=$(cat '${ROOT}/hybrid.pid')`;const r=await out(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,action:a,name:s.name,result:r})}
const cmd=`if [ -f '${ROOT}/hybrid.pid' ] && kill -0 $(cat '${ROOT}/hybrid.pid') 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi
if [ -f '${ROOT}/hybrid.exit' ]; then echo EXIT=$(cat '${ROOT}/hybrid.exit'); fi
echo '---TAIL---'; tail -n 120 '${ROOT}/hybrid.log' 2>/dev/null || true; echo '---JSON---'; test -f '${ROOT}/hybrid.json' && cat '${ROOT}/hybrid.json' || true`;const r=await out(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,action:'status',name:s.name,status:s.status,result:r})
}catch(e){return Response.json({ok:false,action:a,error:String(e),stack:e?.stack||null},{status:500})}}
