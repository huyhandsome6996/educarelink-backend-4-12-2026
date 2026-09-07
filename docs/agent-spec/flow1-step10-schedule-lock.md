# Flow 1 - Step 10: Schedule Locking

## Core Rules

### Rule 1: Soft Lock
- 5-minute temporary hold

### Rule 2: Hard Lock
- Database constraint prevents overlapping

### Rule 3: Buffer (NEW)
- 90-minute gap between consecutive jobs
- Job A: 18:00-19:00
- Job B: 19:30-20:30 [FAIL]
- Job B: 20:30-21:30 [PASS]

## Implementation

Backend validation:
```python
def validate_buffer(carepartner_id, new_date, new_time_from):
    # Check 90-min gap from previous job
    # Return True if OK, False if buffer too short
```

## Testing Checklist
- Book 18:00-19:00, try 19:30 -> FAIL
- Book 18:00-19:00, try 20:30 -> PASS

Last Updated: 2026-09-07