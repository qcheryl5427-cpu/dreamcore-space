# Asset Sources

Downloaded or prepared for `dreamcore-space` on 2026-05-20.

## Texture Packs

Source: ambientCG, CC0 materials, https://ambientcg.com/

- `Cardboard002_1K-JPG`: cardboard base, paper edges, handmade room shell.
- `Paper001_1K-JPG`: pinned sheets, tracing paper, blueprint surfaces.
- `Plaster001_1K-JPG`: rough wall and table substrate where the room needs matte grain.
- `Styrofoam004_1K-JPG`: foam-board / model-board wall material close to the reference's handmade surface.
- `Tape001_1K-JPG`: translucent tape strips and taped wall paper details.

## Implementation Notes

- Current runtime uses 1K JPG maps to keep the shareable web build light enough.
- Color, roughness, normal, and opacity maps are wired through `assetPBR` in `index.html`.
- Zip files are kept in `assets/textures/downloads/` for traceability during development. Before publishing a final public build, remove unused source archives or ship through a hosting pipeline with compression.
