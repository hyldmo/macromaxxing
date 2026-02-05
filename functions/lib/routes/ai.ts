import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'
import { getDecryptedApiKey } from './settings'

const macroResultSchema = z.object({
	protein: z.number(),
	carbs: z.number(),
	fat: z.number(),
	kcal: z.number(),
	fiber: z.number()
})

const systemPrompt = `You are a nutrition database. Given a food ingredient name, return nutritional values per 100g raw weight as JSON: { "protein": number, "carbs": number, "fat": number, "kcal": number, "fiber": number }. Use USDA data. Return ONLY the JSON object, no markdown, no explanation.`

const MODELS = {
	gemini: 'gemini-3.0-flash',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-5-haiku-20241022'
} as const

async function callGemini(apiKey: string, ingredientName: string) {
	const model = MODELS.gemini
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: ingredientName }] }],
				systemInstruction: { parts: [{ text: systemPrompt }] }
			})
		}
	)
	if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)
	const data = (await response.json()) as any
	return data.candidates[0].content.parts[0].text
}

async function callOpenAI(apiKey: string, ingredientName: string) {
	const model = MODELS.openai
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: ingredientName }
			],
			temperature: 0
		})
	})
	if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)
	const data = (await response.json()) as any
	return data.choices[0].message.content
}

async function callAnthropic(apiKey: string, ingredientName: string) {
	const model = MODELS.anthropic
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model,
			max_tokens: 256,
			system: systemPrompt,
			messages: [{ role: 'user', content: ingredientName }]
		})
	})
	if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
	const data = (await response.json()) as any
	return data.content[0].text
}

export const aiRouter = router({
	lookup: protectedProcedure
		.input(z.object({ ingredientName: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const encryptionSecret = ctx.env.ENCRYPTION_SECRET
			if (!encryptionSecret) {
				throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ENCRYPTION_SECRET not configured' })
			}

			const settings = await getDecryptedApiKey(ctx.db, ctx.user.id, encryptionSecret)
			if (!settings) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'No AI provider configured. Go to Settings to add your API key.'
				})
			}

			let rawText: string
			switch (settings.provider) {
				case 'gemini':
					rawText = await callGemini(settings.apiKey, input.ingredientName)
					break
				case 'openai':
					rawText = await callOpenAI(settings.apiKey, input.ingredientName)
					break
				case 'anthropic':
					rawText = await callAnthropic(settings.apiKey, input.ingredientName)
					break
			}

			// Parse and validate the response
			const cleaned = rawText
				.replace(/```json\s*/g, '')
				.replace(/```\s*/g, '')
				.trim()
			const parsed = macroResultSchema.safeParse(JSON.parse(cleaned))
			if (!parsed.success) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'AI returned invalid macro data'
				})
			}

			return parsed.data
		})
})
