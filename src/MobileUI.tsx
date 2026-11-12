// SPDX-License-Identifier: GPL-2.0-or-later
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Interactable, LAYERS } from '@xrift/world-components';
import {
  CanvasTexture,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { type Action } from './useControls';
const icons = {
  soundOn: 'M11 5 6 9H3v6h3l5 4z M15.54 8.46a5 5 0 0 1 0 7.08 M19.07 4.93a10 10 0 0 1 0 14.14',
  soundOff: 'M11 5 6 9H3v6h3l5 4z M23 9l-6 6 M17 9l6 6',
  fire: 'M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12 M22 12H18 M6 12H2 M12 6V2 M12 22V18',
  use: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2 M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  weapon: 'm2 9 3-3 3 3 M13 18H7a2 2 0 0 1-2-2V6 m17 9-3 3-3-3 M11 6h6a2 2 0 0 1 2 2v10',
  menu: 'M15 3h3q1 0 1 1v16q0 1-1 1h-3q-1 0-1-1V4q0-1 1-1 M6 3h3q1 0 1 1v16q0 1-1 1H6q-1 0-1-1V4q0-1 1-1',
  leave: 'm16 17 5-5-5-5 M21 12H9 M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
  map: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z M15 5.764v15 M9 3.236v15',
};
export function MobileButton({
  id,
  label,
  action,
  onAction,
  buttons,
  font,
  position,
  width = 104,
  height = 48,
  hold,
  joystick = false,
  round = false,
  icon,
  primary = false,
  quiet = false,
  fontSize: labelSize,
}: {
  id: string;
  label: string;
  action?: Action;
  onAction(action: Action): void;
  buttons: MutableRefObject<Mesh[]>;
  font: string;
  position: [number, number, number];
  width?: number;
  height?: number;
  hold?: number;
  joystick?: boolean;
  round?: boolean;
  icon?: keyof typeof icons;
  primary?: boolean;
  quiet?: boolean;
  fontSize?: number;
}) {
  const mesh = useRef<Mesh | null>(null);
  const face = useRef<MeshBasicMaterial>(null);
  const caption = useRef<Mesh>(null);
  const thumb = useRef<Group>(null);
  const stacked = round && Boolean(label);
  const fontSize = labelSize ?? (primary ? 14 : stacked && width < 70 ? 11 : 12);
  const iconSize = icon === 'fire' ? 31 : round ? 23 : 18;
  const textWidth = label.length * fontSize;
  const iconX = stacked || !label ? 0 : -(textWidth + 8) / 2;
  const iconY = stacked ? (width < 70 ? -8 : -9) : 0;
  const textures = useMemo(() => {
    return [false, true, ...(joystick ? [false] : [])].map((pressed, index) => {
      const knob = index === 2;
      const w = knob ? 54 : width,
        h = knob ? 54 : height;
      const canvas = document.createElement('canvas');
      canvas.width = (w + 12) * 2;
      canvas.height = (h + 12) * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.translate(w / 2 + 6, h / 2 + 6);
      ctx.lineWidth = icon === 'fire' ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(
        -w / 2 + 1,
        -h / 2 + 1,
        w - 2,
        h - 2,
        round || joystick || knob ? w / 2 : icon === 'leave' && w < 100 ? 24 : 13,
      );
      const fill = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      fill.addColorStop(0, '#f6f1e3bf');
      fill.addColorStop(1, '#c6c9b780');
      ctx.fillStyle = knob
        ? fill
        : pressed || primary
          ? '#e7deca'
          : quiet
            ? '#11171210'
            : joystick
              ? '#11171265'
              : '#11171299';
      ctx.fill();
      ctx.strokeStyle = knob
        ? '#fff7e6a6'
        : quiet
          ? '#ffffff00'
          : icon === 'fire'
            ? '#f5e7cda6'
            : '#f6f0dd55';
      ctx.stroke();
      if (icon === 'fire' && !knob) {
        ctx.beginPath();
        ctx.arc(0, 0, w / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#f1e4c640';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (knob) {
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#25322340';
        ctx.stroke();
      }
      if (joystick && !knob) {
        ctx.beginPath();
        ctx.arc(0, 0, w / 2 - 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff08';
        ctx.lineWidth = 8;
        ctx.stroke();
        for (let n = 0; n < 4; n++) {
          ctx.save();
          ctx.rotate((n * Math.PI) / 2);
          ctx.translate(-7, -h / 2 + 6);
          ctx.scale(14 / 24, 14 / 24);
          ctx.strokeStyle = '#f4f2e98a';
          ctx.lineWidth = 1.4;
          ctx.stroke(new Path2D('m18 15-6-6-6 6'));
          ctx.restore();
        }
      }
      if (icon && !knob) {
        ctx.translate(iconX - iconSize / 2, iconY - iconSize / 2);
        ctx.scale(iconSize / 24, iconSize / 24);
        ctx.lineWidth = 1.65;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pressed || primary ? '#252d22' : '#f4f2e9';
        ctx.stroke(new Path2D(icons[icon]));
      }
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      return texture;
    });
  }, [width, height, round, joystick, icon, iconSize, iconX, iconY, primary, quiet]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  const register = useCallback(
    (value: Mesh | null) => {
      if (mesh.current) buttons.current = buttons.current.filter((item) => item !== mesh.current);
      mesh.current = value;
      if (value) buttons.current.push(value);
    },
    [buttons],
  );
  useFrame(() => {
    const data = mesh.current?.userData;
    if (!data) return;
    if (face.current) face.current.map = textures[data.pressed ? 1 : 0];
    if (caption.current)
      (caption.current.material as MeshBasicMaterial).color.set(
        data.pressed || primary ? '#252d22' : '#f4f2e9',
      );
    if (thumb.current)
      thumb.current.position.set((data.stickX ?? 0) * 27, (data.stickY ?? 0) * 27, 0.02);
  });
  return (
    <group position={position}>
      <Interactable
        id={id}
        onInteract={() => action && onAction(action)}
        interactionText={label || '一時停止'}
      >
        <mesh
          layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}
          ref={register}
          userData={{ action, hold, joystick }}
        >
          <boxGeometry args={[Math.max(48, width), Math.max(48, height), 0.012]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh layers-mask={1 << LAYERS.FIRST_PERSON_ONLY} renderOrder={20}>
          <planeGeometry args={[width + 12, height + 12]} />
          <meshBasicMaterial
            ref={face}
            map={textures[0]}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {joystick ? (
          <group ref={thumb} position={[0, 0, 0.02]}>
            <mesh layers-mask={1 << LAYERS.FIRST_PERSON_ONLY} renderOrder={22}>
              <planeGeometry args={[66, 66]} />
              <meshBasicMaterial
                map={textures[2]}
                transparent
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        ) : (
          label && (
            <Text
              layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}
              ref={caption}
              font={font}
              position={[
                stacked || !icon ? 0 : (iconSize + 8) / 2,
                stacked ? (width < 70 ? -16 : -21) : 0,
                0.02,
              ]}
              fontSize={fontSize}
              color={primary ? '#252d22' : '#f4f2e9'}
              renderOrder={21}
              material-depthTest={false}
              material-depthWrite={false}
              material-toneMapped={false}
            >
              {label}
            </Text>
          )
        )}
      </Interactable>
    </group>
  );
}
