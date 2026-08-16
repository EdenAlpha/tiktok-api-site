import { Sandbox } from '@vercel/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const NAME = 'gca-imperial';
const SOURCE = 'https://gdr-data-lake.s3.amazonaws.com/imperialvalleydas/v1.0.0/DF__UTC_20201113_235932.602.h5';
const DEST = '/home/vercel-sandbox/imperial.h5';
const EXPECTED = '415030456';

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

export async function GET(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';

  try {
    if (action === 'create') {
      const s = await getOrCreate();
      const probe = await output(await s.runCommand('bash', ['-lc', 'command -v python3 || command -v python || true; python3 --version 2>/dev/null || python --version 2>/dev/null || true; command -v curl; uname -a']));
      return Response.json({ ok: true, action, name: s.name, status: s.status, region: s.region, vcpus: s.vcpus, memory: s.memory, probe });
    }

    if (action === 'download') {
      const s = await getOrCreate();
      const cmd = `set -euo pipefail\nmkdir -p /home/vercel-sandbox\nif [ -f '${DEST}' ] && [ \"$(stat -c%s '${DEST}')\" = '${EXPECTED}' ]; then echo ALREADY_READY; else rm -f '${DEST}.part'; curl -fL --retry 5 --retry-delay 2 --connect-timeout 20 -o '${DEST}.part' '${SOURCE}'; test \"$(stat -c%s '${DEST}.part')\" = '${EXPECTED}'; mv '${DEST}.part' '${DEST}'; fi\necho SIZE=$(stat -c%s '${DEST}')\necho MD5=$(md5sum '${DEST}' | awk '{print $1}')`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, status: s.status, result });
    }

    if (action === 'setup') {
      const s = await getOrCreate();
      const cmd = `set -euo pipefail\nPY=$(command -v python3 || command -v python)\n\"$PY\" -m pip install --disable-pip-version-check -q numpy h5py zstandard pysz\n\"$PY\" - <<'PY'\nimport numpy,h5py,zstandard\nprint('numpy',numpy.__version__)\nprint('h5py',h5py.__version__)\ntry:\n import pysz; print('pysz','OK')\nexcept Exception as e: print('pysz_error',repr(e))\nPY`;
      const result = await output(await s.runCommand('bash', ['-lc', cmd]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, result });
    }

    if (action === 'inspect') {
      const s = await getOrCreate();
      const script = `import os, json, h5py\np='${DEST}'\nout={'exists':os.path.exists(p),'size':os.path.getsize(p) if os.path.exists(p) else None}\nif os.path.exists(p):\n with h5py.File(p,'r') as f:\n  def visit(name,obj):\n   if isinstance(obj,h5py.Dataset): out.setdefault('datasets',[]).append({'name':name,'shape':list(obj.shape),'dtype':str(obj.dtype),'chunks':obj.chunks,'compression':obj.compression})\n  f.visititems(visit)\nprint(json.dumps(out))`;
      const result = await output(await s.runCommand('bash', ['-lc', `PY=$(command -v python3 || command -v python); "$PY" -c ${JSON.stringify(script)}`]));
      return Response.json({ ok: result.exitCode === 0, action, name: s.name, result });
    }

    const s = await getExisting();
    const cmd = `if [ -f '${DEST}' ]; then echo SIZE=$(stat -c%s '${DEST}'); echo MD5=$(md5sum '${DEST}' | awk '{print $1}'); else echo MISSING; fi`;
    const result = await output(await s.runCommand('bash', ['-lc', cmd]));
    return Response.json({ ok: true, action: 'status', name: s.name, status: s.status, region: s.region, vcpus: s.vcpus, memory: s.memory, result });
  } catch (e) {
    return Response.json({ ok: false, action, error: String(e), stack: e?.stack || null }, { status: 500 });
  }
}
