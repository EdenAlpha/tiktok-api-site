set -euo pipefail
REPO=/home/vercel-sandbox/ng-flight-deals-
BRANCH=imperial-gca-corrected-address-fastgate
git -C "$REPO" fetch --depth 1 origin "$BRANCH"
git -C "$REPO" checkout -f FETCH_HEAD
printf 'repo_sha='; git -C "$REPO" rev-parse HEAD
python3 "$REPO/research/imperial_pulse_fast_transfer_v2.py" /home/vercel-sandbox/imperial.h5
