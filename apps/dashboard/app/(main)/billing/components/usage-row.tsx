"use client";

import {
	ChartBarIcon,
	ClockIcon,
	DatabaseIcon,
	GiftIcon,
	LightningIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	type FeatureUsage,
	formatCompactNumber,
	getResetText,
} from "../utils/feature-usage";

const FEATURE_ICONS: Record<string, typeof ChartBarIcon> = {
	event: ChartBarIcon,
	storage: DatabaseIcon,
	user: UsersIcon,
	member: UsersIcon,
	message: ChartBarIcon,
	website: ChartBarIcon,
};

function getFeatureIcon(name: string): typeof ChartBarIcon {
	const lowercaseName = name.toLowerCase();
	for (const [key, Icon] of Object.entries(FEATURE_ICONS)) {
		if (lowercaseName.includes(key)) {
			return Icon;
		}
	}
	return ChartBarIcon;
}

type UsageRowProps = {
	feature: FeatureUsage;
};

export const UsageRow = memo(function UsageRowComponent({
	feature,
}: UsageRowProps) {
	const percentage = feature.unlimited
		? 0
		: feature.limit > 0
			? Math.min((feature.used / feature.limit) * 100, 100)
			: 0;

	const isNearLimit =
		!(feature.unlimited || feature.hasExtraCredits) &&
		(percentage > 80 || feature.balance < feature.limit * 0.2);

	const isOverLimit =
		!feature.unlimited && (percentage >= 100 || feature.balance <= 0);

	const Icon = getFeatureIcon(feature.name);
	const resetText = getResetText(feature);

	return (
		<div className="px-5 py-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-background">
						<Icon
							className="text-muted-foreground"
							size={18}
							weight="duotone"
						/>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="font-medium">{feature.name}</span>
							{feature.hasExtraCredits && (
								<Badge
									className="bg-primary/10 text-primary"
									variant="secondary"
								>
									<GiftIcon className="mr-1" size={10} />
									Bonus
								</Badge>
							)}
						</div>
						<div className="flex items-center gap-1 text-muted-foreground text-sm">
							<ClockIcon size={12} />
							{resetText}
						</div>
					</div>
				</div>
				{feature.unlimited ? (
					<Badge variant="secondary">
						<LightningIcon className="mr-1" size={12} />
						Unlimited
					</Badge>
				) : (
					<span
						className={cn(
							"font-mono text-base",
							isOverLimit
								? "text-destructive"
								: isNearLimit
									? "text-warning"
									: "text-foreground"
						)}
					>
						{formatCompactNumber(feature.used)} /{" "}
						{formatCompactNumber(feature.limit)}
					</span>
				)}
			</div>

			{!feature.unlimited && (
				<div className="flex items-center gap-3">
					<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							className={cn(
								"h-full transition-all",
								feature.hasExtraCredits
									? "bg-primary"
									: isOverLimit
										? "bg-destructive"
										: isNearLimit
											? "bg-warning"
											: "bg-primary"
							)}
							style={{ width: `${percentage}%` }}
						/>
					</div>
					{isNearLimit && (
						<Link
							className="shrink-0 font-medium text-primary text-sm hover:underline"
							href="/billing/plans"
						>
							Upgrade
						</Link>
					)}
				</div>
			)}
		</div>
	);
});
