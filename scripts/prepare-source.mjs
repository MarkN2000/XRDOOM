// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
const root = fileURLToPath(new URL('../', import.meta.url));
const sdk = process.env.EMSDK;
if (!sdk) throw new Error('Activate Emscripten 7.0.0 before packaging corresponding source.');
const files = {};
function include(source, destination) {
  if (statSync(source).isDirectory()) {
    for (const name of readdirSync(source).sort()) {
      if (!name.startsWith('.') && !/\.(wasm|data|log|map)$/.test(name)) {
        include(resolve(source, name), `${destination}/${name}`);
      }
    }
  } else {
    files[destination] = new Uint8Array(readFileSync(source));
  }
}
for (const name of [
  'src',
  'scripts',
  'vendor',
  'licenses',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'xrift.json',
  'index.html',
  'README.md',
  'LICENSE',
]) {
  include(resolve(root, name), `XRDOOM/${name}`);
}
for (const name of [
  'THIRD_PARTY_NOTICES.txt',
  'DOOM-SHAREWARE-LICENSE.txt',
  'NotoSansJP-OFL.txt',
]) {
  include(resolve(root, 'public', name), `XRDOOM/public/${name}`);
}
include(resolve(root, '.cache/doom-music'), 'third_party/freepats-used');
for (const [port, folder] of [
  ['sdl2', 'SDL-release-2.32.10'],
  ['sdl2_mixer', 'SDL_mixer-release-2.8.0'],
]) {
  for (const name of ['src', 'include', 'LICENSE.txt']) {
    include(
      resolve(sdk, 'upstream/emscripten/cache/ports', port, folder, name),
      `third_party/${folder}/${name}`,
    );
  }
  include(
    resolve(sdk, 'upstream/emscripten/tools/ports', `${port}.py`),
    `third_party/emscripten-ports/${port}.py`,
  );
}
include(resolve(sdk, 'upstream/emscripten/LICENSE'), 'third_party/emscripten-ports/LICENSE');
files['SOURCE-README.txt'] = strToU8(`XRDOOM corresponding source

See XRDOOM/README.md for build instructions and license scope.
The archive contains world code, the pinned doomgeneric sources, build scripts,
modified VDO.Ninja source, exact SDL/SDL_mixer source and used FreePats patches.
SDL changes are recorded in XRDOOM/licenses/CHANGES.md and scripts/build-doom.mjs.
The Emscripten ports build SDL/SDL_mixer from their pinned upstream releases.

Room assets and fonts are separate data distributed alongside this archive.
Restore them under XRDOOM/public/ from the accompanying world distribution.
DOOM shareware is downloaded separately by npm run fetch:shareware.
The source repository does not contain game data or compiled engine binaries.
`);
writeFileSync(resolve(root, 'public/DOOM-ARCADE-SOURCE.zip'), zipSync(files, { level: 6 }));
console.log(`Packaged corresponding source (${Object.keys(files).length} files).`);
