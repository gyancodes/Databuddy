import crypto, { createHash } from "node:crypto";
import { redis } from "@databuddy/redis";
import { logger } from "./logger";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SALT_TTL = 60 * 60 * 24;
const EXIT_EVENT_TTL = 172_800;
const STANDARD_EVENT_TTL = 86_400;

function getCurrentDay(): number {
	return Math.floor(Date.now() / MS_PER_DAY);
}

export async function getDailySalt(): Promise<string> {
	console.time("getDailySalt");
	const saltKey = `salt:${getCurrentDay()}`;
	try {
		const salt = await redis.get(saltKey);
		if (salt) {
			console.timeEnd("getDailySalt");
			return salt;
		}

		const newSalt = crypto.randomBytes(32).toString("hex");
		redis.setex(saltKey, SALT_TTL, newSalt).catch((error) => {
			logger.error({ error }, "Failed to set daily salt in Redis");
		});
		console.timeEnd("getDailySalt");
		return newSalt;
	} catch (error) {
		logger.error({ error }, "Failed to get daily salt from Redis");
		console.timeEnd("getDailySalt");
		return crypto.randomBytes(32).toString("hex");
	}
}

export function saltAnonymousId(anonymousId: string, salt: string): string {
	try {
		return createHash("sha256").update(anonymousId + salt).digest("hex");
	} catch (error) {
		logger.error({ error, anonymousId }, "Failed to salt anonymous ID");
		return createHash("sha256").update(anonymousId).digest("hex");
	}
}

export async function checkDuplicate(
	eventId: string,
	eventType: string
): Promise<boolean> {
	console.time("checkDuplicate");
	const key = `dedup:${eventType}:${eventId}`;
	try {
		if (await redis.exists(key)) {
			console.timeEnd("checkDuplicate");
			return true;
		}

		const ttl = eventId.startsWith("exit_") ? EXIT_EVENT_TTL : STANDARD_EVENT_TTL;
		redis.setex(key, ttl, "1").catch((error) => {
			logger.error({ error, eventId, eventType }, "Failed to set duplicate key in Redis");
		});
		console.timeEnd("checkDuplicate");
		return false;
	} catch (error) {
		logger.error({ error, eventId, eventType }, "Failed to check duplicate event in Redis");
		console.timeEnd("checkDuplicate");
		return false;
	}
}
