"""
ListSafe Server - Database & License Ledger Layer
Dual-mode persistence: MongoDB Atlas in Production, local JSON file fallback in Development.
"""

import os
import json
import time
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger("listsafe.database")

class LicenseDatabase:
    def __init__(self):
        self.mongodb_uri = os.getenv("MONGODB_URI")
        self.client = None
        self.db = None
        self.collection = None
        self.is_mongodb = False

        self.local_file_path = os.path.join(os.path.dirname(__file__), "data", "licenses.json")
        self._init_db()

    def _init_db(self):
        if self.mongodb_uri and "mongodb" in self.mongodb_uri:
            try:
                from pymongo import MongoClient
                self.client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
                # Test connection
                self.client.admin.command('ping')
                self.db = self.client.get_database("listsafe_db")
                self.collection = self.db.get_collection("licenses")
                self.is_mongodb = True
                logger.info("Successfully connected to MongoDB Atlas (listsafe_db.licenses).")
                return
            except Exception as e:
                logger.warning(f"MongoDB connection failed, falling back to local JSON: {e}")
                self.is_mongodb = False

        # Fallback to local JSON
        os.makedirs(os.path.dirname(self.local_file_path), exist_ok=True)
        if not os.path.exists(self.local_file_path):
            initial_data = {
                "DEMO-VIP-2026": {
                    "_id": "DEMO-VIP-2026",
                    "order_id": "DEMO-VIP-2026",
                    "email": "demo@listsafe.app",
                    "status": "active",
                    "plan": "pro_lifetime",
                    "created_at": time.time(),
                    "expires_at": time.time() + 10 * 365 * 86400,
                    "event": "manual_add"
                },
                "ETSY-SAFE-PRO": {
                    "_id": "ETSY-SAFE-PRO",
                    "order_id": "ETSY-SAFE-PRO",
                    "email": "pro@listsafe.app",
                    "status": "active",
                    "plan": "pro_lifetime",
                    "created_at": time.time(),
                    "expires_at": time.time() + 10 * 365 * 86400,
                    "event": "manual_add"
                }
            }
            with open(self.local_file_path, 'w', encoding='utf-8') as f:
                json.dump(initial_data, f, indent=2)
        logger.info(f"Using local JSON database fallback at {self.local_file_path}")

    def _read_local(self) -> Dict[str, Any]:
        try:
            with open(self.local_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    def _write_local(self, data: Dict[str, Any]):
        with open(self.local_file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def get_license(self, key_or_order_id: str) -> Optional[Dict[str, Any]]:
        """
        Query license by Order ID, Subscription ID, or License Key.
        """
        if not key_or_order_id:
            return None
        key = key_or_order_id.strip()

        if self.is_mongodb and self.collection is not None:
            try:
                # Query by _id, order_id, or license_key (case-insensitive where applicable)
                doc = self.collection.find_one({
                    "$or": [
                        {"_id": key},
                        {"order_id": key},
                        {"order_id": {"$regex": f"^{key}$", "$options": "i"}},
                        {"license_key": key}
                    ]
                })
                return doc
            except Exception as e:
                logger.error(f"MongoDB query error: {e}")

        # Local JSON fallback
        local_db = self._read_local()
        for k, v in local_db.items():
            if k.lower() == key.lower() or v.get("order_id", "").lower() == key.lower() or v.get("license_key", "").lower() == key.lower():
                return v
        return None

    def save_or_update_license(self, order_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Upsert a paid order or subscription license.
        """
        now = time.time()
        record = {
            "_id": order_id,
            "order_id": order_id,
            "email": payload.get("email", ""),
            "product_id": payload.get("product_id", "PROD_1Rwhe7sFXn5oqvh6kPBfNI"),
            "status": payload.get("status", "active"),
            "plan": payload.get("plan", "pro_monthly"),
            "amount": payload.get("amount", 9.9),
            "currency": payload.get("currency", "USD"),
            "created_at": payload.get("created_at", now),
            "updated_at": now,
            "expires_at": payload.get("expires_at", now + 365 * 86400),
            "event": payload.get("event", "order.paid")
        }

        if self.is_mongodb and self.collection is not None:
            try:
                self.collection.update_one(
                    {"_id": order_id},
                    {"$set": record},
                    upsert=True
                )
                logger.info(f"MongoDB: Upserted license {order_id} (Status: {record['status']})")
                return record
            except Exception as e:
                logger.error(f"MongoDB upsert error: {e}")

        # Local fallback
        local_db = self._read_local()
        local_db[order_id] = record
        self._write_local(local_db)
        logger.info(f"Local DB: Upserted license {order_id} (Status: {record['status']})")
        return record

    def revoke_license(self, order_id: str, reason: str = "refunded") -> bool:
        """
        Mark a license as refunded / canceled.
        """
        now = time.time()
        if self.is_mongodb and self.collection is not None:
            try:
                result = self.collection.update_one(
                    {"$or": [{"_id": order_id}, {"order_id": order_id}]},
                    {"$set": {"status": reason, "updated_at": now, "revoke_reason": reason}}
                )
                logger.info(f"MongoDB: Revoked license {order_id} -> {reason}")
                return result.modified_count > 0
            except Exception as e:
                logger.error(f"MongoDB revoke error: {e}")

        local_db = self._read_local()
        found = False
        for k, v in local_db.items():
            if k.lower() == order_id.lower() or v.get("order_id", "").lower() == order_id.lower():
                v["status"] = reason
                v["updated_at"] = now
                v["revoke_reason"] = reason
                found = True
        if found:
            self._write_local(local_db)
            logger.info(f"Local DB: Revoked license {order_id} -> {reason}")
            return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        """
        Summary statistics for admin dashboard.
        """
        if self.is_mongodb and self.collection is not None:
            try:
                total = self.collection.count_documents({})
                active = self.collection.count_documents({"status": "active"})
                refunded = self.collection.count_documents({"status": "refunded"})
                return {
                    "mode": "mongodb_atlas",
                    "total_licenses": total,
                    "active_pro_users": active,
                    "refunded_users": refunded
                }
            except Exception as e:
                logger.error(f"MongoDB stats error: {e}")

        local_db = self._read_local()
        total = len(local_db)
        active = sum(1 for v in local_db.values() if v.get("status") == "active")
        refunded = sum(1 for v in local_db.values() if v.get("status") == "refunded")
        return {
            "mode": "local_json",
            "total_licenses": total,
            "active_pro_users": active,
            "refunded_users": refunded
        }

    def list_all_licenses(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List licenses for admin viewing.
        """
        if self.is_mongodb and self.collection is not None:
            try:
                cursor = self.collection.find({}).sort("created_at", -1).limit(limit)
                docs = []
                for d in cursor:
                    d["_id"] = str(d["_id"])
                    docs.append(d)
                return docs
            except Exception as e:
                logger.error(f"MongoDB list error: {e}")

        local_db = self._read_local()
        return list(local_db.values())[:limit]
