const PLUGIN_ID = "opencode-manual-retry-server"
const STATE_KEY = Symbol.for("opencode.manualRetry.server.state.v4")
const SERVER_COMMAND_PREFIX = "opencode-manual-retry"

function numberFromEnv(name, fallback) {
	const value = Number.parseInt(String(process.env[name] ?? ""), 10)
	return Number.isFinite(value) && value >= 0 ? value : fallback
}

function boolFromEnv(name, fallback) {
	const value = String(process.env[name] ?? "").trim().toLowerCase()
	if (!value) return fallback
	return ["1", "true", "yes", "on"].includes(value)
}

function makeState() {
	const realSetTimeout = globalThis.setTimeout.bind(globalThis)
	const realClearTimeout = globalThis.clearTimeout.bind(globalThis)

	return {
		installed: 0,
		realSetTimeout,
		realClearTimeout,
		patchedSetTimeout: undefined,
		patchedClearTimeout: undefined,
		pending: [],
		timers: new Map(),
		nextID: 1,
		latestSessionID: undefined,
		options: {
			minDelayMs: numberFromEnv("OPENCODE_MANUAL_RETRY_MIN_DELAY_MS", 250),
			matchSkewMs: numberFromEnv("OPENCODE_MANUAL_RETRY_MATCH_SKEW_MS", 2500),
			pendingTtlMs: numberFromEnv("OPENCODE_MANUAL_RETRY_PENDING_TTL_MS", 10000),
			debug: boolFromEnv("OPENCODE_MANUAL_RETRY_DEBUG", false),
		},
	}
}

function state() {
	if (!globalThis[STATE_KEY]) globalThis[STATE_KEY] = makeState()
	return globalThis[STATE_KEY]
}

function debug(...args) {
	const s = state()
	if (s.options.debug) console.warn("[manual-retry]", ...args)
}

function now() {
	return Date.now()
}

function cleanExpired(s = state()) {
	const t = now()
	s.pending = s.pending.filter((item) => !item.used && item.expiresAt > t)
	for (const [id, timer] of s.timers) {
		if (!timer.active) s.timers.delete(id)
	}
}

function shortSession(sessionID) {
	if (!sessionID) return "unknown session"
	if (sessionID.length <= 14) return sessionID
	return `${sessionID.slice(0, 7)}...${sessionID.slice(-4)}`
}

function formatMs(ms) {
	const clamped = Math.max(0, Math.ceil(ms))
	if (clamped < 1000) return `${clamped}ms`
	return `${Math.ceil(clamped / 1000)}s`
}

function addPendingRetry(sessionID, retryStatus) {
	const s = state()
	cleanExpired(s)

	const current = now()
	const waitMs = Math.max(0, Number(retryStatus.next) - current)
	const pending = {
		sessionID,
		attempt: retryStatus.attempt,
		message: retryStatus.message,
		next: Number(retryStatus.next),
		createdAt: current,
		expiresAt: current + Math.max(s.options.pendingTtlMs, waitMs + s.options.matchSkewMs + 1000),
		used: false,
		releaseRequested: false,
	}

	s.pending.push(pending)
	s.latestSessionID = sessionID

	// Bound memory if something unusual publishes many retry events.
	if (s.pending.length > 100) s.pending.splice(0, s.pending.length - 100)

	debug("pending retry", {
		sessionID,
		attempt: retryStatus.attempt,
		waitMs,
		next: retryStatus.next,
	})
}

function removeSession(sessionID) {
	const s = state()
	s.pending = s.pending.filter((item) => item.sessionID !== sessionID)
	if (s.latestSessionID === sessionID) s.latestSessionID = undefined
}

function findPendingForTimeout(delayMs) {
	const s = state()
	cleanExpired(s)

	if (!Number.isFinite(delayMs) || delayMs < s.options.minDelayMs) return undefined

	const due = now() + delayMs
	let best
	let bestSkew = Infinity
	for (const item of s.pending) {
		if (item.used) continue
		const skew = Math.abs(due - item.next)
		if (skew > s.options.matchSkewMs) continue
		if (skew < bestSkew) {
			best = item
			bestSkew = skew
		}
	}
	return best
}

function invokeTimer(timer) {
	const s = state()
	if (!timer.active) return false

	timer.active = false
	s.timers.delete(timer.id)
	try {
		s.realClearTimeout(timer.handle)
	} catch {}

	s.realSetTimeout(() => {
		try {
			timer.callback.apply(globalThis, timer.args)
		} catch (error) {
			s.realSetTimeout(() => {
				throw error
			}, 0)
		}
	}, 0)

	debug("released retry timer", {
		id: timer.id,
		sessionID: timer.sessionID,
		attempt: timer.attempt,
	})

	return true
}

function activeTimers(sessionID) {
	cleanExpired()
	const timers = [...state().timers.values()].filter((timer) => timer.active)
	return sessionID ? timers.filter((timer) => timer.sessionID === sessionID) : timers
}

function allActiveTimers() {
	return activeTimers(undefined)
}

function latestActiveTimer(sessionID) {
	const timers = activeTimers(sessionID)
	timers.sort((a, b) => b.createdAt - a.createdAt)
	return timers[0]
}

function latestPending(sessionID) {
	cleanExpired()
	const list = state().pending.filter((item) => !item.used && (!sessionID || item.sessionID === sessionID))
	list.sort((a, b) => b.createdAt - a.createdAt)
	return list[0]
}

function releaseRetry(sessionID, options = {}) {
	const s = state()
	const allowFallback = options.allowFallback !== false
	const exactTimer = sessionID ? latestActiveTimer(sessionID) : undefined
	const fallbackTimer = exactTimer || !allowFallback ? undefined : latestActiveTimer(undefined)
	const timer = exactTimer ?? fallbackTimer
	if (timer) {
		invokeTimer(timer)
		return { type: "released", timer, fallback: Boolean(sessionID && fallbackTimer) }
	}

	const exactPending = sessionID ? latestPending(sessionID) : undefined
	const fallbackPending = exactPending || !allowFallback ? undefined : latestPending(undefined)
	const pending = exactPending ?? fallbackPending
	if (pending) {
		pending.releaseRequested = true
		return { type: "queued", pending, fallback: Boolean(sessionID && fallbackPending) }
	}

	return { type: "none" }
}

function releaseAllRetries() {
	const timers = activeTimers(undefined)
	let released = 0
	for (const timer of timers) {
		if (invokeTimer(timer)) released++
	}
	for (const item of state().pending) item.releaseRequested = true
	return released
}

function installTimerPatch() {
	const s = state()
	s.installed++
	if (s.patchedSetTimeout && globalThis.setTimeout === s.patchedSetTimeout) return

	s.patchedSetTimeout = function manualRetrySetTimeout(callback, delay, ...args) {
		const delayMs = Number(delay) || 0
		const pending = typeof callback === "function" ? findPendingForTimeout(delayMs) : undefined

		if (!pending) {
			return s.realSetTimeout(callback, delay, ...args)
		}

		pending.used = true
		const id = s.nextID++
		const timer = {
			id,
			sessionID: pending.sessionID,
			attempt: pending.attempt,
			message: pending.message,
			expectedNext: pending.next,
			requestedDelay: delayMs,
			createdAt: now(),
			callback,
			args,
			handle: undefined,
			active: true,
		}

		const wrapped = (...cbArgs) => {
			if (!timer.active) return
			timer.active = false
			s.timers.delete(timer.id)
			return callback.apply(globalThis, cbArgs.length ? cbArgs : args)
		}

		const actualDelay = pending.releaseRequested ? 0 : delay
		timer.handle = s.realSetTimeout(wrapped, actualDelay, ...args)
		s.timers.set(id, timer)
		s.latestSessionID = pending.sessionID

		debug("captured retry timer", {
			id,
			sessionID: pending.sessionID,
			attempt: pending.attempt,
			requestedDelay: delayMs,
			actualDelay,
		})

		return timer.handle
	}

	s.patchedClearTimeout = function manualRetryClearTimeout(handle) {
		for (const [id, timer] of s.timers) {
			if (timer.handle === handle) {
				timer.active = false
				s.timers.delete(id)
				break
			}
		}
		return s.realClearTimeout(handle)
	}

	globalThis.setTimeout = s.patchedSetTimeout
	globalThis.clearTimeout = s.patchedClearTimeout
	debug("timer patch installed")
}

function uninstallTimerPatch() {
	const s = state()
	s.installed = Math.max(0, s.installed - 1)
	if (s.installed > 0) return

	if (globalThis.setTimeout === s.patchedSetTimeout) globalThis.setTimeout = s.realSetTimeout
	if (globalThis.clearTimeout === s.patchedClearTimeout) globalThis.clearTimeout = s.realClearTimeout
	s.patchedSetTimeout = undefined
	s.patchedClearTimeout = undefined
	s.pending = []
	s.timers.clear()
	debug("timer patch uninstalled")
}

function parseServerCommand(command) {
	const raw = String(command ?? "").trim()
	if (!raw.startsWith(SERVER_COMMAND_PREFIX)) return undefined

	const rest = raw.slice(SERVER_COMMAND_PREFIX.length).replace(/^[:\s]+/, "")
	const [action = "now", sessionID, routeSessionID, scope] = rest.split(/[:\s]+/).filter(Boolean)
	return { action, sessionID, routeSessionID, scope }
}

async function showToast(client, message, variant = "info", title = "Retry Now") {
	try {
		await client.tui.showToast({
			body: {
				title,
				message,
				variant,
				duration: 3500,
			},
		})
	} catch {
		// Non-TUI contexts are valid; keep retry control functional.
	}
}

function statusMessage(sessionID, options = {}) {
	cleanExpired()

	const allowFallback = options.allowFallback !== false
	const requested = sessionID ? shortSession(sessionID) : undefined
	const timers = activeTimers(sessionID)
	if (timers.length > 0) {
		const timer = timers.sort((a, b) => a.expectedNext - b.expectedNext)[0]
		return `Active retry wait for ${shortSession(timer.sessionID)}; due in ${formatMs(timer.expectedNext - now())}.`
	}

	const pending = latestPending(sessionID)
	if (pending) {
		return `Retry observed for ${shortSession(pending.sessionID)}; waiting for scheduler timer capture.`
	}

	if (sessionID && allowFallback) {
		const globalTimers = allActiveTimers()
		if (globalTimers.length > 0) {
			const timer = globalTimers.sort((a, b) => a.expectedNext - b.expectedNext)[0]
			return `No retry captured for current session ${requested}; active retry exists for ${shortSession(timer.sessionID)} due in ${formatMs(timer.expectedNext - now())}. /retry-now will release it by fallback.`
		}

		const globalPending = latestPending(undefined)
		if (globalPending) {
			return `No retry captured for current session ${requested}; retry observed for ${shortSession(globalPending.sessionID)} and waiting for scheduler timer capture.`
		}
	}

	return "No active retry wait is currently captured."
}

async function handleServerCommand(command, client) {
	const parsed = parseServerCommand(command)
	if (!parsed) return false

	if (parsed.action === "status" || parsed.action === "status-global") {
		await showToast(client, statusMessage(parsed.sessionID, { allowFallback: true }), "info")
		return true
	}

	if (parsed.action === "status-strict") {
		const prefix = parsed.scope === "descendant" && parsed.routeSessionID
			? `Resolved retrying descendant ${shortSession(parsed.sessionID)} for current session ${shortSession(parsed.routeSessionID)}. `
			: parsed.scope === "current"
				? `Resolved current retrying session ${shortSession(parsed.sessionID)}. `
				: parsed.scope
					? `Resolved retrying session ${shortSession(parsed.sessionID)} (${parsed.scope}). `
					: ""
		await showToast(client, prefix + statusMessage(parsed.sessionID, { allowFallback: false }), "info")
		return true
	}

	if (parsed.action === "all") {
		const count = releaseAllRetries()
		await showToast(client, count > 0 ? `Released ${count} retry wait(s).` : "No captured retry wait to release.", count > 0 ? "success" : "warning")
		return true
	}

	const strict = parsed.action === "now-strict"
	const result = releaseRetry(parsed.sessionID, { allowFallback: !strict })
	if (result.type === "released") {
		const resolved = parsed.scope === "descendant" && parsed.routeSessionID
			? ` for descendant ${shortSession(result.timer.sessionID)} of ${shortSession(parsed.routeSessionID)}`
			: ` for ${shortSession(result.timer.sessionID)}`
		await showToast(client, `Retrying now${resolved}${result.fallback ? " (fallback from current session)" : ""}.`, "success")
		return true
	}
	if (result.type === "queued") {
		const resolved = parsed.scope === "descendant" && parsed.routeSessionID
			? ` for descendant ${shortSession(result.pending.sessionID)} of ${shortSession(parsed.routeSessionID)}`
			: ` for ${shortSession(result.pending.sessionID)}`
		await showToast(client, `Retry release queued${resolved}${result.fallback ? " (fallback from current session)" : ""}.`, "success")
		return true
	}

	await showToast(client, "No captured retry wait to release.", "warning")
	return true
}

export default async () => ({
	id: PLUGIN_ID,
	server: async ({ client }) => {
		installTimerPatch()

		return {
			event: async ({ event }) => {
				if (event.type === "session.status") {
					const sessionID = event.properties?.sessionID
					const status = event.properties?.status
					if (typeof sessionID === "string" && status?.type === "retry" && typeof status.next === "number") {
						addPendingRetry(sessionID, status)
					} else if (typeof sessionID === "string" && status?.type !== "retry") {
						removeSession(sessionID)
					}
					return
				}

				if (event.type === "tui.command.execute") {
					await handleServerCommand(event.properties?.command, client)
				}
			},

			dispose: async () => {
				uninstallTimerPatch()
			},
		}
	},
})
