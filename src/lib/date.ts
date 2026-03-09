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

function getWeekStart(ts: number): number {
	const d = new Date(ts)
	const day = d.getDay()
	const diff = d.getDate() - day + (day === 0 ? -6 : 1)
	d.setDate(diff)
	d.setHours(0, 0, 0, 0)
	return d.getTime()
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
