export function getISOWeek(timestamp: number): number {
	const date = new Date(timestamp)
	const thursday = new Date(date)
	thursday.setDate(date.getDate() + (4 - (date.getDay() || 7)))
	const jan1 = new Date(thursday.getFullYear(), 0, 1)
	return Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
}
