# rv-app Development

Build:
  npx tsc -p rv-app

Serve (example):
  npx http-server rv-app/public -p 4173

Notes:
  - There is NO Vite/Webpack bundler.
  - public/index.html loads <rv-app> and build/main.js.
  - This app is served statically by the RV API at /rv.
