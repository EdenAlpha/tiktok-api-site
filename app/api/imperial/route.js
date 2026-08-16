import { Sandbox } from '@vercel/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const NAME='gca-imperial';
const ROOT='/home/vercel-sandbox';
const DATA=`${ROOT}/imperial.h5`;
const REPO=`${ROOT}/ng-flight-deals-`;
const PY=`${ROOT}/venv/bin/python`;
const UV=`${ROOT}/bin/uv`;
const BRANCH='imperial-gca-shared-generator';

async function out(r){let stdout='',stderr='';try{stdout=await r.stdout()}catch{};try{stderr=await r.stderr()}catch{};return {exitCode:r.exitCode,stdout,stderr}}
async function box(){const s=await Sandbox.get({name:NAME});try{await s.update({timeout:2700000})}catch{};return s}

export async function GET(req){
  const a=new URL(req.url).searchParams.get('action')||'status';
  try{
    const s=await box();
    if(a==='prepare'){
      const cmd=`set -euo pipefail\nmkdir -p '${ROOT}/bin'\nif [ ! -x '${UV}' ]; then curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR='${ROOT}/bin' sh; fi\n'${UV}' python install 3.11\nif [ ! -x '${PY}' ]; then '${UV}' venv --python 3.11 '${ROOT}/venv'; fi\n'${UV}' pip install --python '${PY}' cmake ninja numpy h5py zstandard pysz\nif [ -d '${REPO}/.git' ]; then git -C '${REPO}' fetch --depth 1 origin '${BRANCH}'; git -C '${REPO}' checkout -f FETCH_HEAD; else git clone --depth 1 --branch '${BRANCH}' https://github.com/EdenAlpha/ng-flight-deals-.git '${REPO}'; fi\necho DATA_SIZE=$(stat -c%s '${DATA}')\necho DATA_MD5=$(md5sum '${DATA}' | awk '{print $1}')\necho REPO_SHA=$(git -C '${REPO}' rev-parse HEAD)\n'${PY}' - <<'PYCODE'\nimport sys,numpy,h5py,zstandard,pysz\nprint('python',sys.version)\nprint('numpy',numpy.__version__)\nprint('h5py',h5py.__version__)\nprint('zstandard',zstandard.__version__)\nprint('pysz','OK')\nPYCODE`;
      const r=await out(await s.runCommand('bash',['-lc',cmd]));
      return Response.json({ok:r.exitCode===0,action:a,timeout:s.timeout,result:r});
    }
    if(a==='inspect'){
      const cmd=`set -euo pipefail\n'${PY}' - <<'PYCODE'\nimport os,json,h5py\np='${DATA}'\nout={'exists':os.path.exists(p),'size':os.path.getsize(p) if os.path.exists(p) else None}\nwith h5py.File(p,'r') as f:\n out['root_keys']=list(f.keys()); ds=[]\n def visit(name,obj):\n  if isinstance(obj,h5py.Dataset): ds.append({'name':name,'shape':list(obj.shape),'dtype':str(obj.dtype),'chunks':obj.chunks,'compression':obj.compression})\n f.visititems(visit); out['datasets']=ds\nprint(json.dumps(out))\nPYCODE`;
      const r=await out(await s.runCommand('bash',['-lc',cmd]));
      return Response.json({ok:r.exitCode===0,action:a,result:r});
    }
    if(a==='gate'){
      const cmd=`set -euo pipefail\ncd '${REPO}/research'\nrm -f '${ROOT}/gate.log' '${ROOT}/gate.pid' '${ROOT}/gate.exit' imperial_gca_shared_gate.json\nnohup bash -lc \"'${PY}' imperial_gca_shared_generator_gate.py '${DATA}' > '${ROOT}/gate.log' 2>&1; echo \\$? > '${ROOT}/gate.exit'\" >/dev/null 2>&1 &\necho $! > '${ROOT}/gate.pid'\necho PID=$(cat '${ROOT}/gate.pid')`;
      const r=await out(await s.runCommand('bash',['-lc',cmd]));
      return Response.json({ok:r.exitCode===0,action:a,timeout:s.timeout,result:r});
    }
    if(a==='gate-status'){
      const cmd=`set -euo pipefail\nif [ -f '${ROOT}/gate.pid' ] && kill -0 $(cat '${ROOT}/gate.pid') 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi\nif [ -f '${ROOT}/gate.exit' ]; then echo EXIT=$(cat '${ROOT}/gate.exit'); fi\necho '---TAIL---'\ntail -n 160 '${ROOT}/gate.log' 2>/dev/null || true\necho '---JSON---'\nif [ -f '${REPO}/research/imperial_gca_shared_gate.json' ]; then cat '${REPO}/research/imperial_gca_shared_gate.json'; fi`;
      const r=await out(await s.runCommand('bash',['-lc',cmd]));
      return Response.json({ok:r.exitCode===0,action:a,status:s.status,timeout:s.timeout,result:r});
    }
    const cmd=`echo STATUS=${s.status}; echo TIMEOUT=${s.timeout}; test -f '${DATA}' && echo DATA_SIZE=$(stat -c%s '${DATA}'); test -x '${PY}' && '${PY}' --version || true`;
    const r=await out(await s.runCommand('bash',['-lc',cmd]));
    return Response.json({ok:true,action:'status',result:r});
  }catch(e){return Response.json({ok:false,action:a,error:String(e),stack:e?.stack||null},{status:500})}
}
