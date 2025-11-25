import { useQuery } from "@tanstack/react-query";
import type { Customer, CustomerProduct } from "autumn-js";
import { useCustomer, usePricingTable } from "autumn-js/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AttachDialog from "@/components/autumn/attach-dialog";
import { useOrganizations } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import {
	calculateFeatureUsage,
	type FeatureUsage,
} from "../utils/feature-usage";

export type Usage = {
	features: FeatureUsage[];
};

export type { Customer, CustomerInvoice as Invoice } from "autumn-js";
export type { CustomerWithPaymentMethod } from "../types/billing";

export type CancelTarget = {
	id: string;
	name: string;
	currentPeriodEnd?: number;
};

export function useBilling(refetch?: () => void) {
	const { attach, cancel, check, track, openBillingPortal } = useCustomer();
	const [isLoading, setIsLoading] = useState(false);
	const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

	const handleUpgrade = async (planId: string) => {
		try {
			await attach({
				productId: planId,
				dialog: AttachDialog,
				successUrl: `${window.location.origin}/billing`,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "An unexpected error occurred.";
			toast.error(message);
		}
	};

	const handleCancel = async (planId: string, immediate = false) => {
		setIsLoading(true);
		try {
			await cancel({
				productId: planId,
				...(immediate && { cancelImmediately: true }),
			});
			toast.success(
				immediate
					? "Subscription cancelled immediately."
					: "Subscription cancelled."
			);
			if (refetch) {
				setTimeout(() => refetch(), 500);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to cancel subscription.";
			toast.error(message);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCancelClick = (
		planId: string,
		planName: string,
		currentPeriodEnd?: number
	) => {
		setCancelTarget({ id: planId, name: planName, currentPeriodEnd });
	};

	const handleCancelConfirm = async (immediate: boolean) => {
		if (!cancelTarget) {
			return;
		}
		await handleCancel(cancelTarget.id, immediate);
		setCancelTarget(null);
	};

	const handleCancelDialogClose = () => {
		setCancelTarget(null);
	};

	const handleManageBilling = async () => {
		await openBillingPortal({
			returnUrl: `${window.location.origin}/billing`,
		});
	};

	const getSubscriptionStatus = (product: CustomerProduct) => {
		if (product.canceled_at) {
			return "Cancelling";
		}
		if (product.status === "scheduled") {
			return "Scheduled";
		}
		return "Active";
	};

	const getSubscriptionStatusDetails = (product: CustomerProduct) => {
		if (product.canceled_at && product.current_period_end) {
			return `Access until ${dayjs(product.current_period_end).format("MMM D, YYYY")}`;
		}
		if (product.status === "scheduled") {
			return `Starts on ${dayjs(product.started_at).format("MMM D, YYYY")}`;
		}
		if (product.current_period_end) {
			return `Renews on ${dayjs(product.current_period_end).format("MMM D, YYYY")}`;
		}
		return "";
	};

	const getFeatureUsage = (featureId: string, customer?: Customer) => {
		const feature = customer?.features?.[featureId];
		if (!feature) {
			return null;
		}
		return calculateFeatureUsage(feature);
	};

	return {
		isLoading,
		onUpgrade: handleUpgrade,
		onCancel: handleCancel,
		onCancelClick: handleCancelClick,
		onCancelConfirm: handleCancelConfirm,
		onCancelDialogClose: handleCancelDialogClose,
		onManageBilling: handleManageBilling,
		check,
		track,
		showCancelDialog: !!cancelTarget,
		cancelTarget,
		getSubscriptionStatus,
		getSubscriptionStatusDetails,
		getFeatureUsage,
	};
}

export function useBillingData() {
	const { activeOrganization, isLoading: isOrgLoading } = useOrganizations();
	const {
		customer,
		isLoading: isCustomerLoading,
		error: customerError,
		refetch: refetchCustomer,
	} = useCustomer({
		expand: ["invoices", "payment_method"],
	});

	const {
		products,
		isLoading: isPricingLoading,
		refetch: refetchPricing,
	} = usePricingTable();

	const activeProduct = useMemo(
		() =>
			customer?.products?.find(
				(p) =>
					p.status === "active" ||
					(p.canceled_at && dayjs(p.current_period_end).isAfter(dayjs()))
			),
		[customer?.products]
	);

	const { data: realUsage } = useQuery({
		...orpc.billing.getUsage.queryOptions({
			input: {
				startDate: activeProduct?.current_period_start
					? dayjs(activeProduct.current_period_start).toISOString()
					: undefined,
				endDate: activeProduct?.current_period_end
					? dayjs(activeProduct.current_period_end).toISOString()
					: undefined,
				organizationId: activeOrganization?.id ?? null,
			},
		}),
		enabled: !!customer && !isOrgLoading,
	});

	const isLoading = isCustomerLoading || isPricingLoading;

	const refetch = () => {
		refetchCustomer();
		if (typeof refetchPricing === "function") {
			refetchPricing();
		}
	};

	const usage: Usage = {
		features: customer?.features
			? Object.values(customer.features).map((feature) => {
				const calculated = calculateFeatureUsage(feature);
				const isNegative = (feature.usage ?? 0) < 0;

				if (
					(isNegative || calculated.hasExtraCredits) &&
					feature.name.toLowerCase().includes("event") &&
					realUsage
				) {
					calculated.used = realUsage.totalEvents;
				}
				return calculated;
			})
			: [],
	};

	return {
		products: products ?? [],
		usage,
		customer,
		customerData: customer,
		isLoading,
		error: customerError,
		refetch,
	};
}
