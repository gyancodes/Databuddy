import "./polyfills/compression";
import { auth } from "@databuddy/auth";
import { appRouter, createRPCContext } from "@databuddy/rpc";
import { logger } from "@databuddy/shared/logger";
import cors from "@elysiajs/cors";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { autumnHandler } from "autumn-js/elysia";
import { Elysia } from "elysia";
import { assistant } from "./routes/assistant";
import { exportRoute } from "./routes/export";
import { health } from "./routes/health";
import { publicApi } from "./routes/public";
import { query } from "./routes/query";

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			logger.error(error);
		}),
	],
});

const app = new Elysia()
	.use(
		cors({
			credentials: true,
			origin: [
				/(?:^|\.)databuddy\.cc$/,
				...(process.env.NODE_ENV === "development"
					? ["http://localhost:3000"]
					: []),
			],
		})
	)
	.use(publicApi)
	.use(health)
	.use(
		autumnHandler({
			identify: async ({ request }) => {
				try {
					const session = await auth.api.getSession({
						headers: request.headers,
					});

					return {
						customerId: session?.user.id ?? undefined,
						customerData: {
							name: session?.user.name ?? undefined,
							email: session?.user.email ?? undefined,
						},
					};
				} catch (error) {
					logger.error({ error }, "Failed to get session for autumn handler");
					return null;
				}
			},
		})
	)
	.use(query)
	.use(assistant)
	.use(exportRoute)
	.all(
		"/rpc/*",
		async ({ request }) => {
			try {
				const rpcContext = await createRPCContext({
					headers: request.headers,
				});
				const { response } = await rpcHandler.handle(request, {
					prefix: "/rpc",
					context: rpcContext,
				});
				return response ?? new Response("Not Found", { status: 404 });
			} catch (error) {
				logger.error({ error }, "RPC handler failed");
				return new Response("Internal Server Error", { status: 500 });
			}
		},
		{
			parse: "none",
		}
	)
	.onError(function handleError({ error, code }) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error({ error, code }, errorMessage);

		return new Response(
			JSON.stringify({
				success: false,
				error: errorMessage,
				code: code ?? "INTERNAL_SERVER_ERROR",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	});

export default {
	fetch: app.fetch,
	port: 3001,
};

process.on("SIGINT", () => {
	logger.info("SIGINT received, shutting down gracefully...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	logger.info("SIGTERM received, shutting down gracefully...");
	process.exit(0);
});
