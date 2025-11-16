# ABA Worker Implementation Summary

## Overview

This document summarizes the recent improvements to the ABA Worker microservice, including service separation and environment-based configuration.

---

## 1. APK Service Separation

### Problem
Previously, the `RdwSyncService` handled both:
- Fetching APK data from the RDW API
- Checking APK expiry status and creating notifications

This violated the Single Responsibility Principle and made the code harder to maintain and test.

### Solution
Separated functionality into two distinct services:

#### `RdwSyncService` - Data Synchronization
**File**: `src/services/RdwSyncService.ts`

**Responsibilities**:
- Fetch vehicle data from Dutch RDW (vehicle registration) API
- Update vehicle records with APK expiry dates
- Update tenaamstelling (ownership) information
- Format license plates
- Create tenaamstelling change notifications

**Key Methods**:
- `syncAllCompaniesVehicles()` - Full sync (6-week schedule)
- `syncExpiredAndExpiringVehicles()` - Daily sync for critical vehicles
- `syncCompanyVehicles(companyId)` - Sync specific company

#### `ApkStatusService` - Status Checking & Notifications
**File**: `src/services/ApkStatusService.ts`

**Responsibilities**:
- Query database for expired/expiring APK
- Group vehicles by company and expiry status
- Create APK expiry notifications
- Respect client notification preferences

**Key Methods**:
- `checkApkExpiryForAllCompanies()` - Check all companies
- `checkApkExpiryForCompany(companyId)` - Check specific company

### Benefits
✅ Single Responsibility Principle
✅ Independent scheduling (sync vs. check)
✅ Better performance (status checks don't require API calls)
✅ Easier testing (mock RDW API separately)
✅ Flexibility (can check status more frequently)

---

## 2. Environment-Based Service Configuration

### Problem
Services were always running with hardcoded schedules, making it difficult to:
- Disable specific services in development
- Test individual services in isolation
- Reduce costs by disabling unnecessary API calls
- Configure different environments differently

### Solution
Added environment variables to enable/disable each service independently.

#### New Environment Variables

| Variable | Default | Schedule | Description |
|----------|---------|----------|-------------|
| `ENABLE_DOCUMENT_EXPIRY_CHECK` | `true` | Daily 12:00 AM | Document expiry checking |
| `ENABLE_RDW_FULL_SYNC` | `true` | Sunday 2:00 AM (6-week) | Full RDW vehicle sync |
| `ENABLE_RDW_DAILY_SYNC` | `true` | Daily 1:00 AM | Expired/expiring vehicles sync |
| `ENABLE_APK_STATUS_CHECK` | `true` | Sunday 1:30 AM | APK status notifications |
| `ENABLE_MAINTENANCE_REMINDERS` | `true` | Sunday 3:00 AM | Maintenance reminders |

#### Configuration Implementation

**File**: `src/lib/config.ts`
- Added service enable/disable flags to Config interface
- Parse environment variables (default to `true`)
- Log configuration on startup
- Export flags for use in scheduler

**File**: `src/services/StatusUpdateScheduler.ts`
- Check configuration flags before starting each scheduler
- Log which schedulers are started/skipped
- Display active schedulers summary on startup

### Benefits
✅ Flexible environment configuration
✅ Reduced costs in dev/test environments
✅ Easier service isolation for testing
✅ Clear visibility of enabled services on startup
✅ No code changes needed for different environments

---

## 3. Documentation

Created comprehensive documentation:

### `APK_SERVICES_SEPARATION.md`
- Detailed explanation of service separation
- Responsibilities of each service
- Scheduler configuration
- Data flow diagrams
- Benefits and migration notes

### `ENV_VARIABLES.md`
- Complete list of all environment variables
- Descriptions, defaults, and examples
- Service dependencies
- Recommended configurations
- Startup output examples

### `.env.example`
- Template for environment configuration
- Comments explaining each variable
- Default values
- Testing/development variables

---

## 4. Schedule Overview

### Active Services (All Enabled)

```
┌──────────┬───────────┬────────────────────────────────────────────────┐
│ Time     │ Frequency │ Service                                        │
├──────────┼───────────┼────────────────────────────────────────────────┤
│ 12:00 AM │ Daily     │ Document Expiry Check                          │
│          │           │ - Marks expired quotes/invoices                │
│          │           │ - Creates expiry notifications                 │
├──────────┼───────────┼────────────────────────────────────────────────┤
│ 1:00 AM  │ Daily     │ RDW Daily Sync                                 │
│          │           │ - Syncs vehicles with expired/expiring APK     │
│          │           │ - Fetches fresh APK data from RDW API          │
├──────────┼───────────┼────────────────────────────────────────────────┤
│ 1:30 AM  │ Weekly    │ APK Status Check                               │
│          │ (Sunday)  │ - Checks APK expiry status in database         │
│          │           │ - Creates APK notifications (uses fresh data)  │
├──────────┼───────────┼────────────────────────────────────────────────┤
│ 2:00 AM  │ 6-Weekly  │ RDW Full Sync                                  │
│          │ (Sunday)  │ - Full sync of ALL vehicles (if 6+ weeks)      │
│          │           │ - Comprehensive data refresh                   │
├──────────┼───────────┼────────────────────────────────────────────────┤
│ 3:00 AM  │ Weekly    │ Maintenance Reminders                          │
│          │ (Sunday)  │ - Checks for due/overdue maintenance           │
│          │           │ - Creates maintenance notifications            │
└──────────┴───────────┴────────────────────────────────────────────────┘
```

### Data Flow: APK Notifications

```
1:00 AM Daily
┌─────────────────────────────────────────────┐
│ RdwSyncService.syncExpiredAndExpiringVehicles│
│ • Fetch APK data from RDW API               │
│ • Update vehicle.apk_expiry in DB           │
└───────────────┬─────────────────────────────┘
                │
                │ Fresh APK data in database
                ▼
1:30 AM Sunday
┌─────────────────────────────────────────────┐
│ ApkStatusService.checkApkExpiryForAllCompanies│
│ • Query DB for expired/expiring APK         │
│ • Group by company                          │
│ • Create notifications                      │
└─────────────────────────────────────────────┘
```

---

## 5. Configuration Examples

### Production (All Services Enabled)
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=true
ENABLE_RDW_FULL_SYNC=true
ENABLE_RDW_DAILY_SYNC=true
ENABLE_APK_STATUS_CHECK=true
ENABLE_MAINTENANCE_REMINDERS=true
```

### Development (Minimal Services)
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=false
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=false
ENABLE_APK_STATUS_CHECK=false
ENABLE_MAINTENANCE_REMINDERS=false
```

### APK Testing Only
```bash
ENABLE_DOCUMENT_EXPIRY_CHECK=false
ENABLE_RDW_FULL_SYNC=false
ENABLE_RDW_DAILY_SYNC=true
ENABLE_APK_STATUS_CHECK=true
ENABLE_MAINTENANCE_REMINDERS=false
```

---

## 6. Startup Output Example

When the worker starts with all services enabled:

```
🚀 Starting ABA Worker microservice in development mode
📡 Port: 4008
📊 Log Level: info
🔑 RDW API key configured
📋 Worker Services Configuration:
   Document Expiry Check: ✅ Enabled
   RDW Full Sync (6-week): ✅ Enabled
   RDW Daily Sync: ✅ Enabled
   APK Status Check: ✅ Enabled
   Maintenance Reminders: ✅ Enabled
Setting up mongodb connection... 🖥️
DB Connection set up ✅
ABA Worker microservice ready at http://localhost:4008 ✅
⏰ Starting schedulers based on configuration...
✅ Document expiry check scheduler started
✅ RDW daily sync scheduler started
✅ RDW full sync (6-week) scheduler started
✅ APK status check scheduler started
✅ Maintenance reminder scheduler started

⏰ Active schedulers summary (chronological order):
   12:00 AM - Daily       - Document expiry check (quotes, invoices, purchase invoices)
   1:00 AM  - Daily       - Expired/expiring vehicles RDW sync (fetches fresh APK data from RDW API)
   1:30 AM  - Weekly      - APK status check (creates notifications based on current APK status)
   2:00 AM  - Every 6wks  - Full RDW vehicle sync (only if 6+ weeks since last sync)
   3:00 AM  - Weekly      - Maintenance reminder check

🚀 ABA Worker microservice initialized with scheduled tasks
```

---

## 7. Files Modified/Created

### Modified Files
- `src/lib/config.ts` - Added service enable/disable flags
- `src/services/StatusUpdateScheduler.ts` - Added configuration checks
- `src/services/RdwSyncService.ts` - Removed APK status checking logic

### New Files
- `src/services/ApkStatusService.ts` - New service for APK status checking
- `APK_SERVICES_SEPARATION.md` - Service separation documentation
- `ENV_VARIABLES.md` - Environment variables documentation
- `.env.example` - Environment template
- `IMPLEMENTATION_SUMMARY.md` - This file

---

## 8. Migration Guide

### For Existing Deployments

No changes required! All services default to enabled (`true`), maintaining backward compatibility.

### To Disable Services

Add environment variables to your `.env` file:

```bash
# Disable specific services
ENABLE_DOCUMENT_EXPIRY_CHECK=false
ENABLE_APK_STATUS_CHECK=false
```

Restart the worker to apply changes.

### To Test Changes

1. Update your `.env` file with desired configuration
2. Restart the worker: `npm run dev` or restart the container
3. Check startup logs to verify configuration
4. Monitor logs at scheduled times to verify execution

---

## 9. Testing

### Manual Testing

```bash
# Test individual services manually
const scheduler = StatusUpdateScheduler.getInstance();

await scheduler.runManualUpdate();              # Document expiry
await scheduler.runManualRdwSync();             # Full RDW sync
await scheduler.runManualDailyExpiredVehiclesSync(); # Daily RDW sync
await scheduler.runManualApkStatusCheck();      # APK status check
await scheduler.runManualMaintenanceCheck();    # Maintenance reminders
```

### API Endpoints

```bash
# Health check (shows configuration and status)
curl http://localhost:4008/health

# Metrics (uptime, memory, etc.)
curl http://localhost:4008/metrics
```

---

## 10. Future Improvements

- [ ] Add database-level service configuration (per-company)
- [ ] Add API endpoints to trigger services manually
- [ ] Add service execution history tracking
- [ ] Add service performance metrics
- [ ] Add configurable cron schedules via environment variables
- [ ] Add notification delivery preferences (email, SMS, etc.)

---

## Summary

The ABA Worker has been significantly improved with:

1. **Better Architecture**: Separated concerns with dedicated services
2. **Flexible Configuration**: Environment-based service control
3. **Comprehensive Documentation**: Clear guides for all features
4. **Backward Compatible**: No breaking changes for existing deployments
5. **Production Ready**: Suitable for all environments with proper configuration

All changes maintain existing functionality while providing better control, clarity, and maintainability.
