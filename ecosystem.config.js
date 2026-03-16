module.exports = {
  apps: [
    {
      name: 'insta-reel-bot',
      script: 'index.js',
      interpreter: 'node',
      watch: false,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
