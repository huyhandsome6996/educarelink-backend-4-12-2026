# Flow 1 - Step 12: State Machines (JobPost + Booking)

Approved status sets. Enum values in code are English snake_case; the UI always shows the Vietnamese label.

## 12.1 JobPost states (bài đăng của phụ huynh)
| Enum | Vietnamese label | Meaning |
|---|---|---|
| `draft` | Bản nháp | The parent is filling the form; invisible to everyone else |
| `published` | Đã đăng | Submitted and visible |
| `ai_parsing` | AI đang phân tích | Gemini extraction is running |
| `ai_parsed` | Đã phân tích xong | JobRequirement is ready |
| `ai_failed` | Cần kiểm tra lại | Both AI and fallback failed; the parent must confirm the fields |
| `needs_admin_review` | Đang chờ kiểm duyệt | A high safety flag was raised |
| `matching` | Đang tìm CarePartner | The candidate list has been generated |
| `carepartner_selected` | Đã chọn CarePartner | At least one booking is awaiting_commitment or committed |
| `needs_replacement` | Cần người thay thế | The selected CarePartner cancelled |
| `in_progress` | Đang thực hiện | A booking is in_progress |
| `completed` | Hoàn thành | All slots are done and reviewed |
| `cancelled_by_parent` | Đã hủy | The parent withdrew the job |
| `expired` | Hết hạn | The start date passed with no successful booking |

### JobPost transitions
| From | To | Actor | Trigger | Side effects |
|---|---|---|---|---|
| draft | published | parent | submit | validate all Step 1 fields |
| published | ai_parsing | system | automatic | enqueue the Gemini call |
| ai_parsing | ai_parsed | system | AI ok | create JobSlots |
| ai_parsing | ai_failed | system | AI and fallback both failed | notify the parent to confirm |
| ai_failed | ai_parsed | parent | confirms the fields | create JobSlots |
| published or ai_parsed | needs_admin_review | system | safety severity high | notify admin |
| needs_admin_review | ai_parsed | admin | approve | continue |
| needs_admin_review | cancelled_by_parent | admin | reject | notify the parent with the reason |
| ai_parsed | matching | system | automatic | run Step 2 |
| matching | carepartner_selected | parent | select | create Booking + hard lock (Step 10) |
| carepartner_selected | needs_replacement | system | booking cancelled at T1-T6 | unlock, re-match, notify, compensate |
| needs_replacement | carepartner_selected | parent or system | select a replacement | new Booking |
| needs_replacement | matching | system | pool empty | retry every 30 min for 6h, then alert admin |
| carepartner_selected | in_progress | system | slot started | reminder notifications |
| in_progress | completed | system | all slots done and reviewed | release locks, apply ELO rewards |
| any state before in_progress | cancelled_by_parent | parent | withdraw | release locks, notify the CarePartner, Step 7.7 |
| matching or needs_replacement | expired | system | start date passed | notify the parent |

## 12.2 Booking states (mối ghép phụ huynh <-> CarePartner)
| Enum | Vietnamese label | Meaning |
|---|---|---|
| `proposed` | Được đề xuất | In the candidate list, not chosen |
| `not_selected` | Không được chọn | The parent chose someone else |
| `awaiting_commitment` | Chờ cam kết | Chosen; the commitment window is running (Step 5) |
| `committed` | Đã cam kết | The window passed or the job was too urgent; attendance is required |
| `reschedule_requested` | Đang xin đổi giờ | Waiting for the parent's answer (Step 9) |
| `in_progress` | Đang thực hiện | The slot has started |
| `awaiting_review` | Chờ đánh giá | The slot ended, reviews are pending |
| `completed` | Hoàn thành | Done and reviewed |
| `declined_in_window` | Đã từ chối trong thời hạn | Tier T0 |
| `cancelled_by_carepartner` | CarePartner đã hủy | Tiers T1-T4 |
| `suspected_no_show` | Nghi ngờ không đến | start + 15 min with no start, waiting for the parent |
| `no_show` | Không đến làm | T5 confirmed |
| `no_show_unconfirmed` | Chưa xác nhận không đến | The parent never answered; T4 applied, admin flagged |
| `cancelled_by_parent` | Phụ huynh đã hủy | Step 7.7 |
| `expired_no_response` | Hết hạn phản hồi | Reschedule expired and the CarePartner stayed idle -> auto-cancel |
| `disputed` | Có tranh chấp | Either side reported; an admin is reviewing |

### Booking transitions
| From | To | Actor | Trigger | Side effects |
|---|---|---|---|---|
| proposed | awaiting_commitment | parent | select | hard-lock all slots, critical notification with sound, start the window |
| proposed | not_selected | system | another candidate was selected | none |
| awaiting_commitment | committed | system | window expired | notify both sides |
| awaiting_commitment | committed | system | window was 0 (urgent job) | immediate |
| awaiting_commitment | declined_in_window | CarePartner | cancel inside the window | T0, unlock, notify the parent, replacement |
| awaiting_commitment | reschedule_requested | CarePartner | request a change | critical notification to the parent |
| committed | reschedule_requested | CarePartner | request a change | max 2 per booking |
| reschedule_requested | committed | parent | approve | re-lock the new slots, ELO +1 |
| reschedule_requested | committed | parent | decline and the CP continues | none |
| reschedule_requested | expired_no_response | system | deadline + 30 min idle | auto-cancel at the current tier |
| reschedule_requested | cancelled_by_carepartner | CarePartner | chooses to cancel | tier by lead time |
| committed | in_progress | CarePartner or system | start tapped, or start + 15 min | none |
| committed | suspected_no_show | system | start + 15 min and never started | ask the parent to confirm |
| suspected_no_show | in_progress | parent | answers "Đã đến" | resume normally |
| suspected_no_show | no_show | parent | answers "Không đến" | T5, compensation, replacement, admin alert |
| suspected_no_show | no_show_unconfirmed | system | the parent is silent for 24h | T4 only, admin flag |
| committed | cancelled_by_carepartner | CarePartner | cancel | T1-T4 by lead time, compensation, unlock, replacement |
| in_progress | awaiting_review | system | end time reached | prompt both sides for reviews |
| awaiting_review | completed | system | reviews submitted, or auto at +24h | ELO rewards, completion stats |
| any active state | cancelled_by_parent | parent | withdraw | Step 7.7, CarePartner ELO +5 or +10 |
| any active state | disputed | either side | report | freeze ELO effects until an admin decides |
| disputed | completed, no_show or cancelled_* | admin | resolution | apply or reverse penalties |

## 12.3 Global rules
1. Any transition not listed above raises `InvalidTransition` and returns HTTP 409. Never silently ignore it.
2. Every transition writes `StateTransitionLog(entity, entity_id, from_status, to_status, actor, reason, created_at)`.
3. Every transition with a financial or punitive effect is idempotent per (booking, reason_code).
4. Status changes happen inside the same DB transaction as their side effects: locks, ELO, compensation, notification enqueue.
5. Notifications are ENQUEUED inside the transaction and SENT on `transaction.on_commit`. Never send a push for a rolled-back state.
6. Clients never set a status directly; only actions and endpoints can.
7. `disputed` freezes all further ELO changes on that booking until an admin resolves it.
8. Every enum value must have a Vietnamese label in a single translation map; raw enums must never leak into the UI.

## 12.4 Data model
```python
class StateTransitionLog(models.Model):
    id = UUIDField(primary_key=True)
    entity = CharField()                    # job_post | booking
    entity_id = UUIDField()
    from_status = CharField()
    to_status = CharField()
    actor = CharField()                     # parent | carepartner | system | admin
    actor_user = FK(User, null=True)
    reason = CharField(blank=True)
    created_at = DateTimeField(auto_now_add=True)
    class Meta:
        indexes = [Index(fields=["entity", "entity_id", "created_at"])]
```

## Acceptance Criteria
1. Only the transitions in the tables above are possible; everything else returns 409.
2. Every transition produces exactly one `StateTransitionLog` row.
3. Side effects are atomic with the transition: killing the process mid-transaction leaves no partial state.
4. Notifications are sent only after commit.
5. A penalty and compensation for one booking plus reason are applied at most once.
6. The UI shows the correct Vietnamese label for every enum; no raw enum value is visible to users.
7. `expired`, `suspected_no_show` and `no_show_unconfirmed` are driven by beat tasks that are safe to re-run.
8. The transition tables are the single source of truth and are implemented as a data-driven map, not scattered if-statements.

## Testing Checklist
- Walk the happy path: draft -> published -> ai_parsing -> ai_parsed -> matching -> carepartner_selected -> in_progress -> completed. Verify one log row per hop.
- Try draft -> completed directly -> 409.
- Cancel inside the window -> `declined_in_window`, T0, parent notified, replacement started.
- Let the window expire -> `committed` with both notifications sent once.
- start + 15 min without starting -> `suspected_no_show`; the parent answers "Không đến" -> `no_show`, T5, compensation, replacement.
- The parent stays silent for 24h -> `no_show_unconfirmed`, T4 only.
- Reschedule approved -> slots re-locked, status back to `committed`, ELO +1.
- Reschedule expired plus 30 min idle -> `expired_no_response` with the correct tier.
- Open a dispute -> a later completion does NOT apply ELO until an admin resolves it.
- Send the same cancel request twice -> one penalty, one compensation, one notification.
- Mock an exception after enqueue -> verify no push was sent for the rolled-back state.
- Run the beat task twice in a row -> no duplicate transitions.
