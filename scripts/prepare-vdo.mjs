// SPDX-License-Identifier: MPL-2.0 OR GPL-2.0-or-later
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('xrift.json', root), 'utf8'));
let code = readFileSync(new URL('node_modules/@vdoninja/sdk/vdoninja-sdk.js', root), 'utf8');
const patches = [
  [
    /\(function\s*\(global\)\s*\{/,
    '// Modified for XRift: ES module, no persistent storage, allowlisted TURN hosts.',
  ],
  [/        _getStorage\(key\) \{[\s\S]*?^        \}/m, '        _getStorage() { return null; }'],
  [
    /        _setStorage\(key, value, ttlMinutes = 60\) \{[\s\S]*?^        \}/m,
    '        _setStorage() {}',
  ],
  [
    /        clearTURNCache\(\) \{[\s\S]*?^        \}/m,
    '        clearTURNCache() { this._turnList = null; this._turnPromise = null; }',
  ],
  [
    /        async _fetchTURNServers\(\) \{[\s\S]*?^        \}/m,
    `        async _fetchTURNServers() {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch('https://turnservers.vdo.ninja/', { signal: controller.signal, credentials: 'omit' });
                if (!response.ok) return [];
                const data = await response.json();
                if (!Array.isArray(data.servers)) return [];
                const allowed = new Set(${JSON.stringify(config.world.permissions.allowedDomains)});
                return data.servers.filter(server => {
                    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                    return urls.length && urls.every(url => {
                        const match = typeof url === 'string' && /^(?:turn|turns):([a-z0-9.-]+)(?::[0-9]+)?(?:\\?transport=(?:udp|tcp))?$/i.exec(url);
                        return match && allowed.has(match[1].toLowerCase());
                    });
                });
            } catch { return []; }
            finally { clearTimeout(timer); }
        }`,
  ],
  [/    \/\/ Export for different environments[\s\S]*$/, 'export default VDONinjaSDK;\n'],
];
for (const [pattern, replacement] of patches) {
  if (!pattern.test(code)) throw new Error(`VDO.Ninja SDK changed: ${pattern}`);
  code = code.replace(pattern, () => replacement);
}
writeFileSync(
  new URL('src/generated/vdo.js', root),
  '// SPDX-License-Identifier: MPL-2.0 OR GPL-2.0-or-later\n// Distributed with XRDOOM under MPL-2.0 Section 3.3; modifications are available under both licenses.\n' +
    code,
);
