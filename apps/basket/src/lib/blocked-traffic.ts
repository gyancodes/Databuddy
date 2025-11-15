import { randomUUID } from "node:crypto";
import type { BlockedTraffic } from "@databuddy/db";
import { extractIpFromRequest, getGeo } from "../utils/ip-geo";
import { parseUserAgent } from "../utils/user-agent";
import { sanitizeString, VALIDATION_LIMITS } from "../utils/validation";
import { logger } from "./logger";
import { sendEvent } from "./producer";

async function _logBlockedTrafficAsync(
	request: Request,
	body: any,
	_query: any,
	blockReason: string,
	blockCategory: string,
	botName?: string,
	clientId?: string
): Promise<void> {
	try {
		const ip = extractIpFromRequest(request);
		const userAgent =
			sanitizeString(
				request.headers.get("user-agent"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || "";

		const payloadSize = JSON.stringify(body || {}).length;
		const eventType = body?.type || "unknown";
		logger.warn({
			website_id: clientId || "unknown",
			event_type: eventType,
			block_reason: blockReason,
			block_category: blockCategory,
			bot_name: botName || "N/A",
			size_bytes: payloadSize,
			size_kb: (payloadSize / 1024).toFixed(2),
			timestamp: Date.now(),
			session_id: body?.sessionId || body?.payload?.sessionId || "unknown",
			anonymous_id: body?.anonymousId?.substring(0, 8) || body?.payload?.anonymousId?.substring(0, 8) || "unknown",
			ip_prefix: ip.substring(0, 7),
			country: "pending",
		}, `Event blocked: ${blockReason}`);

		const { anonymizedIP, country, region, city } = await getGeo(ip);
		const { browserName, browserVersion, osName, osVersion, deviceType } =
			parseUserAgent(userAgent);

		const now = Date.now();

		const blockedEvent: BlockedTraffic = {
			id: randomUUID(),
			client_id: clientId || "",
			timestamp: now,

			path: sanitizeString(body?.path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			url: sanitizeString(
				body?.url || body?.href,
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			referrer: sanitizeString(
				body?.referrer || request.headers.get("referer"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			method: "POST",
			origin: sanitizeString(
				request.headers.get("origin"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),

			ip: anonymizedIP || ip,
			user_agent: userAgent || "",
			accept_header: sanitizeString(
				request.headers.get("accept"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),
			language: sanitizeString(
				request.headers.get("accept-language"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			),

			block_reason: blockReason,
			block_category: blockCategory,
			bot_name: botName || "",

			country: country || "",
			region: region || "",
			city: city || "",
			browser_name: browserName || "",
			browser_version: browserVersion || "",
			os_name: osName || "",
			os_version: osVersion || "",
			device_type: deviceType || "",

			payload_size:
				blockReason === "payload_too_large"
					? JSON.stringify(body || {}).length
					: undefined,

			created_at: now,
		};

		sendEvent("analytics-blocked-traffic", blockedEvent);
	} catch (error) {
		logger.error({ error }, "Failed to log blocked traffic");
	}
}

/**
 * Log blocked traffic for security and monitoring purposes (fire-and-forget)
 */
export function logBlockedTraffic(
	request: Request,
	body: any,
	query: any,
	blockReason: string,
	blockCategory: string,
	botName?: string,
	clientId?: string
): void {
	_logBlockedTrafficAsync(
		request,
		body,
		query,
		blockReason,
		blockCategory,
		botName,
		clientId
	).catch((error) => {
		logger.error({ error }, "Failed to log blocked traffic");
	});
}
