# rv-app Hosting Gap (Original State)
- No npm script.
- No bundler.
- TypeScript builds via `tsc -p rv-app`.
- Output goes to public/build/.
- MUST be hosted manually (http-server or Express).
- Historically unreachable from HUD due to missing link + missing hosting.

# Quick Verification (rv-app)

### Build:


npx tsc -p rv-app


### Serve:


npx http-server rv-app/public -p 4173


### Test:
Open:


http://localhost:4173


Confirm:
  • Prep Studio loads  
  • Service worker registers  
  • No 404 requests for build/main.js  
