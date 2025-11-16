# ABA Worker Environment Variables

This document describes all environment variables used by the ABA Worker microservice.

## Required Variables

### `MONGO_STRING`
**Type**: String (MongoDB Connection URI)
**Required**: Yes
**Description**: MongoDB connection string for the worker database.

**Example**:
```bash
MONGO_STRING=mongodb+srv://user:password@cluster.mongodb.net/database?tls=true&authSource=admin
```

---

## Optional Core Variables

### `PORT`
**Type**: Number
**Default**: `4008`
**Description**: Port number for the worker HTTP server (health checks and metrics).

**Example**:
```bash
PORT=4008
```

### `NODE_ENV`
**Type**: String (`development` | `test` | `production`)
**Default**: `development`
**Description**: Application environment mode.

**Example**:
```bash
NODE_ENV=production
```

### `LOG_LEVEL`
**Type**: String (`error` | `warn` | `info` | `debug`)
**Default**: `info`
**Description**: Logging verbosity level.

**Example**:
```bash
LOG_LEVEL=debug
```

### `RDW_API_KEY`
**Type**: String
**Default**: None (uses mock data if not provided)
**Description**: API key for Dutch RDW (vehicle registration) API access.

**Example**:
```bash
RDW_API_KEY=your-rdw-api-key-here
```

### `RDW_BASE_URL`
**Type**: String (URL)
**Default**: None
**Description**: Base URL for the RDW API endpoint.

**Example**:
```bash
RDW_BASE_URL=https://api.rdw.nl
```

---

## Service Enable/Disable Flags

All service flags default to **`true`** (enabled) if not specified. Set to `"false"` to disable.

### `ENABLE_DOCUMENT_EXPIRY_CHECK`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Daily at 12:00 AM
**Description**: Master flag to enable/disable ALL document expiry checking. If false, all granular flags are ignored.

**What it does**:
- Master switch for quote, invoice, and purchase invoice expiry checking
- If disabled, all document expiry checks are skipped regardless of granular flags
- If enabled, you can control each document type with granular flags below

**Example**:
```bash
# Disable ALL document expiry checking
ENABLE_DOCUMENT_EXPIRY_CHECK=false
```

---

### `ENABLE_QUOTE_EXPIRY_CHECK`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Daily at 12:00 AM (only if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`)
**Description**: Enable/disable quote expiry checking specifically.

**What it does**:
- Checks for expired quotes and marks them as `EXPIRED`
- Creates notifications for expired quotes
- Only runs if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`

**Example**:
```bash
# Enable document checking but disable quote expiry
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=false
ENABLE_INVOICE_EXPIRY_CHECK=true
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=true
```

---

### `ENABLE_INVOICE_EXPIRY_CHECK`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Daily at 12:00 AM (only if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`)
**Description**: Enable/disable invoice expiry checking specifically.

**What it does**:
- Checks for expired invoices and marks them as `EXPIRED`
- Creates notifications for expired invoices
- Only runs if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`

**Example**:
```bash
# Test only invoice expiry
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=false
ENABLE_INVOICE_EXPIRY_CHECK=true
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=false
```

---

### `ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Daily at 12:00 AM (only if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`)
**Description**: Enable/disable purchase invoice expiry checking specifically.

**What it does**:
- Checks for expired purchase invoices and marks them as `EXPIRED`
- Creates notifications for expired purchase invoices
- Only runs if `ENABLE_DOCUMENT_EXPIRY_CHECK=true`

**Example**:
```bash
# Test only purchase invoice expiry
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=false
ENABLE_INVOICE_EXPIRY_CHECK=false
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=true
```

---

### `ENABLE_RDW_FULL_SYNC`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Every Sunday at 2:00 AM (only if 6+ weeks since last sync)
**Description**: Enable/disable full RDW vehicle data synchronization.

**What it does**:
- Syncs ALL vehicles with the RDW API (if 6+ weeks since last sync)
- Updates APK expiry dates
- Updates vehicle registration (tenaamstelling) information
- Updates license plate formatting
- Creates tenaamstelling change notifications

**Example**:
```bash
# Disable full RDW sync
ENABLE_RDW_FULL_SYNC=false
```

---

### `ENABLE_RDW_DAILY_SYNC`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Daily at 1:00 AM
**Description**: Enable/disable daily RDW sync for vehicles with expired or expiring APK.

**What it does**:
- Syncs ONLY vehicles with expired or expiring APK (within 30 days)
- Fetches fresh APK data from RDW API
- Updates vehicle records with latest APK information
- Ensures notification data is current (runs before APK status check)

**Example**:
```bash
# Disable daily RDW sync
ENABLE_RDW_DAILY_SYNC=false
```

---

### `ENABLE_APK_STATUS_CHECK`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Weekly on Sunday at 1:30 AM
**Description**: Enable/disable APK expiry status checking and notifications.

**What it does**:
- Checks database for vehicles with expired APK (within last 2 years)
- Checks database for vehicles with expiring APK (within next 30 days)
- Creates notifications for companies about APK status
- Respects client notification preferences

**Note**: This runs 30 minutes after the daily RDW sync to use fresh data.

**Example**:
```bash
# Disable APK status notifications
ENABLE_APK_STATUS_CHECK=false
```

---

### `ENABLE_MAINTENANCE_REMINDERS`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `true`
**Schedule**: Weekly on Sunday at 3:00 AM
**Description**: Enable/disable maintenance reminder checking and notifications.

**What it does**:
- Checks for vehicles with maintenance due (within 14 days)
- Checks for vehicles with overdue maintenance
- Creates notifications for companies about maintenance status

**Example**:
```bash
# Disable maintenance reminders
ENABLE_MAINTENANCE_REMINDERS=false
```

---

## Testing/Development Variables

### `TEST_SYNC_COMPANY_ID`
**Type**: String (MongoDB ObjectId)
**Default**: None
**Description**: Company ID to use for testing sync functionality.

**Example**:
```bash
TEST_SYNC_COMPANY_ID=686aff7dc7897a913b9056de
```

### `TEST_SYNC_RDW`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `false`
**Description**: Run RDW sync on startup for testing purposes.

**Example**:
```bash
TEST_SYNC_RDW=true
```

### `TEST_SYNC_MAINTENANCE`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `false`
**Description**: Run maintenance check on startup for testing purposes.

**Example**:
```bash
TEST_SYNC_MAINTENANCE=true
```

### `TEST_SYNC_STATUS_UPDATE`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `false`
**Description**: Run document expiry check on startup for testing purposes (quotes, invoices, purchase invoices).

**Example**:
```bash
TEST_SYNC_STATUS_UPDATE=true
```

### `TEST_SYNC_APK_STATUS`
**Type**: Boolean (String `"true"` | `"false"`)
**Default**: `false`
**Description**: Run APK status check on startup for testing purposes. **Does NOT sync with RDW** - only checks existing APK data in the database and creates notifications.

**Example**:
```bash
# Test APK notifications without RDW sync
TEST_SYNC_APK_STATUS=true
```

---

## Complete Example `.env` File

```bash
# Core Configuration
PORT=4008
NODE_ENV=development
LOG_LEVEL=info
MONGO_STRING=mongodb+srv://user:password@cluster.mongodb.net/database?tls=true&authSource=admin

# RDW API Configuration
RDW_API_KEY=your-rdw-api-key-here
RDW_BASE_URL=https://api.rdw.nl

# Service Enable/Disable Flags (all default to true)
ENABLE_DOCUMENT_EXPIRY_CHECK=true

# Granular document expiry flags (inherit from ENABLE_DOCUMENT_EXPIRY_CHECK)
ENABLE_QUOTE_EXPIRY_CHECK=true
ENABLE_INVOICE_EXPIRY_CHECK=true
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=true

ENABLE_RDW_FULL_SYNC=true
ENABLE_RDW_DAILY_SYNC=true
ENABLE_APK_STATUS_CHECK=true
ENABLE_MAINTENANCE_REMINDERS=true

# Testing/Development (optional)
TEST_SYNC_COMPANY_ID=686aff7dc7897a913b9056de
TEST_SYNC_STATUS_UPDATE=false
TEST_SYNC_APK_STATUS=false
TEST_SYNC_RDW=false
TEST_SYNC_MAINTENANCE=false
```

---

## Service Dependencies

### APK Notification Flow
For APK notifications to work correctly with fresh data:

1. `ENABLE_RDW_DAILY_SYNC=true` - Fetches fresh APK data at 1:00 AM
2. `ENABLE_APK_STATUS_CHECK=true` - Creates notifications at 1:30 AM using fresh data

If you disable `ENABLE_RDW_DAILY_SYNC`, notifications will still work but will be based on potentially stale APK data (last updated during the 6-week full sync).

### Recommended Configurations

**Production (All Features)**:
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=true
ENABLE_INVOICE_EXPIRY_CHECK=true
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=true
ENABLE_RDW_FULL_SYNC=true
ENABLE_RDW_DAILY_SYNC=true
ENABLE_APK_STATUS_CHECK=true
ENABLE_MAINTENANCE_REMINDERS=true
```

**Development (Minimal)**:
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=false
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=false
ENABLE_APK_STATUS_CHECK=false
ENABLE_MAINTENANCE_REMINDERS=false
```

**Testing APK Features Only**:
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=false
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=true
ENABLE_APK_STATUS_CHECK=true
ENABLE_MAINTENANCE_REMINDERS=false
```

**Testing Document Expiry Only**:
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=true
ENABLE_INVOICE_EXPIRY_CHECK=true
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=true
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=false
ENABLE_APK_STATUS_CHECK=false
ENABLE_MAINTENANCE_REMINDERS=false
```

**Testing Quotes Only**:
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_QUOTE_EXPIRY_CHECK=true
ENABLE_INVOICE_EXPIRY_CHECK=false
ENABLE_PURCHASE_INVOICE_EXPIRY_CHECK=false
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=false
ENABLE_APK_STATUS_CHECK=false
ENABLE_MAINTENANCE_REMINDERS=false
```

---

## Viewing Configuration on Startup

When the worker starts, it will log the current configuration:

```
📋 Worker Services Configuration:
   Document Expiry Check: ✅ Enabled
     - Quote Expiry: ✅ Enabled
     - Invoice Expiry: ✅ Enabled
     - Purchase Invoice Expiry: ✅ Enabled
   RDW Full Sync (6-week): ✅ Enabled
   RDW Daily Sync: ✅ Enabled
   APK Status Check: ✅ Enabled
   Maintenance Reminders: ✅ Enabled

⏰ Starting schedulers based on configuration...
✅ Document expiry check scheduler started
✅ RDW daily sync scheduler started
✅ APK status check scheduler started
✅ RDW full sync (6-week) scheduler started
✅ Maintenance reminder scheduler started

⏰ Active schedulers summary (chronological order):
   12:00 AM - Daily       - Document expiry check (quotes, invoices, purchase invoices)
   1:00 AM  - Daily       - Expired/expiring vehicles RDW sync (fetches fresh APK data from RDW API)
   1:30 AM  - Weekly      - APK status check (creates notifications based on current APK status)
   2:00 AM  - Every 6wks  - Full RDW vehicle sync (only if 6+ weeks since last sync)
   3:00 AM  - Weekly      - Maintenance reminder check
```

**With granular flags (e.g., only quotes enabled)**:
```
📋 Worker Services Configuration:
   Document Expiry Check: ✅ Enabled
     - Quote Expiry: ✅ Enabled
     - Invoice Expiry: ❌ Disabled
     - Purchase Invoice Expiry: ❌ Disabled
   RDW Full Sync (6-week): ❌ Disabled
   RDW Daily Sync: ❌ Disabled
   APK Status Check: ❌ Disabled
   Maintenance Reminders: ❌ Disabled

🚀 Starting scheduled expiry check...
📋 Running expiry checks for: quotes
```

---

## Health Check

The worker provides a health check endpoint that shows the current configuration and scheduler status:

```bash
curl http://localhost:4008/health
```

Response includes database connectivity, scheduler status, and memory usage.
