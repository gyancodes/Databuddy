import { cacheable } from "@databuddy/redis";
import { Autumn as autumn } from "autumn-js";
import { getWebsiteByIdV2, isValidOrigin } from "../hooks/auth";
import { extractIpFromRequest } from "../utils/ip-geo";
import { detectBot } from "../utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "../utils/validation";
import { logBlockedTraffic } from "./blocked-traffic";
import { logger } from "./logger";

type ValidationResult = {
	success: true;
	clientId: string;
	userAgent: string;
	ip: string;
	ownerId?: string;
};

type ValidationError = {
	error: { status: string; message: string };
};

const checkAutumnCached = cacheable(
	async (ownerId: string) => {
		console.time("autumnCheck");
		const result = await autumn.check({
			customer_id: ownerId,
			feature_id: "events",
			send_event: true,
		});
		console.timeEnd("autumnCheck");
		return result.data;
	},
	{
		expireInSec: 60,
		prefix: "autumn_check_events",
		staleWhileRevalidate: true,
		staleTime: 30,
	}
);

/**
 * Validate incoming request for analytics events
 */
export async function validateRequest(
	body: any,
	query: any,
	request: Request
): Promise<ValidationResult | ValidationError> {
	console.time("validateRequest");
	if (!validatePayloadSize(body, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
		logBlockedTraffic(
			request,
			body,
			query,
			"payload_too_large",
			"Validation Error"
		);
		console.timeEnd("validateRequest");
		return { error: { status: "error", message: "Payload too large" } };
	}

	const clientId = sanitizeString(
		query.client_id,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	if (!clientId) {
		logBlockedTraffic(
			request,
			body,
			query,
			"missing_client_id",
			"Validation Error"
		);
		console.timeEnd("validateRequest");
		return { error: { status: "error", message: "Missing client ID" } };
	}

	const website = await getWebsiteByIdV2(clientId);
	if (!website || website.status !== "ACTIVE") {
		logBlockedTraffic(
			request,
			body,
			query,
			"invalid_client_id",
			"Validation Error",
			undefined,
			clientId
		);
		console.timeEnd("validateRequest");
		return {
			error: { status: "error", message: "Invalid or inactive client ID" },
		};
	}

	if (website.ownerId) {
		try {
			const data = await checkAutumnCached(website.ownerId);

			if (data && !(data.allowed || data.overage_allowed)) {
				logBlockedTraffic(
					request,
					body,
					query,
					"exceeded_event_limit",
					"Validation Error",
					undefined,
					clientId
				);
				console.timeEnd("validateRequest");
				return { error: { status: "error", message: "Exceeded event limit" } };
			}
		} catch (error) {
			logger.error({ error }, "Autumn check failed, allowing event through");
		}
	}

	const origin = request.headers.get("origin");
	if (origin && !isValidOrigin(origin, website.domain)) {
		logBlockedTraffic(
			request,
			body,
			query,
			"origin_not_authorized",
			"Security Check",
			undefined,
			clientId
		);
		console.timeEnd("validateRequest");
		return { error: { status: "error", message: "Origin not authorized" } };
	}

	const userAgent =
		sanitizeString(
			request.headers.get("user-agent"),
			VALIDATION_LIMITS.STRING_MAX_LENGTH
		) || "";

	const ip = extractIpFromRequest(request);

	console.timeEnd("validateRequest");
	return {
		success: true,
		clientId,
		userAgent,
		ip,
		ownerId: website.ownerId || undefined,
	};
}

/**
 * Check if request is from a bot
 * Returns error object if bot detected, undefined otherwise
 */
export function checkForBot(
	request: Request,
	body: any,
	query: any,
	clientId: string,
	userAgent: string
): { error?: { status: string } } | undefined {
	const botCheck = detectBot(userAgent, request);
	if (botCheck.isBot) {
		logBlockedTraffic(
			request,
			body,
			query,
			botCheck.reason || "unknown_bot",
			botCheck.category || "Bot Detection",
			botCheck.botName,
			clientId
		);
		return { error: { status: "ignored" } };
	}
	return;
}
