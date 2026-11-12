// SPDX-License-Identifier: GPL-2.0-or-later
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.EMSDK;
if (!sdk) throw new Error('Activate Emscripten 7.0.0 before building DOOM.');
const config = resolve(sdk, '.emscripten');
const python = readFileSync(config, 'utf8')
  .match(/^PYTHON = '(.+)'/m)[1]
  .replace('$CFGDIR', sdk);
const env = { ...process.env, EMSDK: sdk, EM_CONFIG: config, EMSDK_PYTHON: python };
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root, env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const sdlAudio = resolve(
  sdk,
  'upstream/emscripten/cache/ports/sdl2/SDL-release-2.32.10/src/audio/emscripten/SDL_emscriptenaudio.c',
);
if (!existsSync(sdlAudio))
  run(python, [resolve(sdk, 'upstream/emscripten/embuilder.py'), 'build', 'sdl2']);
const port = resolve(sdk, 'upstream/emscripten/tools/ports/sdl2.py');
if (existsSync(sdlAudio)) {
  const original = readFileSync(sdlAudio, 'utf8');
  const playbackOnly = original
    .replace(
      /if \(iscapture\) \{\s*\/\* The idea is to take the capture media stream,[\s\S]*?\} else \{/,
      'if (iscapture) { return SDL_SetError("Audio capture is disabled in DOOM Arcade"); } else {',
    )
    .replace(
      /capture_available = available && MAIN_THREAD_EM_ASM_INT\(\{[\s\S]*?\}\);/,
      'capture_available = SDL_FALSE;',
    )
    .replace(
      "SDL2.audio.scriptProcessorNode['connect'](SDL2.audioContext['destination']);",
      '/* XRift connects audio through its initially muted gate in onAudio. */',
    );
  const header = resolve(sdlAudio, '../../../../include/SDL_config_emscripten.h');
  const headerOriginal = readFileSync(header, 'utf8');
  const headerPatched = headerOriginal
    .replace('#define SDL_VIDEO_DRIVER_EMSCRIPTEN 1', '/* DOOM Arcade uses the XRift renderer. */')
    .replace('#define SDL_JOYSTICK_EMSCRIPTEN 1', '/* Input is supplied by the world. */');
  const portOriginal = readFileSync(port, 'utf8');
  const portPatched = portOriginal.replace(
    '    flags = []',
    '    flags = ["-DSDL_VIDEO_DISABLED=1", "-DSDL_JOYSTICK_DISABLED=1", "-DSDL_SENSOR_DISABLED=1", "-DSDL_POWER_DISABLED=1"]',
  );
  if (
    playbackOnly !== original ||
    portPatched !== portOriginal ||
    headerPatched !== headerOriginal
  ) {
    writeFileSync(sdlAudio, playbackOnly);
    writeFileSync(port, portPatched);
    writeFileSync(header, headerPatched);
    const library = resolve(
      sdk,
      'upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/libSDL2.a',
    );
    if (existsSync(library)) unlinkSync(library);
  }
}
const source = resolve(root, 'vendor/doomgeneric/doomgeneric');
const makefile = readFileSync(resolve(source, 'Makefile.emscripten'), 'utf8');
const sources = makefile
  .match(/^SRC_DOOM\s*=\s*(.+)$/m)[1]
  .trim()
  .split(/\s+/)
  .filter((name) => name !== 'doomgeneric_emscripten.o')
  .map((name) => resolve(source, name.replace(/\.o$/, '.c')));
const freepats = resolve(root, '.cache/freepats');
if (!existsSync(resolve(freepats, 'freepats.cfg'))) {
  run('git', ['clone', 'https://github.com/feross/freepats.git', freepats]);
  run('git', ['-C', freepats, 'checkout', '79cd6f0076ff6c9bbc692bf29b6a4574fe4cc725']);
}
const wad = readFileSync(resolve(root, 'public/doom1.wad'));
const instruments = new Set([0]);
for (let i = 0; i < wad.readUInt32LE(4); i++) {
  const entry = wad.readUInt32LE(8) + i * 16;
  const offset = wad.readUInt32LE(entry);
  if (wad.toString('ascii', offset, offset + 4) !== 'MUS\x1a') continue;
  for (let n = 0; n < wad.readUInt16LE(offset + 12); n++)
    instruments.add(wad.readUInt16LE(offset + 16 + n * 2));
}
const music = resolve(root, '.cache/doom-music');
mkdirSync(music, { recursive: true });
let drum = false;
const lines = ['dir /timidity', 'default Tone_000/000_Acoustic_Grand_Piano.pat'];
for (const line of readFileSync(resolve(freepats, 'freepats.cfg'), 'utf8').split(/\r?\n/)) {
  if (/^(bank|drumset)/.test(line)) {
    drum = line.startsWith('drumset');
    lines.push(line);
  }
  const match = line.match(/^\s*(\d+)\s+(\S+)/);
  if (!match || !instruments.has(Number(match[1]) + (drum ? 100 : 0))) continue;
  mkdirSync(dirname(resolve(music, match[2])), { recursive: true });
  copyFileSync(resolve(freepats, match[2]), resolve(music, match[2]));
  lines.push(line);
}
writeFileSync(resolve(music, 'timidity.cfg'), lines.join('\n'));
copyFileSync(resolve(freepats, 'README_FREEPATS.txt'), resolve(music, 'README_FREEPATS.txt'));
copyFileSync(resolve(freepats, 'LICENSE'), resolve(music, 'LICENSE'));
mkdirSync(resolve(root, 'src/generated'), { recursive: true });
run(python, [
  resolve(sdk, 'upstream/emscripten/emcc.py'),
  ...sources,
  resolve(root, 'scripts/doom_bridge.c'),
  `-I${source}`,
  '-O2',
  '-DFEATURE_SOUND',
  '-DDOOMGENERIC_RESX=320',
  '-DDOOMGENERIC_RESY=200',
  '-sUSE_SDL=2',
  '-sUSE_SDL_MIXER=2',
  '-sSDL2_MIXER_FORMATS=["mid"]',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sDYNAMIC_EXECUTION=0',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sENVIRONMENT=web',
  '-sASYNCIFY=1',
  '-sASYNCIFY_STACK_SIZE=65536',
  '-sEXPORTED_RUNTIME_METHODS=["FS"]',
  '-sEXPORTED_FUNCTIONS=["_main","_arcade_key","_arcade_turn","_arcade_pause","_arcade_run","_arcade_stop"]',
  '--preload-file',
  `${music}@/timidity`,
  `-ffile-prefix-map=${root}=.`,
  `-ffile-prefix-map=${sdk}=emsdk`,
  '-o',
  'src/generated/doom.js',
]);
copyFileSync(resolve(root, 'src/generated/doom.wasm'), resolve(root, 'public/doom.wasm'));
copyFileSync(resolve(root, 'src/generated/doom.data'), resolve(root, 'public/doom.data'));
