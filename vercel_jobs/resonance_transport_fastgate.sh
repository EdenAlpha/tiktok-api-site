set -euo pipefail
python3 -m pip install --disable-pip-version-check -q scipy
REPO=/home/vercel-sandbox/ng-flight-deals-
BRANCH=imperial-gca-corrected-address-fastgate
git -C "$REPO" fetch --depth 1 origin "$BRANCH"
git -C "$REPO" checkout -f FETCH_HEAD
printf 'repo_sha='; git -C "$REPO" rev-parse HEAD
python3 "$REPO/research/imperial_resonance_transport_quotient_fastgate.py" /home/vercel-sandbox/imperial.h5
