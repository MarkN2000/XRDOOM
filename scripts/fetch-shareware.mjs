// SPDX-License-Identifier: GPL-2.0-or-later
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const response = await fetch('https://raw.githubusercontent.com/mrdoob/three-doom/main/doom1.wad');
if (!response.ok) throw new Error(`Shareware download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('md5').update(bytes).digest('hex') !== 'f0cefca49926d00903cf57551d901abe') {
  throw new Error('Unexpected DOOM Shareware v1.9 data');
}
await writeFile(new URL('../public/doom1.wad', import.meta.url), bytes);
console.log('Downloaded unmodified DOOM Shareware v1.9 for local play.');
