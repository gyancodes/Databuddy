import { createHash } from "node:crypto";
import { cacheable } from "@databuddy/redis";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";
import { logger } from "../lib/logger";

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

const CDN_URL = "https://cdn.databuddy.cc/GeoLite2-City.mmdb";

let reader: GeoIPReader | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;
let loadError: Error | null = null;

async function loadDatabaseFromCdn(): Promise<Buffer> {
	try {
		const response = await fetch(CDN_URL);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch database from CDN: ${response.status} ${response.statusText}`
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		const dbBuffer = Buffer.from(arrayBuffer);

		if (dbBuffer.length < 1_000_000) {
			throw new Error(
				`Database file seems too small: ${dbBuffer.length} bytes`
			);
		}

		return dbBuffer;
	} catch (error) {
		logger.error({ error }, "Failed to load database from CDN");
		throw error;
	}
}

function loadDatabase() {
	if (loadError) {
		throw loadError;
	}

	if (isLoading && loadPromise) {
		return loadPromise;
	}

	if (reader) {
		return;
	}

	isLoading = true;
	loadPromise = (async () => {
		try {
			const dbBuffer = await loadDatabaseFromCdn();
			reader = Reader.openBuffer(dbBuffer) as GeoIPReader;
		} catch (error) {
			logger.error({ error }, "Failed to load GeoIP database");
			loadError = error as Error;
			reader = null;
		} finally {
			isLoading = false;
		}
	})();

	return loadPromise;
}

const ignore = ["127.0.0.1", "::1"];

const ipv4Regex =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
	return Boolean(ip && (ipv4Regex.test(ip) || ipv6Regex.test(ip)));
}

async function lookupGeoLocation(ip: string) {
	if (!(reader || isLoading || loadError)) {
		try {
			await loadDatabase();
		} catch (error) {
			logger.error({ error }, "Failed to load database for IP lookup");
			return { country: undefined, region: undefined, city: undefined };
		}
	}

	if (!reader) {
		return { country: undefined, region: undefined, city: undefined };
	}

	try {
		const response = reader.city(ip);
		return {
			country: response.country?.names?.en,
			region: response.subdivisions?.[0]?.names?.en,
			city: response.city?.names?.en,
		};
	} catch (error) {
		if (error instanceof AddressNotFoundError || error instanceof BadMethodCallError) {
			return { country: undefined, region: undefined, city: undefined };
		}
		logger.error({ error }, "Error looking up IP");
		return { country: undefined, region: undefined, city: undefined };
	}
}

const getGeoLocation = cacheable(lookupGeoLocation, {
	expireInSec: 86_400 * 7,
	prefix: "geoip_location",
	staleWhileRevalidate: true,
	staleTime: 86_400,
});

export function anonymizeIp(ip: string): string {
	if (!ip) {
		return "";
	}

	const salt = process.env.IP_HASH_SALT || "databuddy-ip-salt";
	const hash = createHash("sha256");
	hash.update(`${ip}${salt}`);
	return hash.digest("hex").substring(0, 12);
}

export async function getGeo(ip: string) {
	if (!ip || ignore.includes(ip) || !isValidIp(ip)) {
		return {
			anonymizedIP: anonymizeIp(ip),
			country: undefined,
			region: undefined,
			city: undefined,
		};
	}

	const geo = await getGeoLocation(ip);
	return {
		anonymizedIP: anonymizeIp(ip),
		country: geo.country,
		region: geo.region,
		city: geo.city,
	};
}

export function extractIpFromRequest(request: Request): string {
	const cfIp = request.headers.get("cf-connecting-ip");
	if (cfIp) {
		return cfIp.trim();
	}

	const forwardedFor = request.headers.get("x-forwarded-for");
	const firstIp = forwardedFor?.split(",")[0]?.trim();
	if (firstIp) {
		return firstIp;
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	return "";
}
