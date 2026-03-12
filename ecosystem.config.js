module.exports = {
  apps: [
    {
      name: 'vproject-bot',
      script: 'src/index.js',
      cwd: '/opt/vproject-bot',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/opt/vproject-bot/logs/error.log',
      out_file: '/opt/vproject-bot/logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
