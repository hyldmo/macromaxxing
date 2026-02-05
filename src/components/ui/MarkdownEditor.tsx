import {
	headingsPlugin,
	linkPlugin,
	listsPlugin,
	MDXEditor,
	markdownShortcutPlugin,
	quotePlugin
} from '@mdxeditor/editor'
import type { FC } from 'react'
import { cn } from '~/lib/cn'

export interface MarkdownEditorProps {
	value: string
	onChange: (value: string) => void
	readOnly?: boolean
	placeholder?: string
	className?: string
}

const plugins = [headingsPlugin(), listsPlugin(), quotePlugin(), linkPlugin(), markdownShortcutPlugin()]

export const MarkdownEditor: FC<MarkdownEditorProps> = ({ value, onChange, readOnly, placeholder, className }) => (
	<MDXEditor
		markdown={value}
		onChange={onChange}
		plugins={readOnly ? [] : plugins}
		readOnly={readOnly}
		placeholder={placeholder}
		className={cn('mdxeditor-root', className)}
		contentEditableClassName="mdxeditor-content min-h-[150px] px-3 py-2 text-ink text-sm"
	/>
)
