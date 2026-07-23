const PLUGIN_ID = "opencode-manual-retry-tui-v4"
const SERVER_COMMAND_PREFIX = "opencode-manual-retry"

function unwrap(response) {
	if (response && typeof response === "object" && "data" in response) return response.data
	return response
}

function currentSessionID(api) {
	const route = api.route.current
	if (route?.name !== "session") return undefined
	const value = route.params?.sessionID
	return typeof value === "string" && value.length > 0 ? value : undefined
}

function shortSession(sessionID) {
	if (!sessionID) return "unknown"
	if (sessionID.length <= 14) return sessionID
	return `${sessionID.slice(0, 7)}...${sessionID.slice(-4)}`
}

function formatMs(ms) {
	const clamped = Math.max(0, Math.ceil(ms))
	if (clamped < 1000) return `${clamped}ms`
	return `${Math.ceil(clamped / 1000)}s`
}

async function sessionStatusMap(client) {
	if (client?.session?.status) return unwrap(await client.session.status()) ?? {}
	if (client?.v2?.session?.status) return unwrap(await client.v2.session.status()) ?? {}
	return {}
}

async function getSession(client, sessionID) {
	if (client?.session?.get) {
		try {
			return unwrap(await client.session.get({ sessionID }))
		} catch {}
		try {
			return unwrap(await client.session.get({ path: { id: sessionID } }))
		} catch {}
	}
	if (client?.v2?.session?.get) {
		try {
			return unwrap(await client.v2.session.get({ sessionID }))
		} catch {}
	}
	return undefined
}

async function isDescendantOf(client, sessionID, ancestorID, cache) {
	if (!sessionID || !ancestorID || sessionID === ancestorID) return false

	let current = sessionID
	const seen = new Set()
	for (let depth = 0; depth < 16; depth++) {
		if (!current || seen.has(current)) return false
		seen.add(current)

		let info = cache.get(current)
		if (!info) {
			info = await getSession(client, current)
			if (!info) return false
			cache.set(current, info)
		}

		const parentID = info.parentID
		if (parentID === ancestorID) return true
		current = parentID
	}
	return false
}

function retryEntries(statuses) {
	return Object.entries(statuses ?? {})
		.filter(([, status]) => status?.type === "retry")
		.map(([sessionID, status]) => ({ sessionID, status }))
		.sort((a, b) => Number(a.status.next ?? 0) - Number(b.status.next ?? 0))
}

async function resolveRetryTarget(api) {
	const routeSessionID = currentSessionID(api)
	const statuses = await sessionStatusMap(api.client)
	const retries = retryEntries(statuses)

	if (routeSessionID && statuses?.[routeSessionID]?.type === "retry") {
		return {
			ok: true,
			sessionID: routeSessionID,
			routeSessionID,
			scope: "current",
			status: statuses[routeSessionID],
			retries,
		}
	}

	if (routeSessionID && retries.length > 0) {
		const cache = new Map()
		const descendants = []
		for (const item of retries) {
			if (await isDescendantOf(api.client, item.sessionID, routeSessionID, cache)) {
				descendants.push(item)
			}
		}

		if (descendants.length === 1) {
			return {
				ok: true,
				sessionID: descendants[0].sessionID,
				routeSessionID,
				scope: "descendant",
				status: descendants[0].status,
				retries,
			}
		}

		if (descendants.length > 1) {
			return {
				ok: false,
				reason: "multiple-descendants",
				routeSessionID,
				retries: descendants,
			}
		}
	}

	if (retries.length === 1) {
		return {
			ok: true,
			sessionID: retries[0].sessionID,
			routeSessionID,
			scope: routeSessionID ? "only-other" : "only",
			status: retries[0].status,
			retries,
		}
	}

	if (retries.length > 1) {
		return {
			ok: false,
			reason: "multiple-global",
			routeSessionID,
			retries,
		}
	}

	return {
		ok: false,
		reason: "none",
		routeSessionID,
		retries,
	}
}

function ambiguousMessage(result) {
	const list = (result.retries ?? [])
		.slice(0, 5)
		.map((item) => `${shortSession(item.sessionID)} due in ${formatMs(Number(item.status?.next ?? Date.now()) - Date.now())}`)
		.join(", ")

	if (result.reason === "multiple-descendants") {
		return `Multiple descendant sessions are retrying under current session ${shortSession(result.routeSessionID)}: ${list}. Use Retry now: all sessions or switch to the exact child session.`
	}

	if (result.reason === "multiple-global") {
		return `Multiple sessions are retrying: ${list}. Use Retry now: all sessions or switch to the exact session.`
	}

	return "No retrying session found from /session/status."
}

async function publishServerCommand(api, action, target) {
	const command = [
		SERVER_COMMAND_PREFIX,
		action,
		target?.sessionID,
		target?.routeSessionID,
		target?.scope,
	]
		.filter(Boolean)
		.join(" ")

	await api.client.tui.publish({
		body: {
			type: "tui.command.execute",
			properties: { command },
		},
	})
}

async function send(api, action) {
	try {
		if (action === "all") {
			await publishServerCommand(api, "all", undefined)
			return
		}

		const target = await resolveRetryTarget(api)

		if (!target.ok) {
			if (action === "status") {
				await publishServerCommand(api, "status-global", undefined)
			}
			api.ui.toast({
				title: "Retry Now",
				message: ambiguousMessage(target),
				variant: target.reason === "none" ? "warning" : "error",
				duration: 6500,
			})
			return
		}

		await publishServerCommand(api, action === "status" ? "status-strict" : "now-strict", target)
	} catch (error) {
		api.ui.toast({
			title: "Retry Now",
			message: error instanceof Error ? error.message : String(error),
			variant: "error",
			duration: 5000,
		})
	}
}

export default async () => ({
	id: PLUGIN_ID,
	tui: async (api) => {
		api.keymap.registerLayer({
			commands: [
				{
					name: "manual-retry.now",
					title: "Retry now",
					desc: "Immediately release the OpenCode retry countdown for the current retrying session.",
					category: "Session",
					namespace: "palette",
					slashName: "retry-now",
					slashAliases: ["retry"],
					run() {
						void send(api, "now")
					},
				},
				{
					name: "manual-retry.status",
					title: "Retry status",
					desc: "Show the resolved retry session and whether its timer is captured.",
					category: "Session",
					namespace: "palette",
					slashName: "retry-status",
					run() {
						void send(api, "status")
					},
				},
				{
					name: "manual-retry.all",
					title: "Retry now: all sessions",
					desc: "Release every captured retry countdown in this OpenCode process.",
					category: "Session",
					namespace: "palette",
					slashName: "retry-now-all",
					hidden: true,
					run() {
						void send(api, "all")
					},
				},
			],
		})
	},
})
