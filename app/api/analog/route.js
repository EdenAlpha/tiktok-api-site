import { Sandbox } from '@vercel/sandbox';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
const NAME='gca-imperial-analog',ROOT='/home/vercel-sandbox',DATA=`${ROOT}/imperial.h5`,SOURCE='https://gdr-data-lake.s3.amazonaws.com/imperialvalleydas/v1.0.0/DF__UTC_20201113_235932.602.h5',EXPECTED='415030456';
async function out(r){let stdout='',stderr='';try{stdout=await r.stdout()}catch{};try{stderr=await r.stderr()}catch{};return {exitCode:r.exitCode,stdout,stderr}}
async function box(){try{return await Sandbox.get({name:NAME})}catch{return await Sandbox.create({name:NAME,runtime:'python3.13',timeout:300000,snapshotExpiration:604800000,persistent:true})}}
export async function GET(req){const a=new URL(req.url).searchParams.get('action')||'status';try{const s=await box();try{await s.update({timeout:2700000})}catch{}
if(a==='start'){const cmd=`set -euo pipefail
PY=$(command -v python3 || command -v python); "$PY" -m pip install --disable-pip-version-check -q numpy h5py zstandard
if [ ! -f '${DATA}' ] || [ "$(stat -c%s '${DATA}' 2>/dev/null || echo 0)" != '${EXPECTED}' ]; then curl -fL --retry 5 --connect-timeout 20 -o '${DATA}.part' '${SOURCE}'; test "$(stat -c%s '${DATA}.part')" = '${EXPECTED}'; mv '${DATA}.part' '${DATA}'; fi
cat > '${ROOT}/analog.py' <<'PYCODE'
import json,time,h5py,numpy as np,zstandard as zstd
C=128;NT=30000;TRAIN=1024;P=32;B=128;CTX=128;OFFS=(1,2,4,8);LAGS=tuple(range(-64,65,8))
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
def zbytes(Q):
 mn,mx=int(Q.min()),int(Q.max())
 for dt in (np.int8,np.int16,np.int32):
  ii=np.iinfo(dt)
  if mn>=ii.min and mx<=ii.max:break
 return len(zstd.ZstdCompressor(level=19).compress(Q.astype(dt).tobytes()))
def encode(X,eps,co,analog):
 step=2.*float(eps)*(1.-1e-4);R=np.zeros(X.shape,np.float32);I=np.zeros(X.shape,np.float32);Q=np.zeros(X.shape,np.int32);aa=float(co[0]);bb=np.asarray(co[1:],np.float32); picks={}
 for c in range(C):
  for t0 in range(0,NT,B):
   t1=min(NT,t0+B);sf=np.zeros(t1-t0,np.float64);key='none'
   if analog and t0>=CTX and c>0:
    qctx=I[c,t0-CTX:t0].astype(np.float64);qm=float(qctx.mean());qc=qctx-qm;best=None
    for off in OFFS:
     if c<off:continue
     j=c-off
     for lag in LAGS:
      s0=t0+lag-CTX;e0=t0+lag;f1=t1+lag
      if s0<0 or f1>NT:continue
      v=I[j,s0:e0].astype(np.float64);vm=float(v.mean());vc=v-vm;den=float(vc@vc)
      if den<1e-9:continue
      alpha=float((vc@qc)/den);beta=qm-alpha*vm;err=float(np.mean((qctx-(alpha*v+beta))**2))
      if best is None or err<best[0]:best=(err,j,lag,alpha,beta)
    if best is not None:
     _,j,lag,alpha,beta=best;sf=alpha*I[j,t0+lag:t1+lag].astype(np.float64)+beta;key=f'{c-j}:{lag}'
   picks[key]=picks.get(key,0)+1
   for t in range(t0,t1):
    pt=0. if t<P else aa+float(np.dot(bb,R[c,t-P:t][::-1].astype(np.float32)));pred=pt+sf[t-t0];q=int(np.rint((float(X[c,t])-pred)/step));Q[c,t]=q;r=pred+step*q;R[c,t]=r;I[c,t]=r-pt
 return R,Q,step,picks
def summary(name,X,R,Q,step,picks,sec):
 zb=zbytes(Q);return {'config':name,'bytes_proxy':zb,'bps_proxy':8*zb/X.size,'zero_fraction':float(np.mean(Q==0)),'pm2_fraction':float(np.mean(np.abs(Q)<=2)),'q_std':float(np.std(Q.astype(np.float64))),'maxerr':float(np.max(np.abs(X-R.astype(np.float64)))),'step':step,'seconds':sec,'top_picks':sorted(picks.items(),key=lambda x:-x[1])[:12]}
tall=time.time();out={}
with h5py.File('${DATA}','r') as f:
 d=f['Acoustic'];_,std=stats(d);eps=.1*std;X=np.asarray(d[:NT,512:512+C],np.float64).T;print(json.dumps({'global_std':std,'eps':eps}),flush=True);tf=time.time();co=fits(X);print(json.dumps({'fit_seconds':time.time()-tf}),flush=True)
 ts=time.time();R,Q,step,p=encode(X,eps,co,False);base=summary('temporal_ar',X,R,Q,step,p,time.time()-ts);print(json.dumps(base),flush=True)
 ts=time.time();R,Q,step,p=encode(X,eps,co,True);ana=summary('analog_alignment',X,R,Q,step,p,time.time()-ts);ana['gain_proxy_vs_temporal']=base['bytes_proxy']/ana['bytes_proxy'];print(json.dumps(ana),flush=True)
 out={'global_std':std,'eps':eps,'region':'hard','baseline':base,'analog':ana,'seconds':time.time()-tall,'scope':'Fast GCA proxy. Each 128-sample block selects a prior decoded channel and time lag solely by matching the current channel decoded 128-sample innovation history. Scale and offset are refit from that same decoder-known history. No lag, source sample, scale, or coefficient is transmitted. Temporal AR coefficients remain ordinary paid side info. Exact reconstruction and hard-error validation; Zstd bytes are screening only.'}
json.dump(out,open('${ROOT}/analog.json','w'),indent=2)
PYCODE
rm -f '${ROOT}/analog.log' '${ROOT}/analog.exit' '${ROOT}/analog.pid' '${ROOT}/analog.json';nohup bash -lc 'python3 ${ROOT}/analog.py > ${ROOT}/analog.log 2>&1; echo $? > ${ROOT}/analog.exit' >/dev/null 2>&1 & echo $! > '${ROOT}/analog.pid';echo PID=$(cat '${ROOT}/analog.pid')`;const r=await out(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,action:a,name:s.name,result:r})}
const cmd=`if [ -f '${ROOT}/analog.pid' ] && kill -0 $(cat '${ROOT}/analog.pid') 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi
if [ -f '${ROOT}/analog.exit' ]; then echo EXIT=$(cat '${ROOT}/analog.exit'); fi
echo '---TAIL---';tail -n 80 '${ROOT}/analog.log' 2>/dev/null || true;echo '---JSON---';test -f '${ROOT}/analog.json' && cat '${ROOT}/analog.json' || true`;const r=await out(await s.runCommand('bash',['-lc',cmd]));return Response.json({ok:r.exitCode===0,action:'status',name:s.name,status:s.status,result:r})
}catch(e){return Response.json({ok:false,action:a,error:String(e),stack:e?.stack||null},{status:500})}}
