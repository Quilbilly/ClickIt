# T-W-P-A-R-E-N-T-C-A-R-E

Local draft website for **T-W Parent Care** — in-home companionship and daily support.

No Git remote or backend is required yet. Inquiry form submissions are saved in the browser with `localStorage`.

## Run locally

From this folder, serve the static files with any local server:

```bash
# Python
python3 -m http.server 5173

# Node (if installed)
npx --yes serve -l 5173
```

Then open [http://localhost:5173](http://localhost:5173).

## What’s included

- Brand-first landing page (`index.html`)
- Care, approach, and connect sections
- Inquiry form persisted under key `tw-parent-care:inquiries`
- View / clear saved inquiries on this device only

## Next steps (when you’re ready)

- Create a dedicated GitHub repository named `T-W-P-A-R-E-N-T-C-A-R-E`
- Replace Unsplash placeholders with your own photography
- Wire the form to email or a real API instead of local storage
