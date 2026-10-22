# RAVEN Integration Specification

## 1. Overview
RAVEN is an offline, local-first academic reflection assessment agent.
This integration layer (`integrations/raven/`) establishes an isolated, contract-based boundary so that:
1. The Reflection AI Assessment System is **100% operational** even when RAVEN is offline.
2. The deterministic scoring rules ($\text{Mark} = \text{Score} / 3$) remain strictly authoritative.
3. No local chatbot prompt or subjective hallucination can alter verified marks.

---

## 2. Architecture & Reverse-Connection Model

When the professor runs RAVEN locally on their laptop:
- The cloud backend does **not** attempt inbound connections to the professor's local IP (which is typically behind NAT/firewall).
- Instead, the local RAVEN agent connects **outbound** to a queue endpoint or runs a lightweight local tunnel/worker (`http://127.0.0.1:8010`).
- If the laptop is closed or RAVEN is offline:
  - Jobs default seamlessly to the cloud FastAPI native deterministic engine, **OR**
  - Jobs remain in a `PENDING` queue until the local worker re-establishes its connection.

---

## 3. Request & Response Contract

### Assessment Request Schema
```json
{
  "submission_id": "uuid",
  "session_id": "uuid",
  "student_usn": "1RV21CS001",
  "reflection_text": "Extracted reflection body (max 500 characters)",
  "candidate_reference_ids": ["ref-uuid-1", "ref-uuid-2"],
  "candidate_keywords": {
    "ref-uuid-1": ["optimization", "gradient", "backprop", ...],
    "ref-uuid-2": ["neural", "layer", "weights", ...]
  },
  "idempotency_key": "sub-uuid-attempt-1"
}
```

### Assessment Response Schema
```json
{
  "submission_id": "uuid",
  "selected_reference_id": "ref-uuid-1",
  "similarity_score": 0.684,
  "matched_keywords": ["optimization", "gradient", "weights"],
  "reference_score": 3,
  "calculated_mark": 1.00,
  "qualifies": true,
  "status": "COMPLETED",
  "evaluated_at": "2026-10-22T22:00:00Z",
  "execution_time_ms": 142,
  "worker_node_id": "raven-local-node"
}
```
