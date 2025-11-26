import { websitesApi } from "@databuddy/auth";
import { and, apikey, desc, eq, type InferSelectModel, isNull } from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { createKeys, hasAllScopes, hasAnyScope, hasScope, isExpired } from "keypal";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";

const keys = createKeys({ prefix: "dbdy_", length: 48 });

export { keys };

type ApiKey = InferSelectModel<typeof apikey>;
type ApiScope = ApiKey["scopes"][number];
type Metadata = { resources?: Record<string, string[]> };

export const API_SCOPES = [
	"read:data",
	"write:data",
	"read:experiments",
	"track:events",
	"admin:apikeys",
	"read:analytics",
	"write:custom-sql",
	"read:export",
	"write:otel",
	"admin:users",
	"admin:organizations",
	"admin:websites",
	"rate:standard",
	"rate:premium",
	"rate:enterprise",
] as const;

export const RESOURCE_TYPES = [
	"global",
	"website",
	"ab_experiment",
	"feature_flag",
	"analytics_data",
	"error_data",
	"web_vitals",
	"custom_events",
	"export_data",
] as const;

const scopeEnum = z.enum(API_SCOPES);
const resourcesSchema = z.record(z.string(), z.array(scopeEnum));

const accessEntrySchema = z.object({
	resourceType: z.string(),
	resourceId: z.string().optional(),
	scopes: z.array(scopeEnum),
});

const createSchema = z.object({
	name: z.string().min(1).max(100),
	organizationId: z.string().optional(),
	type: z.enum(["user", "sdk", "automation"]).default("user"),
	globalScopes: z.array(scopeEnum).default([]),
	access: z.array(accessEntrySchema).default([]),
	expiresAt: z.string().optional(),
	rateLimit: z
		.object({
			enabled: z.boolean().default(true),
			max: z.number().int().positive().optional(),
			window: z.number().int().positive().optional(),
		})
		.optional(),
});

const updateSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	enabled: z.boolean().optional(),
	scopes: z.array(scopeEnum).optional(),
	resources: resourcesSchema.optional(),
	expiresAt: z.string().nullable().optional(),
	rateLimit: z
		.object({
			enabled: z.boolean().optional(),
			max: z.number().int().positive().optional(),
			window: z.number().int().positive().optional(),
		})
		.optional(),
});

const getMeta = (key: ApiKey): Metadata => (key.metadata as Metadata) ?? {};

function resourcesToAccess(resources: Record<string, string[]> | undefined) {
	if (!resources) {
		return [];
	}
	return Object.entries(resources).map(([key, scopes], idx) => {
		const isGlobal = key === "global";
		const [resourceType, resourceId] = isGlobal ? ["global", null] : key.split(":");
		return {
			id: `access-${idx}`,
			resourceType: resourceType ?? "global",
			resourceId: resourceId ?? null,
			scopes,
		};
	});
}

function accessToResources(access: Array<{ resourceType: string; resourceId?: string; scopes: string[] }>) {
	const resources: Record<string, string[]> = {};
	for (const entry of access) {
		const key = entry.resourceType === "global" ? "global" : `${entry.resourceType}:${entry.resourceId}`;
		resources[key] = entry.scopes;
	}
	return resources;
}

async function assertCanManage(ctx: Context & { user: NonNullable<Context["user"]> }, key: ApiKey) {
	if (ctx.user.role === "ADMIN") {
		return;
	}
	if (key.organizationId) {
		const { success } = await websitesApi.hasPermission({
			headers: ctx.headers,
			body: { permissions: { website: ["configure"] } },
		});
		if (!success) {
			throw new ORPCError("FORBIDDEN", { message: "Missing organization permissions" });
		}
	} else if (key.userId !== ctx.user.id) {
		throw new ORPCError("FORBIDDEN", { message: "Not authorized to manage this key" });
	}
}

async function getKey(ctx: Context & { user: NonNullable<Context["user"]> }, id: string) {
	const key = await ctx.db.query.apikey.findFirst({ where: eq(apikey.id, id) });
	if (!key) {
		throw new ORPCError("NOT_FOUND", { message: "API key not found" });
	}
	return key;
}

function getScopes(key: ApiKey, resource?: string): ApiScope[] {
	const scopes = new Set<ApiScope>(key.scopes);
	const resources = getMeta(key).resources;

	if (resources) {
		for (const s of resources.global ?? []) {
			scopes.add(s as ApiScope);
		}
		if (resource && resources[resource]) {
			for (const s of resources[resource]) {
				scopes.add(s as ApiScope);
			}
		}
	}

	return [...scopes];
}

function checkValidity(key: ApiKey): { valid: boolean; reason?: string } {
	if (!key.enabled) {
		return { valid: false, reason: "disabled" };
	}
	if (key.revokedAt) {
		return { valid: false, reason: "revoked" };
	}
	if (isExpired(key.expiresAt)) {
		return { valid: false, reason: "expired" };
	}
	return { valid: true };
}

function mapKeyToResponse(key: ApiKey, includeDetails = false) {
	const base = {
		id: key.id,
		name: key.name,
		prefix: key.prefix,
		start: key.start,
		type: key.type,
		enabled: key.enabled,
		scopes: key.scopes,
		expiresAt: key.expiresAt,
		revokedAt: key.revokedAt,
		createdAt: key.createdAt,
		updatedAt: key.updatedAt,
	};

	if (includeDetails) {
		return {
			...base,
			access: resourcesToAccess(getMeta(key).resources),
			rateLimit: {
				enabled: key.rateLimitEnabled,
				max: key.rateLimitMax,
				window: key.rateLimitTimeWindow,
			},
		};
	}

	return base;
}

export const apikeysRouter = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.handler(async ({ context, input }) => {
			const rows = await context.db
				.select()
				.from(apikey)
				.where(
					input.organizationId
						? eq(apikey.organizationId, input.organizationId)
						: and(eq(apikey.userId, context.user.id), isNull(apikey.organizationId))
				)
				.orderBy(desc(apikey.createdAt));

			return rows.map((r) => mapKeyToResponse(r));
		}),

	getById: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.id);
			await assertCanManage(context, key);
			return mapKeyToResponse(key, true);
		}),

	create: protectedProcedure.input(createSchema).handler(async ({ context, input }) => {
		try {
			const { key: secret, record } = await keys.create({
				ownerId: input.organizationId ?? context.user.id,
				name: input.name,
				scopes: input.globalScopes,
				expiresAt: input.expiresAt ?? null,
			});

			const resources = accessToResources(input.access);
			const now = new Date();
			const [created] = await context.db
				.insert(apikey)
				.values({
					id: record.id,
					name: input.name,
					prefix: secret.split("_")[0] ?? "dbdy",
					start: secret.slice(0, 8),
					keyHash: record.keyHash,
					userId: input.organizationId ? null : context.user.id,
					organizationId: input.organizationId ?? null,
					type: input.type,
					scopes: input.globalScopes,
					enabled: true,
					rateLimitEnabled: input.rateLimit?.enabled ?? true,
					rateLimitMax: input.rateLimit?.max,
					rateLimitTimeWindow: input.rateLimit?.window,
					expiresAt: input.expiresAt ?? null,
					metadata: { resources },
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			return { id: created.id, secret, prefix: created.prefix, start: created.start };
		} catch (error) {
			console.error("API key creation failed:", error);
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: error instanceof Error ? error.message : "Failed to create API key",
			});
		}
	}),

	update: protectedProcedure.input(updateSchema).handler(async ({ context, input }) => {
		const key = await getKey(context, input.id);
		await assertCanManage(context, key);

		const updates: Record<string, unknown> = { updatedAt: new Date() };

		if (input.name) {
			updates.name = input.name;
		}
		if (input.enabled !== undefined) {
			updates.enabled = input.enabled;
		}
		if (input.scopes) {
			updates.scopes = input.scopes;
		}
		if (input.expiresAt !== undefined) {
			updates.expiresAt = input.expiresAt;
		}
		if (input.rateLimit?.enabled !== undefined) {
			updates.rateLimitEnabled = input.rateLimit.enabled;
		}
		if (input.rateLimit?.max !== undefined) {
			updates.rateLimitMax = input.rateLimit.max;
		}
		if (input.rateLimit?.window !== undefined) {
			updates.rateLimitTimeWindow = input.rateLimit.window;
		}
		if (input.resources) {
			updates.metadata = { ...getMeta(key), resources: input.resources };
		}

		const [updated] = await context.db
			.update(apikey)
			.set(updates)
			.where(eq(apikey.id, input.id))
			.returning();

		return { id: updated.id, name: updated.name, enabled: updated.enabled };
	}),

	revoke: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.id);
			await assertCanManage(context, key);

			await context.db
				.update(apikey)
				.set({ enabled: false, revokedAt: new Date(), updatedAt: new Date() })
				.where(eq(apikey.id, input.id));

			return { success: true };
		}),

	rotate: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.id);
			await assertCanManage(context, key);

			const { key: secret, record } = await keys.create({
				ownerId: key.organizationId ?? key.userId ?? context.user.id,
				name: key.name,
				scopes: key.scopes,
				expiresAt: key.expiresAt ?? null,
			});

			const [updated] = await context.db
				.update(apikey)
				.set({
					prefix: secret.split("_")[0] ?? "dbdy",
					start: secret.slice(0, 8),
					keyHash: record.keyHash,
					updatedAt: new Date(),
				})
				.where(eq(apikey.id, input.id))
				.returning();

			return { id: updated.id, secret, prefix: updated.prefix, start: updated.start };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.id);
			await assertCanManage(context, key);
			await context.db.delete(apikey).where(eq(apikey.id, input.id));
			return { success: true };
		}),

	verify: protectedProcedure
		.input(z.object({ secret: z.string(), resource: z.string().optional() }))
		.handler(async ({ context, input }) => {
			const keyHash = keys.hashKey(input.secret);
			const key = await context.db.query.apikey.findFirst({
				where: eq(apikey.keyHash, keyHash),
			});

			if (!key) {
				return { valid: false, reason: "invalid" };
			}

			const validity = checkValidity(key);
			if (!validity.valid) {
				return { valid: false, reason: validity.reason };
			}

			return {
				valid: true,
				keyId: key.id,
				ownerId: key.organizationId ?? key.userId,
				scopes: getScopes(key, input.resource),
			};
		}),

	checkAccess: protectedProcedure
		.input(
			z.object({
				apikeyId: z.string(),
				scopes: z.array(scopeEnum).optional(),
				resource: z.string().optional(),
				mode: z.enum(["any", "all"]).default("any"),
			})
		)
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.apikeyId);
			const validity = checkValidity(key);

			if (!validity.valid) {
				return { valid: false, reason: validity.reason, hasAccess: false, scopes: [] };
			}

			const scopes = getScopes(key, input.resource);

			if (!input.scopes?.length) {
				return { valid: true, hasAccess: true, scopes };
			}

			const checkFn = input.mode === "all" ? hasAllScopes : hasAnyScope;
			return {
				valid: true,
				hasAccess: checkFn(scopes, input.scopes),
				scopes,
				matched: input.scopes.filter((s) => hasScope(scopes, s)),
			};
		}),

	setResources: protectedProcedure
		.input(z.object({ id: z.string(), resources: resourcesSchema }))
		.handler(async ({ context, input }) => {
			const key = await getKey(context, input.id);
			await assertCanManage(context, key);

			await context.db
				.update(apikey)
				.set({
					metadata: { ...getMeta(key), resources: input.resources },
					updatedAt: new Date(),
				})
				.where(eq(apikey.id, input.id));

			return { success: true };
		}),
};
