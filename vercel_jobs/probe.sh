set -euo pipefail
printf 'bridge=ok\n'
python3 --version
printf 'data_size='; stat -c%s /home/vercel-sandbox/imperial.h5
printf 'data_md5='; md5sum /home/vercel-sandbox/imperial.h5 | awk '{print $1}'
printf 'repo_sha='; git -C /home/vercel-sandbox/ng-flight-deals- rev-parse HEAD
