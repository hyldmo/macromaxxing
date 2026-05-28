function asciiOnly(input) {
	if (!input) return true
	for (let i = 0; i < input.length; i++) {
		if (input.charCodeAt(i) > 127) return false
	}
	return true
}

const message =
	'Commit message must be ASCII-only. Cloudflare Pages deploy (wrangler) mangles multibyte chars in commit messages and fails with code 8000111.'

export default {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'subject-only-ascii': ({ subject }) => [asciiOnly(subject), message],
				'body-only-ascii': ({ body }) => [asciiOnly(body), message],
				'footer-only-ascii': ({ footer }) => [asciiOnly(footer), message]
			}
		}
	],
	rules: {
		'subject-only-ascii': [2, 'always'],
		'body-only-ascii': [2, 'always'],
		'footer-only-ascii': [2, 'always']
	}
}
