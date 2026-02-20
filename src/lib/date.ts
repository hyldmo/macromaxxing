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

export function formatAgo(ts: number): string {
	const d = new Date(ts)
	const now = new Date()
	const isToday = d.toDateString() === now.toDateString()
	const isThisWeek = getWeekStart(ts) === getWeekStart(now.getTime())
	if (isToday) return formatTime(ts)
	if (isThisWeek) return d.toLocaleDateString(undefined, { weekday: 'short' })
	return `${formatDate(ts)} ${formatTime(ts)}`
}
