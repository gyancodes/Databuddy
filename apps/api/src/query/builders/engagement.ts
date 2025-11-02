import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

export const EngagementBuilders: Record<string, SimpleQueryConfig> = {
	scroll_depth_summary: {
		meta: {
			title: "Scroll Depth Summary",
			description:
				"Average scroll depth metrics showing how far users scroll on pages.",
			category: "Engagement",
			tags: ["scroll", "engagement", "user behavior"],
			output_fields: [
				{
					name: "avg_scroll_depth",
					type: "number",
					label: "Average Scroll Depth",
					description: "Average percentage of page scrolled",
					unit: "%",
				},
				{
					name: "total_sessions",
					type: "number",
					label: "Total Sessions",
					description: "Total sessions with scroll data",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth * 100 ELSE NULL END), 1) as avg_scroll_depth",
			"COUNT(DISTINCT session_id) as total_sessions",
			"COUNT(DISTINCT anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'", "scroll_depth > 0"],
		timeField: "time",
		customizable: true,
	},

	scroll_depth_distribution: {
		meta: {
			title: "Scroll Depth Distribution",
			description:
				"Breakdown of users by how far they scroll on pages, grouped into ranges.",
			category: "Engagement",
			tags: ["scroll", "distribution", "engagement"],
			output_fields: [
				{
					name: "depth_range",
					type: "string",
					label: "Scroll Range",
					description: "Percentage range of page scrolled",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors in this range",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Sessions in this range",
				},
				{
					name: "percentage",
					type: "number",
					label: "Share",
					description: "Percentage of total sessions",
					unit: "%",
				},
			],
			default_visualization: "bar",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"CASE " +
				'WHEN scroll_depth < 0.25 THEN "0-25%" ' +
				'WHEN scroll_depth < 0.5 THEN "25-50%" ' +
				'WHEN scroll_depth < 0.75 THEN "50-75%" ' +
				'WHEN scroll_depth < 1.0 THEN "75-100%" ' +
				'ELSE "100%" ' +
				"END as depth_range",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"COUNT(DISTINCT session_id) as sessions",
			"ROUND((COUNT(DISTINCT session_id) / SUM(COUNT(DISTINCT session_id)) OVER()) * 100, 2) as percentage",
		],
		where: ["event_name = 'screen_view'", "scroll_depth > 0"],
		groupBy: ["depth_range"],
		orderBy:
			'CASE depth_range WHEN "0-25%" THEN 1 WHEN "25-50%" THEN 2 WHEN "50-75%" THEN 3 WHEN "75-100%" THEN 4 ELSE 5 END',
		timeField: "time",
		customizable: true,
	},

	page_scroll_performance: {
		meta: {
			title: "Page Scroll Performance",
			description:
				"Average scroll depth by page, showing which pages engage users most effectively.",
			category: "Engagement",
			tags: ["pages", "scroll", "performance"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Page Path",
					description: "The page URL path",
				},
				{
					name: "avg_scroll_depth",
					type: "number",
					label: "Avg Scroll Depth",
					description: "Average scroll depth percentage",
					unit: "%",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors to this page",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Sessions on this page",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"trimRight(path(path), '/') as name",
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth * 100 ELSE NULL END), 1) as avg_scroll_depth",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"COUNT(DISTINCT session_id) as sessions",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "path != ''", "scroll_depth > 0"],
		groupBy: ["trimRight(path(path), '/')"],
		orderBy: "avg_scroll_depth DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
		],
		customizable: true,
	},

	interaction_summary: {
		meta: {
			title: "Interaction Summary",
			description:
				"Summary of user interactions including click, scroll, and keyboard events.",
			category: "Engagement",
			tags: ["interactions", "engagement", "user behavior"],
			output_fields: [
				{
					name: "avg_interactions",
					type: "number",
					label: "Average Interactions",
					description: "Average number of interactions per session",
				},
				{
					name: "interactive_sessions",
					type: "number",
					label: "Interactive Sessions",
					description: "Sessions with at least one interaction",
				},
				{
					name: "interaction_rate",
					type: "number",
					label: "Interaction Rate",
					description: "Percentage of sessions with interactions",
					unit: "%",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN interaction_count >= 0 THEN interaction_count ELSE NULL END), 1) as avg_interactions",
			"COUNT(DISTINCT CASE WHEN interaction_count > 0 THEN session_id ELSE NULL END) as interactive_sessions",
			"ROUND((COUNT(DISTINCT CASE WHEN interaction_count > 0 THEN session_id ELSE NULL END) / COUNT(DISTINCT session_id)) * 100, 1) as interaction_rate",
			"COUNT(DISTINCT session_id) as total_sessions",
		],
		where: ["event_name = 'screen_view'", "interaction_count >= 0"],
		timeField: "time",
		customizable: true,
	},
};
