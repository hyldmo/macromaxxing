import { extractPreparation } from '@macromaxxing/db'
import { startCase } from 'es-toolkit'

/** Normalize an ingredient name: extract preparation (discard it) + Start Case */
export const normalizeIngredientName = (name: string): string => startCase(extractPreparation(name).name)
