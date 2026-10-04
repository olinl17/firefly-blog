const CACHE_KEYS = {
	share: "umami-profile-share",
	metrics: "umami-pv-metrics",
};
const TTL: { share: number; metrics: number } = {
	share: 24 * 60 * 60 * 1000,
	metrics: 5 * 60 * 1000,
};

interface UmamiShareData {
	token: string;
	websiteId: string;
}

interface UmamiMetricsRow {
	x: string;
	y: number;
}

function getCache(key: string, ttl: number): unknown | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { ts: number; val: unknown };
		return Date.now() - parsed.ts < ttl ? parsed.val : null;
	} catch {
		return null;
	}
}

function setCache(key: string, val: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify({ ts: Date.now(), val }));
	} catch {
		/* 存储满等异常静默忽略 */
	}
}

async function fetchUmamiViews(
	apiBase: string,
	shareId: string,
): Promise<void> {
	try {
		let shareData = getCache(
			CACHE_KEYS.share,
			TTL.share,
		) as UmamiShareData | null;
		if (!shareData) {
			const res = await fetch(`${apiBase}/api/share/${shareId}`);
			if (!res.ok) return;
			shareData = (await res.json()) as UmamiShareData;
			setCache(CACHE_KEYS.share, shareData);
		}

		let rows = getCache(CACHE_KEYS.metrics, TTL.metrics) as
			| UmamiMetricsRow[]
			| null;
		if (!rows) {
			const res = await fetch(
				`${apiBase}/api/websites/${shareData.websiteId}/metrics?startAt=0&endAt=${Date.now()}&type=path&limit=1000`,
				{
					headers: {
						"x-umami-share-token": shareData.token,
						"x-umami-share-context": "1",
					},
				},
			);
			if (!res.ok) return;
			rows = (await res.json()) as UmamiMetricsRow[];
			setCache(CACHE_KEYS.metrics, rows);
		}

		const lookup = new Map(rows.map((r) => [r.x, r.y]));
		document.querySelectorAll("[data-umami-pv-value]").forEach((el) => {
			const container = el.closest("[data-umami-pv-path]");
			const path = container?.getAttribute("data-umami-pv-path");
			if (!path) {
				el.textContent = "0";
				return;
			}
			// 兼容末尾是否有斜杠，避免 trailingSlash 配置导致匹配失败
			const count =
				lookup.get(path) ??
				lookup.get(path.replace(/\/$/, "")) ??
				lookup.get(`${path}/`) ??
				0;
			el.textContent = count.toLocaleString();
		});
	} catch {
		// 网络错误 / JSON 解析失败等，保留默认文案
	}
}

function initUmamiViews(): void {
	document.querySelectorAll("[data-umami-pv-path]").forEach((container) => {
		const apiBase = container.getAttribute("data-umami-api-base");
		const shareId = container.getAttribute("data-umami-share-id");
		if (apiBase && shareId) {
			fetchUmamiViews(apiBase, shareId);
		}
	});
}

if (!window.__umamiViewsInit) {
	window.__umamiViewsInit = true;
	initUmamiViews();
	document.addEventListener("astro:page-load", initUmamiViews);
	document.addEventListener("swup:contentReplaced", initUmamiViews);
}
