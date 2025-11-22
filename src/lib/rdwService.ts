/**
 * Service for interacting with RDW (Dutch Vehicle Registration Database) API
 */

import { rdwApiKey, rdwBaseUrl } from './config';
import { logger } from './logger';

export interface RDWVehicleData {
	brand?: string;
	model?: string;
	apkExpiryDate?: Date;
	constructionDate?: Date;
	datumTenaamstelling?: Date;
	geexporteerd?: boolean;
	vehicleType?: string;
	fuelType?: string;
	color?: string;
	seatingCapacity?: number;
	weight?: number;
	emissions?: string;
	engineCapacity?: number;
	power?: number;
	maxSpeed?: number;
}

// Pre-compiled regex patterns for Dutch license plates
const DUTCH_LICENSE_PLATE_PATTERNS = [
	/^([A-Z]{2})([0-9]{2})([A-Z]{2})$/,      // XX-XX-XX
	/^([A-Z]{2})([0-9]{3})([A-Z]{1})$/,      // XX-XXX-X
	/^([A-Z]{3})([0-9]{2})([A-Z]{1})$/,      // XXX-XX-X
	/^([A-Z]{1})([0-9]{3})([A-Z]{2})$/,      // X-XXX-XX
	/^([A-Z]{1})([0-9]{2})([A-Z]{3})$/,      // X-XX-XXX
	/^([A-Z]{2})([0-9]{2})([A-Z]{3})$/,      // XX-XX-XXX
	/^([A-Z]{3})([0-9]{3})([A-Z]{1})$/,      // XXX-XXX-X
	/^([A-Z]{1})([0-9]{3})([A-Z]{3})$/,      // X-XXX-XXX
	/^(CDJ)([0-9]{3})([A-Z]{1})$/,           // CDJ-XXX-X
	/^(CDJ)([0-9]{2})([A-Z]{2})$/,           // CDJ-XX-XX
	/^([GVW])([0-9]{3})([A-Z]{2})$/,         // G/V/W-XXX-XX
	/^([0-9])([A-Z]{3})([0-9]{2})$/,         // 5-XXX-XX
	/^([0-9])([A-Z]{3})([0-9])$/,            // 9-PHP-9
	/^([0-9]{2})([A-Z]{3})([0-9])$/,         // XX-XXX-X
	/^([0-9]{2})([A-Z]{2})([A-Z]{2})$/,      // XX-LL-LL
];

/**
 * Format a Dutch license plate with proper dashes
 */
export function formatDutchLicensePlate(licensePlate: string): string {
	if (!licensePlate) return licensePlate;

	// Remove any spaces, dashes, and convert to uppercase
	const plate = licensePlate.replace(/[\s-]/g, '').toUpperCase();

	// Try each pattern
	for (const pattern of DUTCH_LICENSE_PLATE_PATTERNS) {
		const match = plate.match(pattern);
		if (match) {
			// All Dutch license plates use the same format: part1-part2-part3
			return `${match[1]}-${match[2]}-${match[3]}`;
		}
	}

	// If no pattern matches, return uppercase version
	return plate;
}

/**
 * Check if a license plate is a valid Dutch format
 */
export function isValidDutchLicensePlate(licensePlate: string): boolean {
	if (!licensePlate) return false;

	// Remove any spaces, dashes, and convert to uppercase
	const plate = licensePlate.replace(/[\s-]/g, '').toUpperCase();

	const patterns = [
		/^[A-Z]{2}[0-9]{2}[A-Z]{2}$/,      // XX-XX-XX
		/^[A-Z]{2}[0-9]{3}[A-Z]{1}$/,      // XX-XXX-X
		/^[A-Z]{3}[0-9]{2}[A-Z]{1}$/,      // XXX-XX-X
		/^[A-Z]{1}[0-9]{3}[A-Z]{2}$/,      // X-XXX-XX
		/^[A-Z]{1}[0-9]{2}[A-Z]{3}$/,      // X-XX-XXX
		/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/,      // XX-XX-XXX
		/^[A-Z]{3}[0-9]{3}[A-Z]{1}$/,      // XXX-XXX-X
		/^[A-Z]{1}[0-9]{3}[A-Z]{3}$/,      // X-XXX-XXX
		/^CDJ[0-9]{3}[A-Z]{1}$/,           // CDJ-XXX-X
		/^CDJ[0-9]{2}[A-Z]{2}$/,           // CDJ-XX-XX
		/^[GVW][0-9]{3}[A-Z]{2}$/,         // G/V/W-XXX-XX
		/^[0-9][A-Z]{3}[0-9]{2}$/,         // 5-XXX-XX
		/^[0-9][A-Z]{3}[0-9]$/,            // 9-PHP-9
		/^[0-9]{2}[A-Z]{3}[0-9]$/,         // XX-XXX-X
		/^[0-9]{2}[A-Z]{2}[A-Z]{2}$/,      // XX-LL-LL
	];

	return patterns.some(pattern => pattern.test(plate));
}

/**
 * Fetch vehicle data from RDW Open Data API
 * Uses Socrata Open Data API with optional API token for higher rate limits
 */
export async function fetchRDWVehicleData(licensePlate: string): Promise<RDWVehicleData | null> {
	try {
		logger.debug(`Fetching RDW data for license plate: ${licensePlate}`);

		// Remove dashes from license plate for the API query
		const cleanLicensePlate = licensePlate.replace(/-/g, '').toUpperCase();

		// RDW Open Data API endpoint using Socrata API
		// m9d7-ebf2 is the dataset ID for "Gekentekende voertuigen" (Registered vehicles)
		const apiUrl = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(cleanLicensePlate)}`;

		// Build headers - include API token if available for higher rate limits
		const headers: Record<string, string> = {
			'Accept': 'application/json',
			'User-Agent': 'ABA-Worker/1.0.0'
		};

		// Use API token if configured (increases rate limit from 1000 to 50000 requests/day)
		if (rdwApiKey) {
			headers['X-App-Token'] = rdwApiKey;
			logger.debug(`🔑 Using RDW API token for ${licensePlate}`);
		} else {
			logger.debug(`🌐 Using RDW Open Data API without token for ${licensePlate}`);
		}

		const response = await fetch(apiUrl, { headers });

		if (!response.ok) {
			if (response.status === 404) {
				logger.debug(`❌ No RDW data found for license plate: ${licensePlate} (404)`);
				return null;
			}
			throw new Error(`RDW API responded with status: ${response.status}`);
		}

		const data = await response.json();

		// 📊 DEBUG: Log RDW API response
		logger.debug(`📄 RDW API response for ${licensePlate}:`, {
			status: response.status,
			dataLength: Array.isArray(data) ? data.length : 0,
			hasToken: !!rdwApiKey
		});

		// API returns an array, check if it has results
		if (!Array.isArray(data) || data.length === 0) {
			logger.debug(`❌ No RDW data found for license plate: ${licensePlate} (empty response)`);
			return null;
		}

		const vehicleData = data[0]; // Take first result

		// Validate required fields exist
		if (!vehicleData.merk || !vehicleData.handelsbenaming) {
			logger.warn(`⚠️ RDW data for ${licensePlate} missing required fields (merk or handelsbenaming)`);
			return null;
		}

		// Helper function to parse RDW date format (YYYYMMDD)
		const parseRDWDate = (dateStr: string | undefined): Date | undefined => {
			if (!dateStr || dateStr.length !== 8) return undefined;
			try {
				const year = parseInt(dateStr.substring(0, 4));
				const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
				const day = parseInt(dateStr.substring(6, 8));
				const date = new Date(year, month, day);
				return isNaN(date.getTime()) ? undefined : date;
			} catch {
				return undefined;
			}
		};

		// Helper function to convert export_indicator to boolean
		const convertExportIndicator = (indicator?: string): boolean | undefined => {
			if (!indicator) return undefined;
			const normalized = indicator.trim().toLowerCase();
			if (normalized === 'ja') return true;
			if (normalized === 'nee') return false;
			return undefined;
		};

		// Transform RDW Open Data API response to our interface
		const transformedData: RDWVehicleData = {
			brand: vehicleData.merk?.trim(),
			model: vehicleData.handelsbenaming?.trim(),
			apkExpiryDate: parseRDWDate(vehicleData.vervaldatum_apk),
			constructionDate: parseRDWDate(vehicleData.datum_eerste_toelating),
			datumTenaamstelling: parseRDWDate(vehicleData.datum_tenaamstelling),
			geexporteerd: convertExportIndicator(vehicleData.export_indicator),
			vehicleType: vehicleData.voertuigsoort?.trim(),
			fuelType: vehicleData.brandstof_omschrijving?.trim(),
			color: vehicleData.eerste_kleur?.trim(),
			seatingCapacity: vehicleData.aantal_zitplaatsen ? parseInt(vehicleData.aantal_zitplaatsen) : undefined,
			weight: vehicleData.massa_rijklaar ? parseInt(vehicleData.massa_rijklaar) : undefined,
			emissions: vehicleData.emissiecode_omschrijving?.trim(),
			engineCapacity: vehicleData.cilinderinhoud ? parseInt(vehicleData.cilinderinhoud) : undefined,
			power: vehicleData.nettomaximumvermogen ? parseInt(vehicleData.nettomaximumvermogen) : undefined,
			maxSpeed: vehicleData.maximale_constructiesnelheid ? parseInt(vehicleData.maximale_constructiesnelheid) : undefined,
		};

		// 🔄 DEBUG: Log transformed data
		logger.debug(`🔄 Transformed data for ${licensePlate}:`, {
			brand: transformedData.brand,
			model: transformedData.model,
			apkExpiryDate: transformedData.apkExpiryDate?.toISOString().split('T')[0],
			datumTenaamstelling: transformedData.datumTenaamstelling?.toISOString().split('T')[0]
		});

		logger.debug(`✅ Successfully fetched RDW data for ${licensePlate}`);
		return transformedData;
	} catch (error) {
		logger.error(`❌ Error fetching RDW data for ${licensePlate}`, { error: (error as Error).message });
		return null;
	}
}

/**
 * Determine which fields need updating based on current vehicle data and RDW data
 */
export function determineFieldsToUpdate(currentVehicle: any, rdwData: RDWVehicleData): {
	updates: any;
	tenaamstellingChanged: boolean;
} {
	logger.debug(`🔍 Comparing current vehicle data with RDW data for ${currentVehicle.license_plate}`);
	const updates: any = {};
	let tenaamstellingChanged = false;

	// Check if RDW data has different values
	if (rdwData.brand && rdwData.brand !== currentVehicle.vehicle_brand) {
		updates.vehicle_brand = rdwData.brand;
	}

	if (rdwData.model && rdwData.model !== currentVehicle.vehicle_type) {
		updates.vehicle_type = rdwData.model;
	}

	if (rdwData.apkExpiryDate && (!currentVehicle.apk_expiry || rdwData.apkExpiryDate.getTime() !== currentVehicle.apk_expiry.getTime())) {
		updates.apk_expiry = rdwData.apkExpiryDate;
		// Reset email sent timestamps when APK date changes to allow new reminders
		updates.lastApkEmailSentForExpired = null;
		updates.lastApkEmailSentForExpiring = null;
		// Reset dismissal fields (e.g., vehicle renewed APK), but preserve permanent dismissals
		const hasPermanentDismissal = currentVehicle.apkRemindersDismissed === true &&
			(currentVehicle.apkRemindersDisabledUntil === null || currentVehicle.apkRemindersDisabledUntil === undefined);
		if (!hasPermanentDismissal) {
			updates.apkRemindersDismissed = false;
			updates.apkRemindersDisabledUntil = null;
		}
	}

	if (rdwData.datumTenaamstelling && (!currentVehicle.datum_tenaamstelling || rdwData.datumTenaamstelling.getTime() !== currentVehicle.datum_tenaamstelling.getTime())) {
		updates.datum_tenaamstelling = rdwData.datumTenaamstelling;
		tenaamstellingChanged = true;
	}

	if (rdwData.geexporteerd !== undefined && rdwData.geexporteerd !== currentVehicle.geexporteerd) {
		updates.geexporteerd = rdwData.geexporteerd;
	}

	logger.debug(`📝 Update determination complete for ${currentVehicle.license_plate}: ${Object.keys(updates).length} fields to update:`, Object.keys(updates));

	return { updates, tenaamstellingChanged };
}
