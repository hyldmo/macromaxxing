import type { WeekStart } from '@macromaxxing/db'

export function getISOWeek(timestamp: number): number {
	const date = new Date(timestamp)
	const thursday = new Date(date)
	thursday.setDate(date.getDate() + (4 - (date.getDay() || 7)))
	const jan1 = new Date(thursday.getFullYear(), 0, 1)
	return Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
}

export function formatDate(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDuration(start: number, end: number | null): string {
	if (!end) return 'in progress'
	const mins = Math.round((end - start) / 60000)
	if (mins < 60) return `${mins}m`
	return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Local-time midnight of the Monday starting the week that contains `ts`. */
export function getWeekStart(ts: number): number {
	const d = new Date(ts)
	const day = d.getDay()
	const diff = d.getDate() - day + (day === 0 ? -6 : 1)
	d.setDate(diff)
	d.setHours(0, 0, 0, 0)
	return d.getTime()
}

/** `YYYY-MM-DD` for a timestamp, in local time — `toISOString` would shift it across the UTC date line. */
export function toDateKey(ts: number): WeekStart {
	const d = new Date(ts)
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${d.getFullYear()}-${month}-${day}`
}

/** Local midnight of a `YYYY-MM-DD` key — `new Date(key)` parses it as UTC and lands a day early west of it. */
export function fromDateKey(key: WeekStart): number {
	const [year, month, day] = key.split('-').map(Number)
	return new Date(year, month - 1, day).getTime()
}

/** The `mealPlans.weekStart` key for the week containing `ts`. */
export function getWeekStartDate(ts: number): WeekStart {
	return toDateKey(getWeekStart(ts))
}

/** Format seconds as a clock display: M:SS.CC or H:MM:SS.CC, with centiseconds by default */
export function formatTimer(seconds: number, opts?: { subseconds?: boolean }): string {
	const sign = seconds < 0 ? '-' : ''
	const abs = Math.abs(seconds)
	const h = Math.floor(abs / 3600)
	const m = Math.floor((abs % 3600) / 60)
	const s = Math.floor(abs % 60)
	const hm = h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m}`
	const base = `${sign}${hm}:${s.toString().padStart(2, '0')}`
	if (opts?.subseconds === false) return base
	const cs = Math.floor((abs * 100) % 100)
	return `${base}.${cs.toString().padStart(2, '0')}`
}

export function formatAgo(ts: number): string {
	const d = new Date(ts)
	const now = new Date()
	const isToday = d.toDateString() === now.toDateString()
	const isThisWeek = getWeekStart(ts) === getWeekStart(now.getTime())
	if (isToday) return formatTime(ts)
	if (isThisWeek) return d.toLocaleDateString(undefined, { weekday: 'short' })
	return `${formatDate(ts)} ${formatTime(ts)}`
}

/**
 * Compact relative-time formatter for "X ago" hints.
 * `today` for <24h, `Nd ago` for <14d, `Nw ago` for <8w, `Nmo ago` for <365d, else `Ny ago`.
 * Negative, zero, or non-finite deltas (future / now / NaN) collapse to `today`.
 */
export function formatRecency(ageMs: number): string {
	if (!Number.isFinite(ageMs) || ageMs < 86_400_000) return 'today'
	const days = Math.floor(ageMs / 86_400_000)
	if (days < 14) return `${days}d ago`
	const weeks = Math.floor(days / 7)
	if (weeks < 8) return `${weeks}w ago`
	if (days < 365) return `${Math.floor(days / 30)}mo ago`
	return `${Math.floor(days / 365)}y ago`
}
