"use client";

import { authClient } from "@databuddy/auth/client";
import { useAtom } from "jotai";
import { type ReactNode, useEffect } from "react";
import {
	activeOrganizationAtom,
	getOrganizationBySlugAtom,
	isLoadingOrganizationsAtom,
	organizationsAtom,
} from "@/stores/jotai/organizationsAtoms";

export type Organization = NonNullable<
	ReturnType<typeof authClient.useListOrganizations>["data"]
>[number];

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const { data: organizationsData, isPending: isLoadingOrgs } =
		authClient.useListOrganizations();
	const { data: activeOrganization, isPending: isLoadingActive } =
		authClient.useActiveOrganization();

	const [, setOrganizations] = useAtom(organizationsAtom);
	const [, setActiveOrganization] = useAtom(activeOrganizationAtom);
	const [, setIsLoading] = useAtom(isLoadingOrganizationsAtom);

	useEffect(() => {
		setOrganizations(organizationsData ?? []);
		setActiveOrganization(activeOrganization ?? null);
		setIsLoading(isLoadingOrgs || isLoadingActive);
	}, [
		organizationsData,
		activeOrganization,
		isLoadingOrgs,
		isLoadingActive,
		setOrganizations,
		setActiveOrganization,
		setIsLoading,
	]);

	return <>{children}</>;
}

export function useOrganizationsContext() {
	const [organizations] = useAtom(organizationsAtom);
	const [activeOrganization] = useAtom(activeOrganizationAtom);
	const [isLoading] = useAtom(isLoadingOrganizationsAtom);
	const [getOrganizationBySlug] = useAtom(getOrganizationBySlugAtom);

	return {
		organizations,
		activeOrganization,
		isLoading,
		getOrganization: getOrganizationBySlug,
	};
}
