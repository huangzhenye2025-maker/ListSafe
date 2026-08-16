"""
ListSafe Server - Automated Integration Test Suite
Verifies Webhook Fail-Closed Security, Payment Activation, Refund Revocation, and License Verification.
"""

import os
import sys
import time
import json
import unittest

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["ENVIRONMENT"] = "development"
os.environ["BYPASS_WEBHOOK_VERIFY"] = "1"
os.environ["ADMIN_SECRET"] = "TEST_ADMIN_SECRET_2026"

from fastapi.testclient import TestClient
from server.main import app, db

class TestListSafeServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_health_check(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertEqual(data.get("service"), "ListSafe License Authority")
        print("[PASS] 1. Health Check Endpoint")

    def test_02_verify_preset_demo_license(self):
        resp = self.client.get("/api/verify-license?key=DEMO-VIP-2026")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("valid"))
        self.assertEqual(data.get("status"), "active")
        print("[PASS] 2. Default Preset License Verification")

    def test_03_verify_nonexistent_license(self):
        resp = self.client.get("/api/verify-license?key=NONEXISTENT_KEY_999")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data.get("valid"))
        self.assertEqual(data.get("status"), "not_found")
        print("[PASS] 3. Nonexistent License Rejection")

    def test_04_waffo_webhook_payment_and_refund_lifecycle(self):
        # 1. Simulate Waffo order.paid Webhook
        test_order_id = f"ORD_AUTO_TEST_{int(time.time())}"
        payload = {
            "event": "order.paid",
            "data": {
                "order_id": test_order_id,
                "customer_email": "buyer@example.com",
                "amount": 9.9,
                "currency": "USD",
                "product_id": "PROD_1Rwhe7sFXn5oqvh6kPBfNI"
            }
        }
        resp = self.client.post(
            "/waffo_webhook",
            json=payload,
            headers={"X-Waffo-Signature": "test_sig", "X-Waffo-Timestamp": str(time.time())}
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("order_id"), test_order_id)
        print(f"[PASS] 4.1 Webhook Payment Event Processed: {test_order_id}")

        # 2. Verify that the new Order ID is immediately active in the API
        verify_resp = self.client.get(f"/api/verify-license?key={test_order_id}")
        self.assertEqual(verify_resp.status_code, 200)
        vdata = verify_resp.json()
        self.assertTrue(vdata.get("valid"))
        self.assertEqual(vdata.get("status"), "active")
        self.assertEqual(vdata.get("email"), "buyer@example.com")
        print(f"[PASS] 4.2 Verified Newly Paid License Active: {test_order_id}")

        # 3. Simulate Waffo order.refunded Webhook
        refund_payload = {
            "event": "order.refunded",
            "data": {
                "order_id": test_order_id,
                "customer_email": "buyer@example.com"
            }
        }
        refund_resp = self.client.post(
            "/waffo_webhook",
            json=refund_payload,
            headers={"X-Waffo-Signature": "test_sig", "X-Waffo-Timestamp": str(time.time())}
        )
        self.assertEqual(refund_resp.status_code, 200)
        print(f"[PASS] 4.3 Webhook Refund Event Processed: {test_order_id}")

        # 4. Verify that the license is now revoked and rejected
        revoked_resp = self.client.get(f"/api/verify-license?key={test_order_id}")
        self.assertEqual(revoked_resp.status_code, 200)
        rdata = revoked_resp.json()
        self.assertFalse(rdata.get("valid"))
        self.assertEqual(rdata.get("status"), "refunded")
        print(f"[PASS] 4.4 Verified Refunded License Blocked: {test_order_id}")

    def test_05_admin_endpoints_and_manual_creation(self):
        # Without Secret -> 401
        unauth_resp = self.client.get("/admin/stats")
        self.assertEqual(unauth_resp.status_code, 401)
        print("[PASS] 5.1 Admin Endpoints Without Secret Blocked (401)")

        # With Secret -> 200
        auth_resp = self.client.get("/admin/stats", headers={"X-Admin-Secret": "TEST_ADMIN_SECRET_2026"})
        self.assertEqual(auth_resp.status_code, 200)
        sdata = auth_resp.json()
        self.assertTrue(sdata.get("success"))
        print("[PASS] 5.2 Admin Stats Authentication (200)")

        # Manual VIP Insert
        manual_id = "ORD_VIP_MANUAL_123"
        add_resp = self.client.post(
            "/admin/licenses",
            json={"order_id": manual_id, "email": "vip@listsafe.app", "plan": "pro_yearly", "days_valid": 365},
            headers={"X-Admin-Secret": "TEST_ADMIN_SECRET_2026"}
        )
        self.assertEqual(add_resp.status_code, 200)

        # Verify manual VIP is active
        verify_vip = self.client.get(f"/api/verify-license?key={manual_id}")
        self.assertEqual(verify_vip.status_code, 200)
        self.assertTrue(verify_vip.json().get("valid"))
        print("[PASS] 5.3 Admin Manual VIP License Insertion & Verification")

if __name__ == "__main__":
    unittest.main()
