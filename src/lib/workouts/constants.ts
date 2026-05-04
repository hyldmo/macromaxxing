import type { SetType } from '@macromaxxing/db'

/** Tailwind bg + text classes per set type (badges, pills). */
export const SET_TYPE_STYLES: Record<SetType, string> = {
	warmup: 'bg-macro-carbs/15 text-macro-carbs',
	working: 'bg-macro-protein/15 text-macro-protein',
	backoff: 'bg-macro-fat/15 text-macro-fat'
}

/** CSS custom-property colors per set type (SVG strokes). */
export const SET_TYPE_COLORS: Record<SetType, string> = {
	warmup: 'var(--color-macro-carbs)',
	working: 'var(--color-macro-protein)',
	backoff: 'var(--color-macro-fat)'
}
