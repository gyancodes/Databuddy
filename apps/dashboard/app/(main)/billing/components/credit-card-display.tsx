"use client";

import { CreditCardIcon, WifiHighIcon } from "@phosphor-icons/react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import type { CustomerWithPaymentMethod } from "../types/billing";

type CreditCardDisplayProps = {
	customer: CustomerWithPaymentMethod | null;
};

export function CreditCardDisplay({ customer }: CreditCardDisplayProps) {
	const [showCardDetails, setShowCardDetails] = usePersistentState<boolean>(
		"billing-card-details-visible",
		true
	);

	const paymentMethod = customer?.payment_method;
	const card = paymentMethod?.card;

	if (!card) {
		return (
			<div className="flex aspect-[1.586/1] w-full flex-col items-center justify-center rounded-xl border border-dashed bg-background">
				<CreditCardIcon
					className="mb-2 text-muted-foreground"
					size={28}
					weight="duotone"
				/>
				<span className="text-muted-foreground text-sm">No payment method</span>
			</div>
		);
	}

	const cardHolder =
		paymentMethod?.billing_details?.name || customer?.name || "CARD HOLDER";
	const last4 = card.last4 || "****";
	const expMonth = card.exp_month?.toString().padStart(2, "0") || "00";
	const expYear = card.exp_year?.toString().slice(-2) || "00";
	const cardNumber = `•••• •••• •••• ${last4}`;
	const expiration = `${expMonth}/${expYear}`;
	const brand = (card.brand || "card").toLowerCase();

	return (
		<div className="relative aspect-[1.586/1] w-full">
			<div
				className={cn(
					"absolute inset-0 flex flex-col justify-between overflow-hidden rounded-xl p-4",
					"bg-linear-to-tr from-foreground to-foreground/80",
					"before:pointer-events-none before:absolute before:inset-0 before:z-1 before:rounded-[inherit] before:ring-1 before:ring-white/20 before:ring-inset"
				)}
			>
				<div className="relative z-2 flex items-start justify-between">
					<WifiHighIcon
						className="rotate-90 text-white/80"
						size={20}
						weight="bold"
					/>
					<span className="font-semibold text-white/60 text-xs uppercase tracking-wider">
						{brand}
					</span>
				</div>

				<div className="relative z-2 flex flex-col gap-2">
					{showCardDetails ? (
						<>
							<div className="flex items-end gap-2">
								<p className="font-semibold text-white/80 text-xs uppercase tracking-wide">
									{cardHolder}
								</p>
								<p className="ml-auto font-semibold text-white/80 text-xs tabular-nums">
									{expiration}
								</p>
							</div>
							<div className="flex items-end justify-between gap-3">
								<button
									aria-label="Hide card details"
									className="cursor-pointer font-semibold text-white tabular-nums tracking-wider transition-opacity hover:opacity-80"
									onClick={() => setShowCardDetails(false)}
									type="button"
								>
									{cardNumber}
								</button>
								<CardBrandLogo brand={brand} />
							</div>
						</>
					) : (
						<>
							<div className="flex items-end gap-2">
								<p className="font-semibold text-white/40 text-xs uppercase tracking-wide">
									•••• ••••
								</p>
								<p className="ml-auto font-semibold text-white/40 text-xs tabular-nums">
									••/••
								</p>
							</div>
							<div className="flex items-end justify-between gap-3">
								<button
									aria-label="Show card details"
									className="cursor-pointer font-semibold text-white/40 tabular-nums tracking-wider transition-opacity hover:opacity-80"
									onClick={() => setShowCardDetails(true)}
									type="button"
								>
									•••• •••• •••• ••••
								</button>
								<CardBrandLogo brand={brand} />
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function CardBrandLogo({ brand }: { brand: string }) {
	if (brand === "visa") {
		return (
			<div className="flex h-6 w-10 items-center justify-center rounded bg-white/10 font-bold text-white text-xs italic">
				VISA
			</div>
		);
	}
	if (brand === "mastercard") {
		return (
			<div className="flex h-6 w-10 items-center justify-center">
				<div className="relative flex">
					<div className="h-5 w-5 rounded-full bg-red-500/90" />
					<div className="-ml-2 h-5 w-5 rounded-full bg-yellow-500/90" />
				</div>
			</div>
		);
	}
	if (brand === "amex") {
		return (
			<div className="flex h-6 w-10 items-center justify-center rounded bg-white/10 font-bold text-[8px] text-white">
				AMEX
			</div>
		);
	}
	return (
		<div className="flex h-6 w-10 items-center justify-center rounded bg-white/10">
			<CreditCardIcon className="text-white/80" size={16} weight="duotone" />
		</div>
	);
}
