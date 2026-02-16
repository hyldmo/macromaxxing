import type { Sex } from '@macromaxxing/db'
import { type FC, useEffect, useState } from 'react'
import { NumberInput, SaveButton, Select } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export const ProfileForm: FC = () => {
	const profileQuery = trpc.settings.getProfile.useQuery()
	const utils = trpc.useUtils()
	const saveMutation = trpc.settings.saveProfile.useMutation({
		onSuccess: () => {
			utils.settings.getProfile.invalidate()
			utils.settings.get.invalidate()
		}
	})

	const [heightCm, setHeightCm] = useState('')
	const [weightKg, setWeightKg] = useState('')
	const [sex, setSex] = useState<Sex>('male')

	useEffect(() => {
		if (profileQuery.data) {
			setHeightCm(profileQuery.data.heightCm?.toString() ?? '')
			setWeightKg(profileQuery.data.weightKg?.toString() ?? '')
			setSex(profileQuery.data.sex)
		}
	}, [profileQuery.data])

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({
			heightCm: heightCm ? Number.parseFloat(heightCm) : null,
			weightKg: weightKg ? Number.parseFloat(weightKg) : null,
			sex
		})
	}

	const hasChanges =
		profileQuery.data &&
		(String(profileQuery.data.heightCm ?? '') !== heightCm ||
			String(profileQuery.data.weightKg ?? '') !== weightKg ||
			profileQuery.data.sex !== sex)

	return (
		<form onSubmit={handleSave} className="space-y-3">
			<div className="grid grid-cols-3 gap-3">
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="height">
						Height (cm)
					</label>
					<NumberInput
						id="height"
						value={heightCm}
						onChange={e => setHeightCm(e.target.value)}
						placeholder="175"
						min={100}
						step={1}
					/>
				</div>
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="weight">
						Weight (kg)
					</label>
					<NumberInput
						id="weight"
						value={weightKg}
						onChange={e => setWeightKg(e.target.value)}
						placeholder="80"
						min={30}
						step={0.5}
					/>
				</div>
				<div className="space-y-1">
					<label className="text-ink-muted text-sm" htmlFor="sex">
						Sex
					</label>
					<Select
						id="sex"
						value={sex}
						onChange={v => setSex(v)}
						options={[
							{ label: 'Male', value: 'male' },
							{ label: 'Female', value: 'female' }
						]}
					/>
				</div>
			</div>
			<p className="text-ink-faint text-xs">Used for workout validation and nutrition targets.</p>
			<SaveButton mutation={saveMutation} disabled={!hasChanges} />
		</form>
	)
}
