"""
ListSafe Server - FastAPI Main Application
License Authority & Waffo Webhook Gatekeeper
"""

import os
import time
import json
import logging
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Header, HTTPException, Query, Depends, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from server.security import WaffoSignatureVerifier, SlidingWindowRateLimiter
from server.database import LicenseDatabase

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("listsafe.server")

# Environment settings
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Instances
db = LicenseDatabase()
verifier = WaffoSignatureVerifier(os.getenv("WAFFO_WEBHOOK_PUBLIC_KEY"))
rate_limiter = SlidingWindowRateLimiter(max_requests=20, window_seconds=60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("🛡️ ListSafe License Authority & Webhook Server Started")
    logger.info(f"Environment: {ENVIRONMENT}")
    logger.info(f"Database Mode: {'MongoDB Atlas' if db.is_mongodb else 'Local JSON Fallback'}")
    if not ADMIN_SECRET:
        logger.warning("⚠️ ADMIN_SECRET is not set! /admin endpoints will be inaccessible.")
    logger.info("=" * 60)
    yield
    logger.info("🛡️ ListSafe Server Shutdown.")


app = FastAPI(
    title="ListSafe License & Webhook Authority",
    description="Secure license verification, Waffo Webhook handler with RSA-SHA256 verification, and subscription state management.",
    version="1.0.1",
    lifespan=lifespan
)

# CORS Configuration (Restricted in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# -------------------------------------------------------------
# Pydantic Request Models
# -------------------------------------------------------------
class VerifyLicenseRequest(BaseModel):
    key: str = Field(..., description="Order ID or License Key to verify")


class ManualLicenseRequest(BaseModel):
    order_id: str
    email: Optional[str] = "manual@listsafe.app"
    plan: Optional[str] = "pro_monthly"
    status: Optional[str] = "active"
    days_valid: Optional[int] = 365


# -------------------------------------------------------------
# 1. Health Check
# -------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health_check():
    stats = db.get_stats()
    return {
        "status": "healthy",
        "service": "ListSafe License Authority",
        "version": "1.0.1",
        "database": stats.get("mode"),
        "active_users": stats.get("active_pro_users"),
        "timestamp": time.time()
    }


# -------------------------------------------------------------
# 2. Waffo Webhook Endpoint (The Gatekeeper)
# -------------------------------------------------------------
@app.post("/waffo_webhook", tags=["Webhook"])
async def waffo_webhook(
    request: Request,
    x_waffo_signature: Optional[str] = Header(None, alias="X-Waffo-Signature"),
    x_signature: Optional[str] = Header(None, alias="X-Signature"),
    x_waffo_timestamp: Optional[str] = Header(None, alias="X-Waffo-Timestamp"),
    x_timestamp: Optional[str] = Header(None, alias="X-Timestamp")
):
    """
    Receives asynchronous payment and refund notifications from Waffo.
    Enforces RSA-SHA256 signature verification (Fail-Closed).
    """
    raw_body = await request.body()
    sig = x_waffo_signature or x_signature
    ts = x_waffo_timestamp or x_timestamp

    # 1. Verify RSA-SHA256 Signature
    is_valid = verifier.verify(raw_body=raw_body, signature_b64=sig, timestamp_str=ts)
    if not is_valid:
        logger.warning(f"Unauthorized Webhook Attempt. IP: {request.client.host if request.client else 'unknown'}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing RSA-SHA256 Webhook signature."
        )

    # 2. Parse Event Payload
    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except Exception as e:
        logger.error(f"Failed to parse webhook JSON payload: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")

    event_type = payload.get("event") or payload.get("type") or "order.paid"
    data = payload.get("data") or payload

    order_id = data.get("order_id") or data.get("id") or data.get("transaction_id")
    email = data.get("customer_email") or data.get("email") or ""
    amount = data.get("amount") or 9.9
    currency = data.get("currency") or "USD"
    product_id = data.get("product_id") or "PROD_1Rwhe7sFXn5oqvh6kPBfNI"

    if not order_id:
        logger.error(f"Webhook payload missing order_id: {payload}")
        return JSONResponse(status_code=400, content={"success": False, "error": "Missing order_id"})

    logger.info(f"🔔 Received Valid Waffo Webhook: Event={event_type} | OrderID={order_id} | Email={email}")

    # 3. Process Events
    if event_type in ["order.paid", "subscription.created", "subscription.renewed", "payment.succeeded", "charge.succeeded"]:
        # Duration: Default 30 days for monthly, 365 days for annual
        is_annual = "year" in str(product_id).lower() or "annual" in str(payload).lower() or float(amount) >= 49.0
        days = 365 if is_annual else 30
        expires_at = time.time() + (days * 86400)

        record = db.save_or_update_license(
            order_id=order_id,
            payload={
                "email": email,
                "product_id": product_id,
                "status": "active",
                "plan": "pro_yearly" if is_annual else "pro_monthly",
                "amount": amount,
                "currency": currency,
                "expires_at": expires_at,
                "event": event_type
            }
        )
        return {
            "success": True,
            "message": "Order license activated successfully.",
            "order_id": order_id,
            "status": "active",
            "expires_at": expires_at
        }

    elif event_type in ["order.refunded", "subscription.canceled", "subscription.expired", "charge.refunded"]:
        db.revoke_license(order_id=order_id, reason="refunded")
        logger.info(f"🚫 License Revoked for Order ID: {order_id} due to {event_type}")
        return {
            "success": True,
            "message": f"License status updated to refunded/canceled for {order_id}.",
            "order_id": order_id,
            "status": "refunded"
        }

    else:
        logger.info(f"Ignored unhandled webhook event: {event_type}")
        return {"success": True, "message": f"Event {event_type} acknowledged."}


# -------------------------------------------------------------
# 3. License Verification Endpoint (Used by Chrome Extension)
# -------------------------------------------------------------
@app.get("/api/verify-license", tags=["License"])
@app.post("/api/verify-license", tags=["License"])
async def verify_license(
    request: Request,
    key: Optional[str] = Query(None, description="License Key or Waffo Order ID"),
    body: Optional[VerifyLicenseRequest] = None
):
    """
    Public verification endpoint called by the ListSafe Chrome Extension.
    Rate limited by client IP to prevent brute-forcing.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    allowed, remaining = rate_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a minute before retrying."
        )

    target_key = (key or (body.key if body else "") or "").strip()
    if not target_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="License Key or Order ID parameter 'key' is required."
        )

    # 1. Query Database Ledger
    doc = db.get_license(target_key)
    if not doc:
        return JSONResponse(
            status_code=200,
            content={
                "success": False,
                "valid": False,
                "status": "not_found",
                "message": "Invalid Order ID or License Key. Please check your Waffo confirmation email."
            }
        )

    # 2. Check Status and Expiration
    doc_status = doc.get("status", "unknown")
    expires_at = doc.get("expires_at", 0)
    now = time.time()

    if doc_status != "active":
        return JSONResponse(
            status_code=200,
            content={
                "success": False,
                "valid": False,
                "status": doc_status,
                "message": f"This license is currently {doc_status}. Access to Pro features is disabled."
            }
        )

    if expires_at and expires_at < now:
        return JSONResponse(
            status_code=200,
            content={
                "success": False,
                "valid": False,
                "status": "expired",
                "message": "Your Pro subscription has expired. Please renew on Waffo."
            }
        )

    # 3. Active and Valid
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "valid": True,
            "status": "active",
            "plan": doc.get("plan", "pro_monthly"),
            "order_id": doc.get("order_id", target_key),
            "email": doc.get("email", ""),
            "expires_at": expires_at,
            "message": "Pro license active and verified."
        }
    )


# -------------------------------------------------------------
# 4. Admin Management Endpoints (Protected by ADMIN_SECRET)
# -------------------------------------------------------------
def require_admin(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
    authorization: Optional[str] = Header(None)
):
    admin_secret = os.getenv("ADMIN_SECRET", "")
    provided = x_admin_secret
    if not provided and authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()

    if not admin_secret or provided != admin_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required. Invalid or missing ADMIN_SECRET."
        )


@app.get("/admin/stats", tags=["Admin"])
async def admin_stats(auth: None = Depends(require_admin)):
    """
    Get aggregated system statistics.
    """
    return {
        "success": True,
        "stats": db.get_stats(),
        "timestamp": time.time()
    }


@app.get("/admin/licenses", tags=["Admin"])
async def admin_list_licenses(
    limit: int = Query(50, le=200),
    auth: None = Depends(require_admin)
):
    """
    List registered licenses in database.
    """
    return {
        "success": True,
        "licenses": db.list_all_licenses(limit=limit)
    }


@app.post("/admin/licenses", tags=["Admin"])
async def admin_manual_add_license(
    req: ManualLicenseRequest,
    auth: None = Depends(require_admin)
):
    """
    Manually insert or update a license (e.g. manual VIP, support resolution).
    """
    expires_at = time.time() + (req.days_valid * 86400)
    record = db.save_or_update_license(
        order_id=req.order_id,
        payload={
            "email": req.email,
            "plan": req.plan,
            "status": req.status,
            "expires_at": expires_at,
            "event": "admin.manual_add"
        }
    )
    return {
        "success": True,
        "message": f"License {req.order_id} created/updated successfully.",
        "license": record
    }
