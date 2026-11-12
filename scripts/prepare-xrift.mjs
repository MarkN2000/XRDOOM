// SPDX-License-Identifier: GPL-2.0-or-later
import { readFileSync, writeFileSync } from 'node:fs';
const entry = import.meta.resolve('@xrift/sdk/node');
for (const [file, relative] of [
  ['upload.js', 'relative'],
  ['../../cjs/node/upload.cjs', '(0, node_path_1.relative)'],
]) {
  const url = new URL(file, entry);
  const source = readFileSync(url, 'utf8');
  const before = `absolutePaths.map((p) => ${relative}(distPath, p))`;
  const after = `absolutePaths.map((p) => ${relative}(distPath, p).replaceAll('\\\\', '/'))`;
  if (source.includes(after)) continue;
  if (!source.includes(before))
    throw new Error(`Review the XRift SDK path patch after upgrading: ${file}`);
  writeFileSync(url, source.replace(before, after));
}
