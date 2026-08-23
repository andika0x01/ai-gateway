module.exports = {
  apps: [
    {
      name: 'ai-gateway',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 1337,
      },
    },
  ],
};
