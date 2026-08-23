module.exports = {
  apps: [
    {
      name: 'ai-gateway',
      script: 'server.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      windowsHide: true,
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
