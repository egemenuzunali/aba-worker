# APK Services Separation

This document explains the separation of APK-related functionality into two distinct services.

## Overview

Previously, the `RdwSyncService` handled both:
1. Fetching APK data from the RDW API
2. Checking APK expiry status and creating notifications

This has been separated into two independent services for better separation of concerns.

## Services

### 1. RdwSyncService (`src/services/RdwSyncService.ts`)

**Responsibility**: Fetch and sync vehicle data from the Dutch RDW (vehicle registration) API

**Key Functions**:
- `syncAllCompaniesVehicles()` - Full RDW sync for all company vehicles (runs every 6 weeks)
- `syncExpiredAndExpiringVehicles()` - Daily sync of vehicles with expired/expiring APK
- `syncCompanyVehicles(companyId)` - Sync all vehicles for a specific company

**What it does**:
- Makes API calls to the RDW to fetch fresh vehicle data
- Updates vehicle records with:
  - APK expiry dates
  - Tenaamstelling (registration ownership) dates
  - License plate formatting
  - Other vehicle metadata
- Creates tenaamstelling change notifications when ownership dates change

**What it does NOT do**:
- Does NOT check APK expiry status for notifications
- Does NOT create APK expired/expiring notifications

### 2. ApkStatusService (`src/services/ApkStatusService.ts`)

**Responsibility**: Check current APK expiry status and create notifications

**Key Functions**:
- `checkApkExpiryForAllCompanies()` - Check all companies for expired/expiring APK
- `checkApkExpiryForCompany(companyId)` - Check one company's vehicles

**What it does**:
- Queries the database for vehicles with expired or expiring APK
- Groups vehicles by company and expiry category (expired vs expiring)
- Creates notifications for companies about:
  - Vehicles with expired APK (expired within last 2 years)
  - Vehicles with expiring APK (expiring within 30 days)
- Respects client notification preferences (`apkNotificationsDisabled`)
- Handles large fleets efficiently with pagination

**What it does NOT do**:
- Does NOT make RDW API calls
- Does NOT update vehicle data
- Does NOT sync vehicle information

## Scheduler Configuration

The `StatusUpdateScheduler` runs both services on different schedules:

### Daily Schedule (1:00 AM)
```
RdwSyncService.syncExpiredAndExpiringVehicles()
```
- Fetches fresh APK data from RDW for vehicles with expired/expiring APK
- Ensures notification data is current

### Weekly Schedule (1:30 AM, Sundays)
```
ApkStatusService.checkApkExpiryForAllCompanies()
```
- Checks APK status in database
- Creates notifications based on fresh data from 1:00 AM sync
- Runs 30 minutes after the daily sync to use updated data

### 6-Week Schedule (2:00 AM, Sundays)
```
RdwSyncService.syncAllCompaniesVehicles()
```
- Full sync of all vehicles with RDW (if 6+ weeks since last sync)
- Comprehensive data refresh

## Benefits of Separation

1. **Single Responsibility**: Each service has one clear purpose
2. **Independent Scheduling**: Can run RDW syncs and status checks on different schedules
3. **Better Performance**: Status checks don't require API calls
4. **Easier Testing**: Can test notification logic without RDW API dependencies
5. **Flexibility**: Can check APK status more frequently without making excessive API calls
6. **Maintainability**: Clearer code organization and separation of concerns

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Daily at 1:00 AM                          │
│                                                               │
│  RdwSyncService.syncExpiredAndExpiringVehicles()            │
│  ├─ Fetch APK data from RDW API                             │
│  ├─ Update vehicle.apk_expiry in database                   │
│  └─ Update vehicle.last_rdw_sync timestamp                  │
│                                                               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Fresh APK data now in database
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Weekly at 1:30 AM (Sunday)                   │
│                                                               │
│  ApkStatusService.checkApkExpiryForAllCompanies()           │
│  ├─ Query database for vehicles with:                       │
│  │  • apk_expiry < today (expired)                          │
│  │  • apk_expiry between today and +30 days (expiring)     │
│  ├─ Group by company                                        │
│  └─ Create notifications                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Enable/Disable Features

Companies can control these features via `serviceModules`:

- `rdwSyncEnabled` - Enable/disable RDW API syncing
- `apkNotificationsEnabled` - Enable/disable APK notifications

Clients can control notifications:

- `apkNotificationsDisabled` - Disable APK notifications for specific clients

### System Tracking

The System collection tracks when each service last ran:

- `lastRdwSync` - Last full RDW sync
- `lastApkStatusCheck` - Last APK status check

## Manual Triggers

Both services can be triggered manually:

```typescript
// Manually sync with RDW
const scheduler = StatusUpdateScheduler.getInstance();
await scheduler.runManualRdwSync();

// Manually check APK status
await scheduler.runManualApkStatusCheck();

// Daily expired/expiring vehicles sync
await scheduler.runManualDailyExpiredVehiclesSync();
```

## Migration Notes

This change is backward compatible:
- No database schema changes required
- Existing cron schedules updated to use new service methods
- All existing functionality preserved
- Manual trigger methods updated for clarity
