/**
 * Service for interacting with RDW (Dutch Vehicle Registration Database) API
 */

import { rdwApiKey, rdwBaseUrl } from './config';

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
 * Fetch vehicle data from RDW API
 */
export async function fetchRDWVehicleData(licensePlate: string): Promise<RDWVehicleData | null> {
	try {
		console.log(`🔍 Fetching RDW data for license plate: ${licensePlate}`);

		// Use real RDW API if API key is configured
		if (rdwApiKey) {
			const response = await fetch(`${rdwBaseUrl}/api/vehicle/${encodeURIComponent(licensePlate)}`, {
				headers: {
					'X-API-Key': rdwApiKey,
					'Accept': 'application/json',
					'User-Agent': 'ABA-Worker/1.0.0'
				}
			});

			if (!response.ok) {
				if (response.status === 404) {
					console.log(`ℹ️  No RDW data found for license plate: ${licensePlate}`);
					return null;
				}
				throw new Error(`RDW API responded with status: ${response.status}`);
			}

			const data = await response.json();

			// Transform RDW API response to our interface
			return {
				brand: data.merk,
				model: data.handelsbenaming,
				apkExpiryDate: data.vervaldatum_keuring ? new Date(data.vervaldatum_keuring) : undefined,
				constructionDate: data.datum_eerste_toelating ? new Date(data.datum_eerste_toelating) : undefined,
				datumTenaamstelling: data.datum_tenaamstelling ? new Date(data.datum_tenaamstelling) : undefined,
				geexporteerd: data.export_indicator === 'J', // 'J' means exported in RDW
				vehicleType: data.voertuigsoort,
				fuelType: data.brandstof_omschrijving,
				color: data.kleur,
				seatingCapacity: data.aantal_zitplaatsen ? parseInt(data.aantal_zitplaatsen) : undefined,
				weight: data.massa_ledig_voertuig ? parseInt(data.massa_ledig_voertuig) : undefined,
				emissions: data.emissieklasse,
				engineCapacity: data.cilinderinhoud ? parseInt(data.cilinderinhoud) : undefined,
				power: data.nettomaximumvermogen ? parseInt(data.nettomaximumvermogen) : undefined,
				maxSpeed: data.maximum_massa_samenstelling ? parseInt(data.maximum_massa_samenstelling) : undefined,
			};
		} else {
			// Fallback to mock data when no API key is configured
			console.log('⚠️  Using mock RDW data (no API key configured)');
			return {
				brand: 'Mock Brand',
				model: 'Mock Model',
				apkExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
				constructionDate: new Date('2020-01-01'),
				datumTenaamstelling: new Date('2023-01-01'),
				geexporteerd: false,
				vehicleType: 'Personenauto',
				fuelType: 'Benzine',
			};
		}
	} catch (error) {
		console.error(`❌ Error fetching RDW data for ${licensePlate}:`, error);
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
	}

	if (rdwData.datumTenaamstelling && (!currentVehicle.datum_tenaamstelling || rdwData.datumTenaamstelling.getTime() !== currentVehicle.datum_tenaamstelling.getTime())) {
		updates.datum_tenaamstelling = rdwData.datumTenaamstelling;
		tenaamstellingChanged = true;
	}

	if (rdwData.geexporteerd !== undefined && rdwData.geexporteerd !== currentVehicle.geexporteerd) {
		updates.geexporteerd = rdwData.geexporteerd;
	}

	return { updates, tenaamstellingChanged };
}
