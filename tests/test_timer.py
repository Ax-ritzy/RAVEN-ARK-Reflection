import unittest
from datetime import datetime, timezone, timedelta

def compute_timer_state(expires_at_iso: str | None, now_dt: datetime | None = None):
    if not expires_at_iso:
        return None
    try:
        expires_at = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00"))
    except Exception:
        return None
        
    now = now_dt or datetime.now(timezone.utc)
    diff_sec = (expires_at - now).total_seconds()
    
    if diff_sec <= 0:
        return {
            "is_expired": True,
            "remaining_ms": 0,
            "formatted": "00:00",
            "urgency": "critical"
        }
        
    hours = int(diff_sec // 3600)
    minutes = int((diff_sec % 3600) // 60)
    seconds = int(diff_sec % 60)
    
    if hours > 0:
        formatted = f"{hours}h {minutes:02d}m {seconds:02d}s"
    else:
        formatted = f"{minutes:02d}m {seconds:02d}s"
        
    if diff_sec < 60:
        urgency = "critical"
    elif diff_sec < 300:
        urgency = "warning"
    else:
        urgency = "normal"
        
    return {
        "is_expired": False,
        "remaining_sec": diff_sec,
        "formatted": formatted,
        "urgency": urgency
    }

class TestSessionTimer(unittest.TestCase):
    def test_null_expires_at(self):
        self.assertIsNone(compute_timer_state(None))
        self.assertIsNone(compute_timer_state(""))

    def test_past_time_is_expired(self):
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        state = compute_timer_state(past)
        self.assertTrue(state["is_expired"])
        self.assertEqual(state["formatted"], "00:00")
        self.assertEqual(state["urgency"], "critical")

    def test_critical_urgency_under_1_min(self):
        now = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
        target = (now + timedelta(seconds=45)).isoformat()
        state = compute_timer_state(target, now_dt=now)
        self.assertFalse(state["is_expired"])
        self.assertEqual(state["urgency"], "critical")
        self.assertEqual(state["formatted"], "00m 45s")

    def test_warning_urgency_between_1_and_5_mins(self):
        now = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
        target = (now + timedelta(minutes=3, seconds=15)).isoformat()
        state = compute_timer_state(target, now_dt=now)
        self.assertFalse(state["is_expired"])
        self.assertEqual(state["urgency"], "warning")
        self.assertEqual(state["formatted"], "03m 15s")

    def test_normal_urgency_over_5_mins(self):
        now = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
        target = (now + timedelta(minutes=45)).isoformat()
        state = compute_timer_state(target, now_dt=now)
        self.assertFalse(state["is_expired"])
        self.assertEqual(state["urgency"], "normal")
        self.assertEqual(state["formatted"], "45m 00s")

    def test_hours_format(self):
        now = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
        target = (now + timedelta(hours=2, minutes=15, seconds=30)).isoformat()
        state = compute_timer_state(target, now_dt=now)
        self.assertFalse(state["is_expired"])
        self.assertEqual(state["urgency"], "normal")
        self.assertEqual(state["formatted"], "2h 15m 30s")

if __name__ == "__main__":
    unittest.main()
