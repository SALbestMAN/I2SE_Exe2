#!/bin/sh
# Copies the site to tests/e2e/site with the sample data layer in place of Supabase, then serves it on :8765.
D=$(cd "$(dirname "$0")" && pwd); R="$D/../.."
rm -rf "$D/site" && mkdir -p "$D/site" && cp -r "$R/index.html" "$R/css" "$R/js" "$R/lecturer" "$R/student" "$D/site/"
cp "$D/sample-data-layer.js" "$D/site/js/mock.js"
for f in "$D"/site/*.html "$D"/site/lecturer/*.html "$D"/site/student/*.html; do
  sed -i.bak -E 's#<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>##; s#<script src="(\.\./)?js/api-supabase\.js\?v=[0-9.]+"></script>#<script src="\1js/mock.js"></script>#' "$f" && rm "$f.bak"
done
cd "$D/site" && python3 -m http.server 8765
