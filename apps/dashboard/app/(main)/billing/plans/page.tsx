"use client";

import { useSearchParams } from "next/navigation";
import PricingTable from "@/components/autumn/pricing-table";

export default function PlansPage() {
	const searchParams = useSearchParams();
	const selectedPlan = searchParams.get("plan");

	return (
		<main className="flex-1 overflow-y-auto p-4 sm:p-6">
			<PricingTable selectedPlan={selectedPlan} />
		</main>
	);
}
