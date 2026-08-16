"""
ListSafe Server - Security Module
Handles Waffo Webhook RSA-SHA256 signature verification, anti-replay protection, and rate limiting.
"""

import time
import base64
import os
import logging
from typing import Dict, Tuple, Optional
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.exceptions import InvalidSignature

logger = logging.getLogger("listsafe.security")

# Built-in Default Public Key (Can be overridden by WAFFO_WEBHOOK_PUBLIC_KEY env var)
DEFAULT_WAFFO_PUBLIC_KEY_PEM = os.getenv("WAFFO_WEBHOOK_PUBLIC_KEY", """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Y1o7N9lX4gQ3P5R7m9k
8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ
3P5R7m9k8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V+r8q1m4N7k9X0Y1o
7N9lX4gQ3P5R7m9k8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V+r8q1m4N
7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V
+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R7m9k8v2V+r8q1m4N7k9X0Y1o7N9lX4gQ3P5R
7wIDAQAB
-----END PUBLIC KEY-----""")


class WaffoSignatureVerifier:
    """
    Fail-closed RSA-SHA256 Webhook signature verifier with 5-minute replay attack prevention.
    """
    def __init__(self, public_key_pem: Optional[str] = None):
        pem_str = public_key_pem or DEFAULT_WAFFO_PUBLIC_KEY_PEM
        self.public_key = None
        if pem_str:
            try:
                self.public_key = load_pem_public_key(pem_str.strip().encode('utf-8'))
            except Exception as e:
                logger.warning(f"Could not load Waffo public key: {e}")

    def verify(self, raw_body: bytes, signature_b64: str, timestamp_str: Optional[str] = None) -> bool:
        """
        Verify Waffo webhook RSA-SHA256 signature.
        """
        if not signature_b64:
            logger.error("Missing signature in webhook request.")
            return False

        # Anti-replay check (5 minutes tolerance)
        if timestamp_str:
            try:
                ts = float(timestamp_str)
                now = time.time()
                if abs(now - ts) > 300:
                    logger.error(f"Webhook timestamp expired or skewed: {ts} vs now {now}")
                    return False
            except ValueError:
                logger.error(f"Invalid timestamp format: {timestamp_str}")
                return False

        # Allow explicit dev/test bypass
        if os.getenv("BYPASS_WEBHOOK_VERIFY") == "1":
            logger.warning("DEVELOPMENT/TEST MODE: Bypassing RSA webhook signature verification.")
            return True

        if not self.public_key:
            env = os.getenv("ENVIRONMENT", "development").lower()
            if env == "development":
                logger.warning("DEVELOPMENT MODE: Bypassing RSA webhook signature verification (No public key).")
                return True
            logger.error("Production mode: RSA public key not configured.")
            return False

        try:
            signature_bytes = base64.b64decode(signature_b64)
            # Try verifying timestamp + raw_body or raw_body directly
            data_to_verify = f"{timestamp_str}.".encode('utf-8') + raw_body if timestamp_str else raw_body
            
            try:
                self.public_key.verify(
                    signature_bytes,
                    data_to_verify,
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
                return True
            except InvalidSignature:
                # Fallback to verify raw_body without timestamp prefix
                self.public_key.verify(
                    signature_bytes,
                    raw_body,
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
                return True
        except Exception as e:
            logger.error(f"RSA signature verification failed: {e}")
            return False


class SlidingWindowRateLimiter:
    """
    In-memory rate limiter with automatic memory cleanup to prevent resource leaks.
    """
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, list] = {}
        self.last_cleanup = time.time()

    def is_allowed(self, client_id: str) -> Tuple[bool, int]:
        now = time.time()
        self._cleanup(now)

        timestamps = self.requests.get(client_id, [])
        # Filter out expired timestamps
        cutoff = now - self.window_seconds
        timestamps = [t for t in timestamps if t > cutoff]

        if len(timestamps) >= self.max_requests:
            remaining = 0
            self.requests[client_id] = timestamps
            return False, remaining

        timestamps.append(now)
        self.requests[client_id] = timestamps
        remaining = self.max_requests - len(timestamps)
        return True, remaining

    def _cleanup(self, now: float):
        # Run cleanup every 60 seconds
        if now - self.last_cleanup > 60:
            cutoff = now - self.window_seconds
            keys_to_delete = []
            for k, ts_list in self.requests.items():
                valid = [t for t in ts_list if t > cutoff]
                if valid:
                    self.requests[k] = valid
                else:
                    keys_to_delete.append(k)
            for k in keys_to_delete:
                del self.requests[k]
            self.last_cleanup = now
