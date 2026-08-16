set -euo pipefail
REPO=/home/vercel-sandbox/ng-flight-deals-
BRANCH=imperial-gca-corrected-address-fastgate
if [ ! -d "$REPO/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" https://github.com/EdenAlpha/ng-flight-deals-.git "$REPO"
else
  git -C "$REPO" fetch --depth 1 origin "$BRANCH"
  git -C "$REPO" checkout -f FETCH_HEAD
fi
printf 'repo_sha='; git -C "$REPO" rev-parse HEAD
python3 "$REPO/research/imperial_gca_corrected_constrained_address_fastgate.py" /home/vercel-sandbox/imperial.h5
