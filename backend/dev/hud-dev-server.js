console.log('=== HUD DEV SERVER STARTED ===');
console.log('PID:', process.pid);
console.log('CWD:', process.cwd());

app.get('/__whoami', (req, res) => {
  res.json({
    server: 'hud-dev-server',
    pid: process.pid,
    cwd: process.cwd(),
    time: new Date().toISOString()
  });
});
