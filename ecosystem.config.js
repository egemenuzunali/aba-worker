module.exports = {
	apps: [
		{
			name: 'schadeautosVinder',
			script: 'dist/index.js',
			watch: true,
			env: {
				NODE_ENV: 'production',
				PORT: 4008,
			},
		},
	],
};
