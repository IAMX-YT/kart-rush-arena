# Assets and licenses

All track geometry, kart meshes, trees, hills, SVG illustrations, favicon, road markings, shaders/material choices, UI/CSS and generated oscillator sound are original code in this repository. No downloaded proprietary media, third-party fonts or externally hosted runtime assets. SVG thumbnails are registered in `src/shared/registry.ts`. Engine audio is synthesized by Web Audio after user interaction.

Dependency licenses: React MIT, Three.js MIT, ws MIT, Vite MIT, TypeScript Apache-2.0, Zod MIT, qrcode MIT, Playwright Apache-2.0, esbuild MIT, tsx MIT. Exact versions are pinned by pnpm-lock.yaml; retain dependency license files on redistribution.

October 11 visual update: sculpted original toy karts with rounded chassis, helmet/visor, steering wheel, wheel hubs, lamps and numbered bodywork; procedural road/grass textures; mushroom garden, cottage, flowers, fencing, rocks and cloud layers. `world.ts` builds the scenery and batches static geometry. Low graphics uses diffuse materials for phones; high retains physically based materials and soft shadows. `public/sunburst-world.png` is a browser capture of this original 3D world for game-library artwork. No It Takes Two artwork or models are included.
