// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { CanvasTexture, NearestFilter, SRGBColorSpace, type Mesh } from 'three';
import { ROOM_SCALE, SCREEN } from './Room';
export function DosHint({
  baseUrl,
  text,
  ready,
}: {
  baseUrl: string;
  text: string;
  ready: boolean;
}) {
  const font = useTexture(`${baseUrl}dos-font.png`);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = text.length * 8;
    canvas.height = 16;
    const context = canvas.getContext('2d')!;
    Array.from(text).forEach((char, column) => {
      const code = char.charCodeAt(0);
      context.drawImage(
        font.image as HTMLImageElement,
        (code % 16) * 8,
        Math.floor(code / 16) * 16,
        8,
        16,
        column * 8,
        0,
        8,
        16,
      );
    });
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.minFilter = result.magFilter = NearestFilter;
    result.generateMipmaps = false;
    return result;
  }, [font, text]);
  useEffect(() => () => texture.dispose(), [texture]);
  const size = ready ? 3 : 1;
  return (
    <mesh
      name="doom-console-hint"
      scale={size}
      position={[
        (8 / 640 - 0.5) * 0.6 + ((text.length * 4 * size) / 640) * 0.6,
        (0.5 - (144 + 8 * size) / 400) * 0.45,
        0,
      ]}
    >
      <planeGeometry args={[((text.length * 8) / 640) * 0.6, (16 / 400) * 0.45]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
export function DosPrompt({ baseUrl }: { baseUrl: string }) {
  const texture = useTexture(`${baseUrl}dos-prompt.png`);
  const cursor = useRef<Mesh>(null);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }, [texture]);
  useFrame(({ clock }) => {
    if (cursor.current) cursor.current.visible = Math.floor(clock.elapsedTime * 2) % 2 === 0;
  });
  return (
    <group position={[...SCREEN]} scale={ROOM_SCALE}>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[0.6, 0.45]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh ref={cursor} position={[(108 / 640 - 0.5) * 0.6, (0.5 - 119 / 400) * 0.45, 0.003]}>
        <planeGeometry args={[(8 / 640) * 0.6, (2 / 400) * 0.45]} />
        <meshBasicMaterial color="#aaaaaa" toneMapped={false} />
      </mesh>
    </group>
  );
}
