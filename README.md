# The Unfinished Room

An interactive Three.js memory-space demo.

## Local Preview

```bash
python3 -m http.server 8787
```

Open:

```text
http://localhost:8787/
```

## GitHub Pages Deployment

This project is a static site. It can be published directly from the repository root with GitHub Pages.

Recommended settings:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

After every visual/content update:

```bash
git add .
git commit -m "Update demo"
git push
```

GitHub Pages will rebuild the public URL automatically after the push.

## Content Plan

Future memory content should live in data/assets files rather than being hard-coded into scene geometry.

Suggested structure:

```text
data/memories.json
assets/memories/images/
assets/memories/audio/
```

This keeps the public demo static while still making the five archive sheets easy to update.

