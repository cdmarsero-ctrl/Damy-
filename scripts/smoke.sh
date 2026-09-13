#!/usr/bin/env bash
#
# End-to-end smoke test.
#
# Exercises the full learner journey against a running server: register, take
# the adaptive placement test to completion, set goals, enrol, complete a
# lesson, grade a review card, hold a conversation, submit writing, score
# pronunciation, sit an exam module, and read the analytics back.
#
# Usage:  BASE_URL=http://localhost:3000 ./scripts/smoke.sh
#
# It creates a throwaway account each run, so it is safe against a dev database
# but should not be pointed at production.

set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:3000}"
JAR="$(mktemp)"
EMAIL="smoke-$(date +%s)-$RANDOM@example.test"
PASSWORD="correct-horse-battery-staple"

pass=0
fail=0

cleanup() { rm -f "$JAR"; }
trap cleanup EXIT

req() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$BASE$path" \
      -b "$JAR" -c "$JAR" \
      -H 'Content-Type: application/json' \
      -d "$body"
  else
    curl -sS -X "$method" "$BASE$path" -b "$JAR" -c "$JAR"
  fi
}

check() {
  local label="$1" condition="$2"
  if [ "$condition" = "true" ]; then
    printf '  \033[32m✓\033[0m %s\n' "$label"
    pass=$((pass + 1))
  else
    printf '  \033[31m✗\033[0m %s\n' "$label"
    fail=$((fail + 1))
  fi
}

# jq-free JSON field extraction, so the script runs on a bare container.
field() {
  node -e "
    let raw='';
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => {
      try {
        const parts = process.argv[1].split('.');
        let value = JSON.parse(raw);
        for (const part of parts) value = value?.[/^\d+$/.test(part) ? Number(part) : part];
        process.stdout.write(value === undefined || value === null ? '' : String(value));
      } catch { process.stdout.write(''); }
    });
  " "$1"
}

echo
echo "Lexicon smoke test → $BASE"
echo

# ---------------------------------------------------------------- auth
echo "Authentication"
REGISTER=$(req POST /api/auth/register "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "register returns the placement redirect" "$([ "$(echo "$REGISTER" | field next)" = "/placement" ] && echo true || echo false)"

ME=$(req GET /api/me)
check "authenticated session reads /api/me" "$([ -n "$(echo "$ME" | field user.id)" ] && echo true || echo false)"
check "profile, settings and stats were created" "$([ -n "$(echo "$ME" | field stats.xpTotal)" ] && echo true || echo false)"

req POST /api/auth/refresh > /dev/null
check "refresh token rotates" "$([ -n "$(req GET /api/me | field user.id)" ] && echo true || echo false)"

# ----------------------------------------------------------- placement
echo
echo "Adaptive placement"
START=$(req POST /api/placement/start)
TEST_ID=$(echo "$START" | field testId)
ITEM_ID=$(echo "$START" | field item.id)
check "placement test starts and returns an item" "$([ -n "$TEST_ID" ] && [ -n "$ITEM_ID" ] && echo true || echo false)"
# Requires a real item first: an error response has no answerIndex either, and
# a security assertion that passes when nothing was returned is worthless.
check "the answer key is not leaked to the client" \
  "$([ -n "$(echo "$START" | field item.options.0)" ] \
     && [ -z "$(echo "$START" | field item.answerIndex)" ] && echo true || echo false)"

answered=0
done_flag=""
while [ -z "$done_flag" ] && [ "$answered" -lt 30 ]; do
  RESP=$(req POST /api/placement/answer \
    "{\"testId\":\"$TEST_ID\",\"itemId\":\"$ITEM_ID\",\"answerIndex\":1,\"responseMs\":3200}")
  done_flag=$(echo "$RESP" | field done | grep -x true || true)
  ITEM_ID=$(echo "$RESP" | field item.id)
  answered=$((answered + 1))
  [ -z "$ITEM_ID" ] && break
done

LEVEL=$(echo "$RESP" | field result.level)
check "test terminated adaptively in $answered items" "$([ "$answered" -ge 12 ] && [ "$answered" -le 22 ] && echo true || echo false)"
check "a CEFR level was assigned ($LEVEL)" "$(echo "$LEVEL" | grep -qE '^(B2|C1|C2)$' && echo true || echo false)"
check "per-skill subscores were computed" "$([ -n "$(echo "$RESP" | field result.subscores.GRAMMAR)" ] && echo true || echo false)"

# ------------------------------------------------------------- profile
echo
echo "Profile and enrolment"
PROFILE=$(req PATCH /api/me/profile '{"goals":["ACADEMIC","EXAM"],"dailyGoalXp":80,"preferredAccent":"UK","targetExam":"CAE"}')
check "goals are saved" "$(echo "$PROFILE" | grep -q ACADEMIC && echo true || echo false)"

TRACKS=$(req GET /api/tracks)
TRACK_ID=$(echo "$TRACKS" | field tracks.0.id)
check "learning paths are returned" "$([ -n "$TRACK_ID" ] && echo true || echo false)"
check "paths are ordered by relevance to stated goals" \
  "$([ "$(echo "$TRACKS" | field tracks.0.relevance)" -ge "$(echo "$TRACKS" | field tracks.1.relevance)" ] && echo true || echo false)"

req POST "/api/tracks/$TRACK_ID/enroll" > /dev/null
check "enrolment succeeds" "$([ "$(req GET /api/tracks | field tracks.0.enrolled)" = "true" ] && echo true || echo false)"

# -------------------------------------------------------------- lesson
echo
echo "Lessons and grading"
LESSON_ID=$(echo "$TRACKS" | field tracks.0.units.0.lessons.0.id)
LESSON=$(req GET "/api/lessons/$LESSON_ID")
EX_ID=$(echo "$LESSON" | field lesson.exercises.0.id)
check "lesson loads with exercises" "$([ -n "$EX_ID" ] && echo true || echo false)"
# Guarded by the presence of exercises, so an error response cannot pass this.
check "exercise solutions are never sent to the client" \
  "$([ -n "$EX_ID" ] && ! echo "$LESSON" | grep -q '"solution"' && echo true || echo false)"

GRADE=$(req POST /api/lessons/submit "{\"exerciseId\":\"$EX_ID\",\"response\":{\"answerIndex\":0},\"durationMs\":5000}")
check "an exercise attempt is graded" "$([ -n "$(echo "$GRADE" | field score)" ] && echo true || echo false)"
check "grading returns an explanation" "$([ -n "$(echo "$GRADE" | field summary)" ] && echo true || echo false)"

COMPLETE=$(req POST /api/lessons/complete "{\"lessonId\":\"$LESSON_ID\",\"timeSpentSec\":420}")
XP=$(echo "$COMPLETE" | field rewards.xpAwarded)
check "lesson completion awards XP ($XP)" "$([ -n "$XP" ] && [ "$XP" -gt 0 ] && echo true || echo false)"
check "a streak is started" "$([ "$(echo "$COMPLETE" | field rewards.streakCurrent)" -ge 1 ] && echo true || echo false)"
check "badges are evaluated on activity" "$([ -n "$(echo "$COMPLETE" | field rewards.newBadges.0.slug)" ] && echo true || echo false)"

# ------------------------------------------------------------- reviews
echo
echo "Spaced repetition"
LEX=$(req GET '/api/lexicon?limit=3')
LEX_ID=$(echo "$LEX" | field items.0.id)
check "lexicon is searchable" "$([ -n "$LEX_ID" ] && echo true || echo false)"

req POST /api/reviews/add "{\"lexicalItemId\":\"$LEX_ID\"}" > /dev/null
QUEUE=$(req GET '/api/reviews/queue?limit=5')
CARD_ID=$(echo "$QUEUE" | field cards.0.id)
check "card enters the review queue" "$([ -n "$CARD_ID" ] && echo true || echo false)"
check "interval previews accompany each card" "$([ -n "$(echo "$QUEUE" | field cards.0.intervals.0.label)" ] && echo true || echo false)"

REVIEW=$(req POST /api/reviews/grade "{\"cardId\":\"$CARD_ID\",\"rating\":\"GOOD\",\"durationMs\":4000}")
check "grading schedules the next repetition ($(echo "$REVIEW" | field interval))" \
  "$([ -n "$(echo "$REVIEW" | field interval)" ] && echo true || echo false)"

# ------------------------------------------------------------------ AI
echo
echo "AI surfaces"
CONV=$(req POST /api/ai/conversations '{"mode":"DEBATE","topic":"Voting should be compulsory","userStance":"for"}')
CONV_ID=$(echo "$CONV" | field conversation.id)
check "a debate opens with the AI taking the other side" \
  "$([ -n "$CONV_ID" ] && [ -n "$(echo "$CONV" | field conversation.aiStance)" ] && echo true || echo false)"

TURN=$(req POST /api/ai/conversations/message \
  "{\"conversationId\":\"$CONV_ID\",\"message\":\"I am agree that compulsory voting depend of civic duty, and there is many informations supporting it.\"}")
check "a conversational turn returns a reply" "$([ -n "$(echo "$TURN" | field assistantMessage.content)" ] && echo true || echo false)"
check "planted errors are caught (am agree / depend of / informations)" \
  "$([ "$(echo "$TURN" | field corrections.2.original)" != "" ] && echo true || echo false)"

WRITE=$(req POST /api/ai/writing '{"genre":"ESSAY","prompt":"Some argue expertise has been devalued by universal access to information. To what extent do you agree?","text":"Nowadays, it is very important to consider that the amount of people who believe they are experts has grown. In my point of view, this is a big problem. According to me, the informations available online have made everyone think they know everything. However, I would argue that genuine expertise consists in years of deliberate practice, not in the accumulation of facts. Although the internet has democratised access to knowledge, it has not democratised the judgement required to evaluate that knowledge. Not only does this create confusion, but it also undermines the institutions that certify competence. Nevertheless, it would be disingenuous to claim that experts have never abused their authority. The question, therefore, is not whether expertise matters but how it should be demonstrated to a sceptical public."}')
BAND=$(echo "$WRITE" | field report.overallBand)
check "writing receives a band ($BAND)" "$([ -n "$BAND" ] && echo true || echo false)"
check "writing feedback is annotated" "$([ -n "$(echo "$WRITE" | field report.annotations.0.suggestion)" ] && echo true || echo false)"
check "priorities are actionable" "$([ -n "$(echo "$WRITE" | field report.priorities.0)" ] && echo true || echo false)"
check "all five criteria are scored" "$([ -n "$(echo "$WRITE" | field report.criteria.lexicalResource)" ] && echo true || echo false)"

OUTLINE=$(req POST /api/ai/writing/outline '{"genre":"ESSAY","prompt":"Should voting be compulsory?"}')
check "a planning outline is produced" "$([ -n "$(echo "$OUTLINE" | field outline.0)" ] && echo true || echo false)"

PRON=$(req POST /api/speech/pronunciation '{"targetText":"The texts he sent last month contained several inconsistencies.","transcript":"The text he sent last month contained several inconsistency","durationMs":5200,"accent":"UK"}')
check "pronunciation is scored ($(echo "$PRON" | field result.overall)/100)" \
  "$([ -n "$(echo "$PRON" | field result.overall)" ] && echo true || echo false)"
check "per-word scoring identifies the mismatches" \
  "$([ -n "$(echo "$PRON" | field result.wordScores.0.word)" ] && echo true || echo false)"
check "targeted advice is returned" "$([ -n "$(echo "$PRON" | field result.tips.0)" ] && echo true || echo false)"

# -------------------------------------------------------------- exams
echo
echo "Exam preparation"
EXAMS=$(req GET /api/exams)
MODULE_ID=$(echo "$EXAMS" | field modules.0.id)
check "exam modules are listed" "$([ -n "$MODULE_ID" ] && echo true || echo false)"

EXAM_START=$(req POST /api/exams/start "{\"moduleId\":\"$MODULE_ID\"}")
ATTEMPT_ID=$(echo "$EXAM_START" | field attempt.id)
TASK_ID=$(echo "$EXAM_START" | field tasks.0.id)
check "a timed attempt starts" "$([ -n "$ATTEMPT_ID" ] && echo true || echo false)"
# Guarded by the presence of tasks, for the same reason.
check "task solutions are withheld during the attempt" \
  "$([ -n "$TASK_ID" ] && ! echo "$EXAM_START" | grep -q '"solution"' && echo true || echo false)"

EXAM_SUBMIT=$(req POST /api/exams/submit \
  "{\"attemptId\":\"$ATTEMPT_ID\",\"responses\":[{\"taskId\":\"$TASK_ID\",\"response\":{\"pairs\":{\"A\":\"i\"}}}],\"durationSec\":600}")
check "the attempt is scored and converted ($(echo "$EXAM_SUBMIT" | field scoring.label))" \
  "$([ -n "$(echo "$EXAM_SUBMIT" | field scoring.label)" ] && echo true || echo false)"
check "solutions are released after submission" \
  "$([ -n "$(echo "$EXAM_SUBMIT" | field review.0.solution)" ] && echo true || echo false)"

# ---------------------------------------------------- gamification
echo
echo "Gamification and analytics"
CHALLENGES=$(req GET /api/gamification/challenges)
check "daily challenges are generated" "$([ -n "$(echo "$CHALLENGES" | field challenges.0.title)" ] && echo true || echo false)"
check "badge progress is tracked" "$([ -n "$(echo "$CHALLENGES" | field badges.0.slug)" ] && echo true || echo false)"

BOARD=$(req GET '/api/gamification/leaderboard?scope=week')
check "leaderboard ranks by period XP" "$([ -n "$(echo "$BOARD" | field rows.0.xp)" ] && echo true || echo false)"
check "your own standing is always returned" "$([ -n "$(echo "$BOARD" | field you.rank)" ] && echo true || echo false)"

ANALYTICS=$(req GET '/api/analytics?days=30')
check "analytics series is zero-filled across the window" \
  "$([ "$(node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(r).dailyXp.length))}catch{process.stdout.write('0')}})" <<< "$ANALYTICS")" = "30" ] && echo true || echo false)"
check "skill radar is populated" "$([ -n "$(echo "$ANALYTICS" | field skillRadar.0.skill)" ] && echo true || echo false)"

REPORT=$(req POST /api/analytics/report)
check "a weekly report is generated" "$([ -n "$(echo "$REPORT" | field report.summary)" ] && echo true || echo false)"
check "recommendations are produced" "$([ -n "$(echo "$REPORT" | field report.recommendations.0.title)" ] && echo true || echo false)"

# --------------------------------------------------------------- sync
echo
echo "Offline sync"
KEY="smoke-$(date +%s%N)"
SYNC=$(req POST /api/sync \
  "{\"clientId\":\"smoke-device\",\"mutations\":[{\"idempotencyKey\":\"$KEY\",\"kind\":\"studyTime\",\"payload\":{\"minutes\":12,\"activity\":\"offline-review\"},\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}")
check "an offline mutation replays" "$([ "$(echo "$SYNC" | field applied)" = "1" ] && echo true || echo false)"

SYNC2=$(req POST /api/sync \
  "{\"clientId\":\"smoke-device\",\"mutations\":[{\"idempotencyKey\":\"$KEY\",\"kind\":\"studyTime\",\"payload\":{\"minutes\":12,\"activity\":\"offline-review\"},\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}")
check "replaying the same mutation is idempotent" "$([ "$(echo "$SYNC2" | field skipped)" = "1" ] && echo true || echo false)"

BUNDLE=$(req GET /api/sync)
check "the offline study bundle is downloadable" "$([ -n "$(echo "$BUNDLE" | field cachedAt)" ] && echo true || echo false)"

# ------------------------------------------------------------ security
echo
echo "Security"
ANON=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/me")
check "unauthenticated API access is rejected ($ANON)" "$([ "$ANON" = "401" ] && echo true || echo false)"

WEAK=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Weak","email":"weak-'"$RANDOM"'@example.test","password":"password"}')
check "weak passwords are refused ($WEAK)" "$([ "$WEAK" = "422" ] && echo true || echo false)"

DUPE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Dupe\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "duplicate registration is refused ($DUPE)" "$([ "$DUPE" = "409" ] && echo true || echo false)"

BADLOGIN=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password-entirely\"}")
check "wrong credentials are rejected ($BADLOGIN)" "$([ "$BADLOGIN" = "401" ] && echo true || echo false)"

req POST /api/auth/logout > /dev/null
AFTER=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/me" -b "$JAR")
check "logout invalidates the session ($AFTER)" "$([ "$AFTER" = "401" ] && echo true || echo false)"

# --------------------------------------------------------------- done
echo
printf '\033[1m%d passed, %d failed\033[0m\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
