#!/bin/bash
# CodeInsight AI — Deploy status checker
# Usage: VERCEL_TOKEN=xxx ./scripts/check-deploy.sh [commit-sha]
# Token is read from VERCEL_TOKEN env var (set in .env or shell).

# Load .env if present
if [ -f /home/z/my-project/.env ]; then
  export $(grep -v '^#' /home/z/my-project/.env | xargs 2>/dev/null)
fi

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ VERCEL_TOKEN env var not set"
  echo "   Add to .env: VERCEL_TOKEN=vcp_xxx"
  exit 1
fi

PROJECT_ID="prj_ceiIjx9fSbZie3BJGrj8ErGHJYPS"

SHA="${1:-}"
if [ -n "$SHA" ]; then
  FILTER="&meta.githubCommitSha=$SHA"
else
  FILTER=""
fi

echo "🔍 Checking Vercel deploy status..."
echo "   Project: code-insight-ai"
[ -n "$SHA" ] && echo "   Commit:  ${SHA:0:7}"
echo ""

curl -s "https://api.vercel.com/v6/deployments?projectId=$PROJECT_ID&limit=1&target=production$FILTER" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
if (!data.deployments || data.deployments.length === 0) {
  console.log('❌ No deployment found');
  process.exit(1);
}
const d = data.deployments[0];
const age = Math.round((Date.now() - d.created) / 1000);
const buildTime = d.ready ? Math.round((d.ready - d.buildingAt) / 1000) : null;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Commit:  ', (d.meta?.githubCommitMessage || '').split('\n')[0]);
console.log('SHA:     ', (d.meta?.githubCommitSha || '').slice(0, 7));
console.log('Branch:  ', d.meta?.githubCommitRef || 'main');
console.log('Author:  ', d.meta?.githubCommitAuthorName || '?');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const stateEmoji = {
  READY: '✅',
  ERROR: '❌',
  BUILDING: '🔨',
  QUEUED: '⏳',
  CANCELED: '🚫',
};
const emoji = stateEmoji[d.state] || '❓';
console.log('State:   ', emoji, d.state, d.readyState || '');

if (d.state === 'READY') {
  console.log('URL:     ', 'https://' + d.url);
  console.log('Build:   ', buildTime + 's');
  console.log('Age:     ', age + 's ago');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Deploy successful!');
  process.exit(0);
} else if (d.state === 'ERROR') {
  console.log('Build:   ', (buildTime || 0) + 's (failed)');
  console.log('Age:     ', age + 's ago');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💥 BUILD FAILED!');
  console.log('');
  console.log('📋 View build logs:');
  console.log('   https://vercel.com/vanhoi04082006-pixels-projects/code-insight-ai/' + d.uid);
  process.exit(1);
} else if (d.state === 'BUILDING') {
  console.log('Build:   in progress...');
  console.log('Age:     ', age + 's ago');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔨 Building... check again in 30s');
  process.exit(1);
} else {
  console.log('Age:     ', age + 's ago');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
}
"
