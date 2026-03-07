# KataGo assets (local / Cloud Run image)

Place KataGo runtime files in this directory before deploying:

- `katago` (Linux executable binary)
- `analysis.cfg` (KataGo analysis config)
- `model.bin.gz` (KataGo model file)

Expected in-container paths:

- `/app/katago/katago`
- `/app/katago/analysis.cfg`
- `/app/katago/model.bin.gz`

Notes:

- Do not commit binary/model files.
- Keep this README and `.gitkeep` in Git; keep runtime assets local/private.
