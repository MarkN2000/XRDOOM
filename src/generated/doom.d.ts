// SPDX-License-Identifier: GPL-2.0-or-later
export interface DoomModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
  };
  _arcade_key(key: number, down: number): void;
  _arcade_turn(delta: number): void;
  _arcade_pause(paused: number): void;
  _arcade_run(run: number): void;
  _arcade_restart(): void;
  _arcade_stop(): void;
}
export default function createDoom(options: {
  arguments: string[];
  locateFile(path: string): string;
  preRun: ((module: DoomModule) => void)[];
  onFrame(heap: Uint8Array<ArrayBuffer>, pointer: number): void;
  onAudio(context: AudioContext, source: AudioNode): void;
  onReady(): void;
  onAbort(message: unknown): void;
  print(message: string): void;
  printErr(message: string): void;
}): Promise<DoomModule>;
