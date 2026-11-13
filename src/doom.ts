// SPDX-License-Identifier: GPL-2.0-or-later
import createDoom, { type DoomModule } from './generated/doom.js';
import { ROOM_SCALE, SCREEN_WORLD as SCREEN } from './Room';
export const KEY = {
  forward: 0xad,
  back: 0xaf,
  left: 0xac,
  right: 0xae,
  strafeLeft: 0xa0,
  strafeRight: 0xa1,
  speed: 0xb6,
  fire: 0xa3,
  use: 0xa2,
  next: 110,
  map: 9,
};
export function spatialAudio(context: AudioContext, source: AudioNode) {
  const gain = context.createGain();
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2 * ROOM_SCALE;
  panner.maxDistance = 18 * ROOM_SCALE;
  panner.positionX.value = SCREEN[0];
  panner.positionY.value = SCREEN[1];
  panner.positionZ.value = SCREEN[2];
  source.connect(gain).connect(panner).connect(context.destination);
  return {
    volume(value: number) {
      gain.gain.value = value;
    },
    listener(
      position: {
        x: number;
        y: number;
        z: number;
      },
      forward: {
        x: number;
        y: number;
        z: number;
      },
    ) {
      const listener = context.listener;
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    },
    dispose() {
      source.disconnect(gain);
      gain.disconnect();
      panner.disconnect();
    },
  };
}
export async function startDoom(baseUrl: string, skill: number) {
  const response = await fetch(`${baseUrl}doom1.wad`);
  if (!response.ok)
    throw new Error('DOOMデータがありません。npm run fetch:shareware を実行してください。');
  const wad = new Uint8Array(await response.arrayBuffer());
  if (String.fromCharCode(...wad.subarray(0, 4)) !== 'IWAD')
    throw new Error('DOOMデータを読み込めませんでした。');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  const prompt = new Image();
  prompt.crossOrigin = 'anonymous';
  prompt.src = `${baseUrl}dos-prompt.png`;
  const font = new Image();
  font.crossOrigin = 'anonymous';
  font.src = `${baseUrl}dos-font.png`;
  await Promise.all([prompt.decode(), font.decode()]);
  context.drawImage(prompt, 0, 0);
  const raw = document.createElement('canvas');
  raw.width = 320;
  raw.height = 200;
  const rawContext = raw.getContext('2d')!;
  let pixels: ImageData | undefined;
  const stream = canvas.captureStream(30);
  const pressed = new Set<number>();
  let module: DoomModule | undefined;
  let disposed = false;
  let frame = 0;
  let started = false;
  let blink = false;
  let cursorTimer: ReturnType<typeof setInterval> | undefined;
  const startupLog: string[] = [];
  let boot: Promise<boolean> | undefined;
  let bootTimer: ReturnType<typeof setTimeout> | undefined;
  let finishBoot: ((completed: boolean) => void) | undefined;
  let audio: ReturnType<typeof spatialAudio> | undefined;
  let audioContext: AudioContext | undefined;
  let audioGate: GainNode | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let ready!: () => void;
  let fail!: (error: Error) => void;
  const initialized = new Promise<void>((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  void initialized.catch(() => {});
  try {
    module = await createDoom({
      arguments: ['-iwad', '/doom1.wad', '-warp', '1', '1', '-skill', String(skill)],
      locateFile: (path) => `${baseUrl}${path.split('/').pop()}`,
      preRun: [(instance) => instance.FS.writeFile('/doom1.wad', wad)],
      onFrame(input, pointer) {
        if (disposed) return;
        if (
          !pixels ||
          pixels.data.buffer !== input.buffer ||
          pixels.data.byteOffset !== input.byteOffset + pointer
        ) {
          pixels = new ImageData(
            new Uint8ClampedArray(input.buffer, input.byteOffset + pointer, 320 * 200 * 4),
            320,
            200,
          );
        }
        rawContext.putImageData(pixels, 0, 0);
        if (!started) return;
        context.drawImage(raw, 0, 0, 320, 240);
        frame++;
      },
      onAudio(ctx, source) {
        audioContext = ctx;
        source.disconnect();
        audioGate = ctx.createGain();
        audioGate.gain.value = 0;
        source.connect(audioGate);
        destination = ctx.createMediaStreamDestination();
        audioGate.connect(destination);
        for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
        audio = spatialAudio(ctx, audioGate);
      },
      onReady: ready,
      onAbort: (message) => fail(new Error(String(message))),
      print: (message) => {
        if (!started) startupLog.push(...message.replace(/\t/g, '    ').split(/\r?\n/));
      },
      printErr: (message) => {
        if (!started) startupLog.push(...message.replace(/\t/g, '    ').split(/\r?\n/));
        console.warn(message);
      },
    });
    await initialized;
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    module?._arcade_stop();
    throw error;
  }
  const instance = module;
  cursorTimer = setInterval(() => {
    blink = !blink;
    context.fillStyle = blink ? '#aaaaaa' : '#050605';
    context.fillRect(104, 118, 8, 2);
    frame++;
  }, 500);
  const pulses = new Map<number, ReturnType<typeof setTimeout>>();
  const held = new Set<number>();
  const sync = (code: number) => {
    const down = held.has(code) || pulses.has(code);
    if (disposed || pressed.has(code) === down) return;
    if (down) pressed.add(code);
    else pressed.delete(code);
    instance._arcade_key(code, Number(down));
  };
  const key = (code: number, down: boolean) => {
    if (down) held.add(code);
    else held.delete(code);
    sync(code);
  };
  const release = () => {
    held.clear();
    for (const timer of pulses.values()) clearTimeout(timer);
    pulses.clear();
    for (const code of [...pressed]) sync(code);
  };
  return {
    canvas,
    stream,
    audio,
    get frame() {
      return frame;
    },
    get started() {
      return started;
    },
    start() {
      if (disposed) return Promise.resolve(false);
      if (boot) return boot;
      clearInterval(cursorTimer);
      context.fillStyle = '#050605';
      context.fillRect(104, 118, 8, 2);
      frame++;
      boot = new Promise<boolean>((resolve) => {
        finishBoot = resolve;
        const lines = startupLog.flatMap((line) => line.match(/.{1,78}/g) ?? ['']);
        let index = 0,
          row = 7;
        const advance = () => {
          if (index === lines.length) {
            bootTimer = setTimeout(() => {
              canvas.width = 320;
              canvas.height = 240;
              context.imageSmoothingEnabled = false;
              context.drawImage(raw, 0, 0, 320, 240);
              started = true;
              frame++;
              resolve(true);
            }, 350);
            return;
          }
          if (row === 24) {
            context.drawImage(canvas, 8, 24, 624, 368, 8, 8, 624, 368);
            context.fillStyle = '#050605';
            context.fillRect(8, 376, 624, 16);
            row--;
          }
          Array.from(lines[index++]).forEach((char, column) => {
            const code = char.charCodeAt(0) < 128 ? char.charCodeAt(0) : 63;
            context.drawImage(
              font,
              (code % 16) * 8,
              Math.floor(code / 16) * 16,
              8,
              16,
              8 + column * 8,
              8 + row * 16,
              8,
              16,
            );
          });
          row++;
          frame++;
          bootTimer = setTimeout(advance, 35);
        };
        bootTimer = setTimeout(advance, 180);
      });
      return boot;
    },
    key,
    release,
    turn(delta: number) {
      if (!disposed) instance._arcade_turn(delta);
    },
    pulse(code: number) {
      if (disposed) return;
      clearTimeout(pulses.get(code));
      pulses.set(
        code,
        setTimeout(() => {
          pulses.delete(code);
          sync(code);
        }, 60),
      );
      sync(code);
    },
    pause(value: boolean) {
      if (disposed) return;
      release();
      instance._arcade_pause(Number(value));
      if (audioGate) audioGate.gain.value = Number(started && !value);
    },
    run(value: boolean) {
      instance._arcade_run(Number(value));
    },
    restart() {
      if (disposed || !started) return;
      release();
      instance._arcade_restart();
    },
    resumeAudio() {
      void audioContext?.resume();
    },
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
      clearTimeout(bootTimer);
      finishBoot?.(false);
      clearInterval(cursorTimer);
      audio?.dispose();
      audioGate?.disconnect();
      destination?.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      instance._arcade_stop();
    },
  };
}
export type DoomRuntime = Awaited<ReturnType<typeof startDoom>>;
