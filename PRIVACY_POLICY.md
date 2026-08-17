# Privacy Policy for ListSafe - Etsy IP & Trademark Infringement Guard

**Last Updated**: August 17, 2026  
**Effective Date**: August 17, 2026  

Thank you for choosing **ListSafe - Etsy IP & Trademark Infringement Guard** ("ListSafe", "we", "our", or "us"). We are committed to protecting your privacy and ensuring you have a secure experience when using our Chrome extension.

This Privacy Policy explains how ListSafe handles information and outlines our strict commitment to user privacy and data security in compliance with the **Google Chrome Web Store Developer Program Policies** and international privacy standards (including GDPR and CCPA).

---

## 1. Single Purpose & Core Functionality
ListSafe is designed solely to provide real-time trademark risk detection, safe keyword suggestions, character counting, and compliance checks for e-commerce listing editors (such as Etsy, Shopify, and Amazon). 

All core detection logic runs **100% locally on your device**.

---

## 2. Information We DO NOT Collect
ListSafe adheres to a strict "Privacy by Design" approach. We do **NOT** collect, store, sell, or transmit any of the following:
- ❌ **No Personal Identifiable Information (PII)**: We do not collect your name, email address, physical address, phone number, or government IDs.
- ❌ **No Listing Data or Intellectual Property**: Your listing titles, descriptions, draft tags, pricing strategies, or search keywords are NEVER sent to our servers or third-party servers. All scanning happens in-memory on your local browser instance.
- ❌ **No Keystroke Logging**: ListSafe inspects inputs only to match against our offline trademark database and never logs or exports your keystrokes.
- ❌ **No Financial or Banking Information**: Payment and subscription transactions for ListSafe Pro are processed externally by PCI-DSS compliant payment gateways (e.g., Stripe / Lemon Squeezy / Waffo). We never have access to your credit card or billing details.
- ❌ **No Browsing History or Tracking**: We do not track your browsing habits, visit logs, or external website activities.

---

## 3. Information Stored Locally on Your Device
ListSafe utilizes Google Chrome's local storage API (`chrome.storage.local` / `chrome.storage.sync`) solely to persist your local user preferences:
- **Local User Settings**: Language selection (e.g., English, Chinese, German), custom whitelisted trademark words, and auto-scan toggle preferences.
- **License Status**: Local cache of your Pro activation status / license key token to avoid repeated validation requests.
- **Aggregated Offline Stats**: Counters for listings scanned and high-risk terms blocked (stored strictly within your local browser storage and never uploaded).

---

## 4. Permissions & Justification
ListSafe requests only the minimum permissions required to perform its declared functions:
- `storage`: Required to save your whitelisted terms and UI preference settings locally.
- `activeTab` & `scripting`: Required to scan and highlight trademark risks within the active listing editor tab when opened by the user.
- `host_permissions` (`https://*.etsy.com/*`, `https://*.shopify.com/*`, etc.): Restricts the extension's execution scope exclusively to supported e-commerce listing management URLs.

---

## 5. Third-Party Services & Data Sharing
We do **NOT** sell, rent, trade, or transfer any user data to third parties, data brokers, advertising networks, or analytics providers.

When activating a Pro License, the extension may communicate with our license verification API endpoint solely to validate the cryptographic authenticity of the provided license key. No personal identifying information or listing content is transmitted during this request.

---

## 6. Data Retention & Deletion
Because ListSafe does not store your personal data on remote servers, your configuration data resides exclusively on your local machine. You can erase all local data at any time by:
1. Clearing the extension data in Chrome settings, or
2. Right-clicking the ListSafe extension icon and selecting **"Remove from Chrome"**.

---

## 7. Compliance with Google Chrome Web Store Policies
- ListSafe does **NOT** contain malicious code, spyware, or adware.
- ListSafe does **NOT** engage in unauthorized data scraping.
- ListSafe strictly complies with the **Google Chrome Web Store User Data Policy**, including the Limited Use requirements.

---

## 8. Changes to This Privacy Policy
We may update this Privacy Policy periodically to reflect enhancements to ListSafe or changes in legal regulations. Any revisions will be updated on this page with an updated "Last Updated" date.

---

## 9. Contact Us
If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us:

- **Developer / Organization**: ListSafe Security & Compliance Team
- **Email**: support@listsafe.dev
- **Repository**: [https://github.com/huangzhenye2025-maker/ListSafe](https://github.com/huangzhenye2025-maker/ListSafe)
