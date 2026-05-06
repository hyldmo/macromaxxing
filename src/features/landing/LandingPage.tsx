import type { FC } from 'react'
import { useDocumentTitle } from '~/lib'
import {
	AutoSection,
	CycleSection,
	FaqSection,
	FooterCta,
	Hero,
	HowItWorks,
	IntelligenceSection,
	NumbersRail,
	PlateSection,
	RackSection,
	SignalSection
} from './sections'

export const LandingPage: FC = () => {
	useDocumentTitle('Macromaxxing — precision log for meal prep & training')

	return (
		<div className="-mx-4 -mt-4 bg-surface-0 font-display text-ink antialiased">
			<Hero />
			<NumbersRail />
			<PlateSection />
			<RackSection />
			<CycleSection />
			<SignalSection />
			<AutoSection />
			<IntelligenceSection />
			<HowItWorks />
			<FaqSection />
			<FooterCta />
		</div>
	)
}
