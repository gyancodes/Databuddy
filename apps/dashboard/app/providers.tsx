"use client";

import { authClient } from "@databuddy/auth/client";
import { FlagsProvider } from "@databuddy/sdk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState } from "react";
import { OrganizationsProvider } from "@/components/providers/organizations-provider";

const defaultQueryClientOptions = {
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes
			refetchOnWindowFocus: false,
			refetchOnMount: true,
			refetchOnReconnect: true,
			retry: 1,
			retryDelay: (attemptIndex: number) =>
				Math.min(1000 * 2 ** attemptIndex, 30_000),
		},
		mutations: {
			retry: false,
		},
	},
};

export default function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				...defaultQueryClientOptions,
				defaultOptions: {
					...defaultQueryClientOptions.defaultOptions,
					queries: {
						...defaultQueryClientOptions.defaultOptions.queries,
						gcTime: 1000 * 60 * 5, // 5 minutes
						staleTime: 1000 * 60 * 2, // 2 minutes
					},
				},
			})
	);

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<QueryClientProvider client={queryClient}>
				<FlagsProviderWrapper>
					<AutumnProvider
						backendUrl={
							process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
						}
					>
						<OrganizationsProvider>
							<NuqsAdapter>{children}</NuqsAdapter>
						</OrganizationsProvider>
					</AutumnProvider>
				</FlagsProviderWrapper>
			</QueryClientProvider>
		</ThemeProvider>
	);
}

function FlagsProviderWrapper({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = authClient.useSession();
	return (
		<FlagsProvider
			clientId="3ed1fce1-5a56-4cb6-a977-66864f6d18e3"
			isPending={isPending}
			user={
				session?.user
					? { userId: session.user.id, email: session.user.email }
					: undefined
			}
		>
			{children}
		</FlagsProvider>
	);
}
