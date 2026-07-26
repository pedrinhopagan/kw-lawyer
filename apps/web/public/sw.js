const CACHE_VERSION = "__KW_LAWYER_SW_VERSION__";
const SHELL_CACHE = "kw-lawyer-shell-" + CACHE_VERSION;
const ASSET_CACHE = "kw-lawyer-assets-" + CACHE_VERSION;

const SHELL_URL = "/index.html";
const ASSET_PREFIX = "/assets/";
const ICON_PREFIX = "/icons/";

// O cache guarda o shell, nunca o dado. Abrir o app sem sinal no corredor do fórum mostraria a
// agenda, mas isso significaria gravar processo em disco de celular, e essa troca não é herdada de
// uma decisão de cache.
const NEVER_CACHE_PREFIXES = ["/orpc", "/auth"];

const PRECACHE = [SHELL_URL, "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", function onInstall(event) {
	event.waitUntil(
		Promise.all(
			PRECACHE.map(function precacheOne(url) {
				return fetch(url, { cache: "reload" })
					.then(function store(response) {
						if (!response.ok) {
							return;
						}

						return caches
							.open(url === SHELL_URL ? SHELL_CACHE : ASSET_CACHE)
							.then(function put(cache) {
								return cache.put(url, response);
							});
					})
					.catch(function ignoreFailure() {});
			}),
		).then(function activateNow() {
			return self.skipWaiting();
		}),
	);
});

self.addEventListener("activate", function onActivate(event) {
	event.waitUntil(
		caches
			.keys()
			.then(function pruneStale(names) {
				return Promise.all(
					names
						.filter(function isStale(name) {
							if (!name.startsWith("kw-lawyer-")) {
								return false;
							}

							return name !== SHELL_CACHE && name !== ASSET_CACHE;
						})
						.map(function drop(name) {
							return caches.delete(name);
						}),
				);
			})
			.then(function claimClients() {
				return self.clients.claim();
			}),
	);
});

self.addEventListener("fetch", function onFetch(event) {
	if (event.request.method !== "GET") {
		return;
	}

	const url = new URL(event.request.url);

	if (url.origin !== self.location.origin) {
		return;
	}

	if (
		NEVER_CACHE_PREFIXES.some(function matches(prefix) {
			return url.pathname.startsWith(prefix);
		})
	) {
		return;
	}

	if (url.pathname.startsWith(ASSET_PREFIX) || url.pathname.startsWith(ICON_PREFIX)) {
		event.respondWith(cacheFirst(event.request));
		return;
	}

	if (
		event.request.mode === "navigate" ||
		(event.request.headers.get("accept") || "").includes("text/html")
	) {
		event.respondWith(shellNetworkFirst(event.request));
	}
});

self.addEventListener("push", function onPush(event) {
	let payload = {};

	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = {};
	}

	const title = typeof payload.title === "string" ? payload.title : "kw-lawyer";
	const body = typeof payload.body === "string" ? payload.body : "Novidade no seu acompanhamento.";
	const url = typeof payload.url === "string" ? payload.url : "/agenda";
	const tag = typeof payload.tag === "string" ? payload.tag : "kw-lawyer";

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			tag,
			renotify: true,
			icon: "/icons/icon-192.png",
			badge: "/icons/badge-96.png",
			data: { url },
		}),
	);
});

self.addEventListener("notificationclick", function onNotificationClick(event) {
	event.notification.close();

	const target = new URL(
		(event.notification.data && event.notification.data.url) || "/agenda",
		self.location.origin,
	);

	if (target.origin !== self.location.origin) {
		target.pathname = "/agenda";
		target.search = "";
		target.hash = "";
	}

	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then(function focusOrOpen(clients) {
				const existing = clients.find(function sameOrigin(client) {
					return new URL(client.url).origin === self.location.origin;
				});

				if (existing) {
					return existing.navigate(target.href).then(function focusClient() {
						return existing.focus();
					});
				}

				return self.clients.openWindow(target.href);
			}),
	);
});

function cacheFirst(request) {
	return caches.open(ASSET_CACHE).then(function readCache(cache) {
		return cache.match(request).then(function useCached(cached) {
			if (!cached) {
				return fetch(request).then(function storeAndReturn(response) {
					if (response.ok) {
						cache.put(request, response.clone());
					}

					return response;
				});
			}

			return cached;
		});
	});
}

function shellNetworkFirst(request) {
	return fetch(request)
		.then(function useNetwork(response) {
			if (!response.ok) {
				return fallbackToShell();
			}

			return caches.open(SHELL_CACHE).then(function storeShell(cache) {
				cache.put(SHELL_URL, response.clone());

				return response;
			});
		})
		.catch(fallbackToShell);
}

function fallbackToShell() {
	return caches.open(SHELL_CACHE).then(function readShell(cache) {
		return cache.match(SHELL_URL).then(function useShell(cached) {
			if (!cached) {
				return Response.error();
			}

			return cached;
		});
	});
}
