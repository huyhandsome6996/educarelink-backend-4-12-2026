# Flow 1 - Step 11: Gemini AI Capabilities + Scoring Configuration

## 11.1 Product owner directive
> "Vì tôi đang dùng API của Gemini nên tôi muốn nó có càng nhiều quyền năng mà nó có thể làm tốt, để kết hợp cùng hệ thống xử lý được càng nhiều công việc thì càng tốt."

Governing rule: **use Gemini wherever it is reliably good, but never let it be the single source of truth for money, penalties or account bans.** Every AI output with a financial or punitive effect must be either deterministic-verifiable or confirmed by a human admin. Matching must keep working when Gemini is down.

## 11.2 Gemini task registry
| # | Task | Stage | Output | Trust | Fallback |
|---|---|---|---|---|---|
| 1 | Parse a job post into JobRequirement | posting | structured JSON | high | rule-based parser |
| 2 | Generate the job title and a short summary | posting | VI text | high | template |
| 3 | Detect ambiguity and produce clarification questions | posting | list of questions | high | skip |
| 4 | Classify job_type (tutoring / childcare / pickup) | posting | enum | high | the parent's explicit choice always wins |
| 5 | Extract and normalize required skills to the skill taxonomy | matching | skill codes | high | keyword map |
| 6 | Safety and policy screening | posting | flags + severity | medium | severity >= high always goes to an admin queue |
| 7 | Urgency detection | matching | normal / high | high | date heuristic |
| 8 | Semantic profile match: job text vs CarePartner bio, skills, reviews | matching | 0-100 + reason | medium | rule score only |
| 9 | Human-readable "why recommended" per candidate | matching UI | 1 VI sentence | high | generic sentence |
| 10 | Fair-rate suggestion from market data | posting | VND range | medium | shown as a suggestion only |
| 11 | Duplicate and spam post detection | posting | bool + reason | medium | none |
| 12 | Review summarization: many reviews -> tags + sentiment | profile | tags, sentiment | high | average rating only |
| 13 | Cancel-reason plausibility check | cancellation | likely_valid / needs_review / likely_invalid | LOW | admin decides |
| 14 | Appeal pre-screening with rationale | appeal | verdict + rationale | LOW | admin decides |
| 15 | Dispute triage between parent and CarePartner | dispute | summary + suggested resolution | LOW | admin decides |
| 16 | Onboarding assistant: build skills and bio from free text | onboarding | structured draft | high | manual entry |
| 17 | Weekly digest copy for parents | engagement | VI text | high | template |
| 18 | VI-EN translation for internal logs and admin review | ops | text | high | none |

Trust LOW = advisory only, human in the loop, never auto-applied.

## 11.3 Structured output contract (mandatory)
All extraction tasks MUST use Gemini structured output or function calling with an explicit JSON schema. Never parse free-form JSON.

```json
{
  "job_type": "tutoring",
  "title_vi": "Dạy kèm Toán lớp 5 buổi tối",
  "summary_vi": "Gia sư Toán cho học sinh lớp 5, 3 buổi tối mỗi tuần tại Linh Đàm.",
  "required_skills": ["toan", "tieu_hoc", "kien_nhan"],
  "target_group": "primary_student",
  "dates": ["2026-04-15", "2026-04-17"],
  "recurrence": { "pattern": "weekly", "weekdays": [2, 4, 6], "until": "2026-05-30" },
  "time_from": "19:00",
  "time_to": "21:00",
  "hourly_rate_vnd": 150000,
  "location": { "lat": 20.98, "lng": 105.80, "address": "Linh Đàm, Hà Nội" },
  "special_requirements": ["uu_tien_su_pham"],
  "gender_preference": null,
  "experience_required": "any",
  "suitable_for_newbie": true,
  "urgency": "normal",
  "sensitivity_level": "medium",
  "safety_flags": ["child_involved", "evening_hours"],
  "needs_verification": false,
  "needs_admin_review": false,
  "clarification_questions": [],
  "field_confidence": { "dates": 0.98, "required_skills": 0.91, "gender_preference": 0.4 },
  "model_version": "gemini-x",
  "prompt_version": "v1"
}
```

Validation rules:
- Validate against the JSON schema. On failure, retry ONCE with a repair instruction, then fall back to the rule-based parser and set `ai_parse_status = fallback`.
- Any field with `field_confidence < 0.6` is added to `clarification_questions` and the parent is asked to confirm.
- The AI can NEVER override the parent's explicit `job_type` selection from Step 1.
- Store `model_version` and `prompt_version` on every call for auditability.
- `ai_parse_status` is one of `ok | repaired | fallback` and is stored on the job.

## 11.4 Gender preference guardrail
- Allowed ONLY for `childcare` and `pickup`, and ONLY when the job involves a minor or personal care.
- For `tutoring` a gender preference is IGNORED (not stored, not used for filtering) and the parent sees:
  > "Để đảm bảo công bằng, yêu cầu giới tính không áp dụng cho việc gia sư."
- When allowed, it is a SOFT preference (score boost) by default. It becomes a hard filter only if the parent explicitly confirms a safety reason.
- Every use of a gender preference is logged for policy review.

## 11.5 Safety screening
Gemini flags:
- Requests that sexualize, endanger or isolate a child.
- Requests for medical procedures by an unqualified person.
- Requests to enter a private home overnight with no adult present.
- Hate or discriminatory language.
- Off-platform payment solicitation, e.g. "trả tiền mặt ngoài app".

Severity handling:
| Severity | Action |
|---|---|
| low | log only |
| medium | warn the parent, allow the post |
| high | block the post and create an admin review item |

A `high` flag ALWAYS blocks the post until an admin clears it. The AI never permanently bans a user by itself.

## 11.6 Scoring configuration (weights approved by the owner)
| Factor | Weight | Config key |
|---|---:|---|
| Availability fit | 25% | `W_AVAILABILITY` |
| Skills / major match | 20% | `W_SKILLS` |
| Distance | 15% | `W_DISTANCE` |
| Star rating | 15% | `W_RATING` |
| Completion rate | 10% | `W_COMPLETION` |
| Hidden ELO | 10% | `W_ELO` |
| Response speed | 5% | `W_RESPONSE` |

Weights live in the DB table `MatchingWeight(active=True)` so they can be tuned without a deploy. The sum must equal 100 and this is validated on save.

Sub-score formulas:
- `availability_fit` = covered_slots / required_slots x 100. Must be 100 to pass the hard filter, so in practice it is always 100 for scored candidates.
- `skills` = 60 x jaccard(required_skills, cp_skills) + 40 x major_match_bonus, where the bonus is 1 if the CarePartner's major maps to the job_type.
- `distance` = max(0, 100 - (km / max_radius_km) x 100). km = min(home_distance, school_distance). If `has_vehicle` is true, effective km x 0.75.
- `rating` = rating / 5 x 100. If `review_count < 3`, blend: (rating/5 x 100) x 0.6 + 60 x 0.4, so newcomers are not punished.
- `completion` = completed / (completed + cancelled + no_show) x 100. Newcomers get 70, slightly above neutral so they can land a first job.
- `elo` = clamp((effective_elo - 650) / (1450 - 650) x 100, 0, 120), see Step 6.
- `response` = percentage of bookings acknowledged within the 15 min SLA x 100. Newcomers get 60.

Final score = sum(weight_i x subscore_i) / 100 x band_multiplier (Step 6). Round to an integer 0-100.

`match_level` mapping: >= 85 very_high | 70-84 high | 55-69 medium | below 55 low. `low` is only shown when the pool has fewer than 8 candidates.

## 11.7 Cost and latency control
- Extraction call: `temperature 0.1`, `max_output_tokens 1200`, timeout 8s, 1 retry.
- Semantic re-ranking and "why recommended" are BATCHED into ONE call for all top-20 candidates, never 20 separate calls.
- Cache extraction by `(job_id, updated_at)`; never re-parse an unchanged job.
- Review summarization is cached per CarePartner and recomputed at most every 24h or after 5 new reviews.
- A per-day token counter acts as a budget guard. When exceeded, the system degrades to rule-based matching and alerts the owner. **Matching must never be fully blocked by an AI outage.**

## 11.8 Prompt management
```python
class PromptTemplate(models.Model):
    key = CharField()
    version = CharField()
    body = TextField()
    variables = JSONField(default=list)
    model = CharField()
    temperature = FloatField(default=0.1)
    max_output_tokens = IntegerField(default=1200)
    is_active = BooleanField(default=True)
    class Meta:
        constraints = [UniqueConstraint(fields=["key", "version"], name="uniq_prompt_key_version")]

class AiCallLog(models.Model):
    id = UUIDField(primary_key=True)
    prompt_key = CharField()
    prompt_version = CharField()
    model = CharField()
    tokens_in = IntegerField(default=0)
    tokens_out = IntegerField(default=0)
    latency_ms = IntegerField(default=0)
    status = CharField()                 # ok | repaired | fallback | error
    created_at = DateTimeField(auto_now_add=True)
```
- Code references `key` only. Changing a prompt is a DB change, not a deploy.
- Request and response bodies are stored ONLY when `needs_admin_review = true`, for privacy and cost.

## Acceptance Criteria
1. All extraction uses structured output with schema validation; a malformed response triggers one repair retry and then the rule-based fallback.
2. `ai_parse_status` is stored on the job as `ok | repaired | fallback`.
3. Fields with confidence below 0.6 generate clarification questions shown to the parent.
4. The AI never overrides the parent's explicit `job_type`.
5. A gender preference is ignored for tutoring and logged whenever it is used elsewhere.
6. A `high` safety flag blocks the post and creates an admin review item.
7. Weights are DB-configurable and must sum to 100.
8. Newcomers receive the documented neutral defaults and are never excluded for having no history.
9. Semantic re-ranking only reorders the rule-based top-20; it never adds or removes candidates.
10. When Gemini is unreachable, matching still returns a correct ranked list through the fallback path.
11. Every AI call writes an `AiCallLog` row with token counts and latency.
12. The daily token budget guard degrades gracefully and sends an alert.

## Testing Checklist
- Post "Cần bạn nữ đưa đón bé gái lớp 1 từ trường về nhà vào 16h30 hằng ngày" -> job_type pickup, gender_preference female, safety_flags include child_involved, recurrence daily, sensitivity medium.
- Post a tutoring job containing "chỉ nhận nữ" -> gender_preference null and the fairness notice is shown.
- Post a vague description such as "cần người giúp" -> at least 1 clarification question and a low-confidence field.
- Post abusive or off-platform-payment text -> `high` flag, post blocked, admin item created.
- Mock a malformed JSON response -> repair retry -> fallback parser used, the job is still matchable.
- Change `W_DISTANCE` from 15 to 25 in the DB -> ranking changes without a redeploy.
- Save weights summing to 99 -> rejected.
- Mock a Gemini 503 -> matching returns fallback results, `AiCallLog.status = error`, alert fired.
- Seed a newcomer with 0 jobs and 0 reviews -> appears with completion 70 and a blended rating, not excluded.
- Seed 25 candidates -> verify exactly ONE batched AI call for re-ranking.
- Verify the "why recommended" sentence is Vietnamese and at most 120 characters.
- Re-parse an unchanged job twice -> the second call is served from cache with tokens_out = 0.
