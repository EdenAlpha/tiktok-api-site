import { Sandbox } from '@vercel/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const NAME = 'gca-imperial';
const SOURCE = 'https://gdr-data-lake.s3.amazonaws.com/imperialvalleydas/v1.0.0/DF__UTC_20201113_235932.602.h5';
const DEST = '/home/vercel-sandbox/imperial.h5';
const EXPECTED = '415030456';
const REPO = '/home/vercel-sandbox/ng-flight-deals-';
const BRANCH = 'imperial-gca-shared-generator';

async function output(result) {
  let stdout = '';
  let stderr = '';
  try { stdout = await result.stdout(); } catch {}
  try { stderr = await result.stderr(); } catch {}
  return { exitCode: result.exitCode, stdout, stderr };
}

async function getExisting() {
  return await Sandbox.get({ name: NAME });
}

async function getOrCreate() {
  try {
    return await getExisting();
  } catch {
    return await Sandbox.create({
      name: NAME,
      timeout: 300000,
      snapshotExpiration: 604800000,
      persistent: true,
    });
  }
}

async function tryExtend(s) {
  try {
    await s.update({ timeout: 2700000 });
    return { ok: true, timeout: s.timeout };
  } catch (e) {
    return { ok: false, timeout: s.timeout, error: String(e) };
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';

  try {
    if (action === 'create') {
      const s = await getOrCreate();
      const timeout = await tryExtend(s);
      const probe = await output(await s.runCommand('bash', ['-lc', 'command -v python3 || command -v python || true; python3 --version 2>/dev/null || python --version 2>/dev/null || true; command -v curl; command -v git; uname -a']));
      return Response.json({ ok: true, action, name: s.name, status: s.status, region: s.region, vcpus: s.vcpus, memory: s.memory, timeout, probe });
    }

    if (action === 'download') {
      const s = await getOrCreate();
      const cmd = `set -euo pipefail\nmkdir -p /home/vercel-sandbox\nif [ -f '${DEST}' ] && [ \"$(stat -c%s '${DEST}')\" = '${EXPECTED}' ]; then echo ALREADY_READY; else rm -f '${DEST}.part'; curl -fL --retry 5 --retry-delay 2 --connect-timeout 20 -o '${DEST}.part' '${SOURCE}'; test \"$(stat -c%s '${DEST}.part')\" = '${EXPECTED}'; mv '${DEST}.part' '${DEST}'; fi\necho SIZE=$(stat -c%s '${DEST}')\necho MD5=$(md5sum '${DEST}' | awk '{print $1}')`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, status: s.status, result });
    }

    if (action === 'prepare') {
      const s = await getOrCreate();
      const timeout = await tryExtend(s);
      const cmd = `set -euo pipefail\nPY=$(command -v python3 || command -v python)\n\"$PY\" -m pip install --disable-pip-version-check -q cmake ninja numpy h5py zstandard\nexport PATH=\"/usr/local/bin:$HOME/.local/bin:$PATH\"\n\"$PY\" -m pip install --disable-pip-version-check -q pysz\nif [ -d '${REPO}/.git' ]; then git -C '${REPO}' fetch --depth 1 origin '${BRANCH}'; git -C '${REPO}' checkout -f FETCH_HEAD; else git clone --depth 1 --branch '${BRANCH}' 'https://github.com/EdenAlpha/ng-flight-deals-.git' '${REPO}'; fi\necho FILE_SIZE=$(stat -c%s '${DEST}')\necho FILE_MD5=$(md5sum '${DEST}' | awk '{print $1}')\necho GIT=$(git -C '${REPO}' rev-parse HEAD)\n\"$PY\" - <<'PY'\nimport numpy,h5py,zstandard,pysz\nprint('numpy',numpy.__version__)\nprint('h5py',h5py.__version__)\nprint('zstandard',zstandard.__version__)\nprint('pysz','OK')\nPY`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, timeout, result });
    }

    if (action === 'inspect') {
      const s = await getOrCreate();
      const cmd = `set -euo pipefail\nPY=$(command -v python3 || command -v python)\n\"$PY\" - <<'PY'\nimport os, json, h5py\np='${DEST}'\nout={'exists':os.path.exists(p),'size':os.path.getsize(p) if os.path.exists(p) else None}\nif os.path.exists(p):\n    with h5py.File(p,'r') as f:\n        out['root_keys']=list(f.keys())\n        ds=[]\n        def visit(name,obj):\n            if isinstance(obj,h5py.Dataset):\n                ds.append({'name':name,'shape':list(obj.shape),'dtype':str(obj.dtype),'chunks':obj.chunks,'compression':obj.compression})\n        f.visititems(visit)\n        out['datasets']=ds\nprint(json.dumps(out))\nPY`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, result });
    }

    if (action === 'gate') {
      const s = await getOrCreate();
      const timeout = await tryExtend(s);
      const cmd = `set -euo pipefail\ncd '${REPO}/research'\nrm -f /home/vercel-sandbox/gate.log /home/vercel-sandbox/gate.pid /home/vercel-sandbox/gate.exit\nnohup bash -lc 'python3 imperial_gca_shared_generator_gate.py ${DEST} > /home/vercel-sandbox/gate.log 2>&1; echo $? > /home/vercel-sandbox/gate.exit' >/dev/null 2>&1 &\necho $! > /home/vercel-sandbox/gate.pid\necho PID=$(cat /home/vercel-sandbox/gate.pid)`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, timeout, result });
    }

    if (action === 'gate-status') {
      const s = await getOrCreate();
      const cmd = `set -euo pipefail\nif [ -f /home/vercel-sandbox/gate.pid ] && kill -0 $(cat /home/vercel-sandbox/gate.pid) 2>/dev/null; then echo STATE=RUNNING; else echo STATE=STOPPED; fi\nif [ -f /home/vercel-sandbox/gate.exit ]; then echo EXIT=$(cat /home/vercel-sandbox/gate.exit); fi\necho '---TAIL---'\ntail -n 120 /home/vercel-sandbox/gate.log 2>/dev/null || true\necho '---JSON---'\nif [ -f '${REPO}/research/imperial_gca_shared_gate.json' ]; then cat '${REPO}/research/imperial_gca_shared_gate.json'; fi`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, status: s.status, result });
    }

    const s = await getExisting();
    const cmd = `if [ -f '${DEST}' ]; then echo SIZE=$(stat -c%s '${DEST}'); echo MD5=$(md5sum '${DEST}' | awk '{print $1}'); else echo MISSING; fi`;
    const result = await output(await s.runCommand('bash', ['-lc', cmd]));
    return Response.json({ ok: true, action: 'status', name: s.name, status: s.status, region: s.region, vcpus: s.vcpus, memory: s.memory, timeout: s.timeout, result });
  } catch (e) {
    return Response.json({ ok: false, action, error: String(e), stack: e?.stack || null }, { status: 500 });
  }
}
