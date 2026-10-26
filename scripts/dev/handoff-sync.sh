#!/bin/bash
# Every N minutes: copy the live journal + logs into the handoff branch and push, so any new AI/chat can resume.
set -u
ROOT=/Users/sima/Desktop/LawBid
WT=$ROOT/.claude/worktrees/handoff-log
SCR=/private/tmp/claude-501/-Users-sima-Desktop-LawBid--claude-worktrees-resume-from-checkpoint-bae53d/fbc245b1-1347-4f6e-97bd-ab5ade6c3435/scratchpad
INTERVAL=${1:-600}
while true; do
  mkdir -p "$WT/docs/dev/handoff/memory"
  cp "$ROOT/NEXT_CLAUDE_START_HERE.md" "$WT/NEXT_CLAUDE_START_HERE.md" 2>/dev/null
  cp "$SCR/MERGE_TRAIN_LOG.md" "$WT/docs/dev/handoff/MERGE_TRAIN_LOG.md" 2>/dev/null
  cp "$SCR/hold.txt" "$WT/docs/dev/handoff/hold.txt" 2>/dev/null
  for f in "$ROOT"/docs/dev/*.md; do [ -f "$f" ] && cp "$f" "$WT/docs/dev/"; done
  cp /Users/sima/.claude/projects/-Users-sima-Desktop-LawBid/memory/*.md "$WT/docs/dev/handoff/memory/" 2>/dev/null
  cd "$WT" || exit 1
  git add -f NEXT_CLAUDE_START_HERE.md; git add -A docs/dev >/dev/null 2>&1
  if ! git diff --cached --quiet; then
    git commit -q -m "handoff: journal sync $(date '+%Y-%m-%d %H:%M')

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" >/dev/null 2>&1 && git push -q origin HEAD:claude/handoff-log >/dev/null 2>&1 && echo "$(date +%H:%M) synced" || echo "$(date +%H:%M) sync FAILED"
  fi
  sleep "$INTERVAL"
done
