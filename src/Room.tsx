// SPDX-License-Identifier: GPL-2.0-or-later
import { useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { SRGBColorSpace, RepeatWrapping, type Mesh, type MeshBasicMaterial } from 'three';
export const ROOM_SCALE = 1 / 1.5;
export const WORLD_OFFSET = [-2.6 * ROOM_SCALE, 0, -3.8 * ROOM_SCALE] as const;
export const STATION_FORWARD = 0.3;
export const SCREEN = [0, 1.5 * ROOM_SCALE, (-3.61 + STATION_FORWARD) * ROOM_SCALE] as const;
export const SCREEN_WORLD = [
  SCREEN[0] + WORLD_OFFSET[0],
  SCREEN[1],
  SCREEN[2] + WORLD_OFFSET[2],
] as const;
export const CHAIR = [0, 0.57 * ROOM_SCALE, (-2.25 + STATION_FORWARD) * ROOM_SCALE] as const;
export function RoomModel({ baseUrl, name }: { baseUrl: string; name: 'room' | 'chair' }) {
  const { scene } = useGLTF(`${baseUrl}room/${name}-baked.glb`);
  const { materials: sharedMaterials } = useGLTF(`${baseUrl}room/room-baked.glb`);
  const maps = useTexture(
    ['surfaces-baked.png', 'materials-baked.webp', 'plaster-Color.jpg', 'floor-baked.jpg'].map(
      (value) => `${baseUrl}room/${value}`,
    ),
  );
  const model = useMemo(() => {
    maps.forEach((texture, index) => {
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = true;
      texture.anisotropy = 4;
      if (index >= 2) texture.wrapS = texture.wrapT = RepeatWrapping;
    });
    maps[0].channel = 1;
    const result = scene.clone();
    result.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const original = mesh.material as MeshBasicMaterial;
      const material = (sharedMaterials[original.name] ?? original) as MeshBasicMaterial;
      mesh.material = material;
      const props = material.name.startsWith('baked-props');
      if (props || material.name === 'baked-desk') {
        material.map = maps[1];
        material.onBeforeCompile = (shader) => {
          shader.vertexShader =
            'attribute vec4 _atlas; attribute float _repeat; varying vec4 atlasRect; varying float atlasRepeat;\n' +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\natlasRect = _atlas; atlasRepeat = _repeat;',
          );
          shader.fragmentShader =
            'varying vec4 atlasRect; varying float atlasRepeat;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            vec2 tileUv = atlasRepeat > .5 ? fract(vMapUv) : clamp(vMapUv, 0.0, 1.0);
            diffuseColor *= textureGrad(map, atlasRect.xy + tileUv * atlasRect.zw,
              dFdx(vMapUv) * atlasRect.zw, dFdy(vMapUv) * atlasRect.zw);
          `,
          );
        };
        material.customProgramCacheKey = () => 'room-atlas';
      } else {
        material.map = maps[material.name === 'baked-wall' ? 2 : 3];
      }
      if (!props) {
        material.lightMap = maps[0];
        material.lightMapIntensity = Math.PI;
      }
    });
    return result;
  }, [scene, sharedMaterials, maps, name]);
  return <primitive object={model} dispose={null} />;
}
export function Room({ baseUrl }: { baseUrl: string }) {
  return (
    <group name="programmer-room" scale={ROOM_SCALE}>
      <ambientLight intensity={0.6} color="#bac0ae" />
      <hemisphereLight intensity={0.45} color="#9aa6ac" groundColor="#34382c" />
      <pointLight
        position={[0, 2.8 / ROOM_SCALE, 0.5]}
        intensity={24}
        distance={10}
        decay={2}
        color="#a9b2a8"
      />
      <RoomModel baseUrl={baseUrl} name="room" />
      <group name="desk-station" position={[0, 0, STATION_FORWARD]}>
        <pointLight
          position={[0, 1.43, -3.25]}
          intensity={1.3 * ROOM_SCALE ** 2}
          distance={3.4 * ROOM_SCALE}
          decay={2}
          color="#9abfb3"
        />
        <pointLight
          position={[-0.8175, 1.48, -3.92]}
          intensity={1.7 * ROOM_SCALE ** 2}
          distance={2.2 * ROOM_SCALE}
          decay={2}
          color="#e3bb78"
        />
      </group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider position={[0, -0.1, 0]} args={[5, 0.1, 5]} />
        <CuboidCollider position={[0, 2 / ROOM_SCALE, -4.8]} args={[5, 2 / ROOM_SCALE, 0.1]} />
        <CuboidCollider position={[0, 2 / ROOM_SCALE, 4.8]} args={[5, 2 / ROOM_SCALE, 0.1]} />
        <CuboidCollider position={[-4.8, 2 / ROOM_SCALE, 0]} args={[0.1, 2 / ROOM_SCALE, 5]} />
        <CuboidCollider position={[4.8, 2 / ROOM_SCALE, 0]} args={[0.1, 2 / ROOM_SCALE, 5]} />
        <CuboidCollider position={[0, 4 / ROOM_SCALE, 0]} args={[5, 0.1 / ROOM_SCALE, 5]} />
        <CuboidCollider position={[0, 0.39, -3.8 + STATION_FORWARD]} args={[1.5, 0.39, 0.75]} />
        <CuboidCollider
          position={[-2.1, 0.329 / ROOM_SCALE, 3.09]}
          args={[1.5975 / ROOM_SCALE, 0.329 / ROOM_SCALE, 0.945 / ROOM_SCALE]}
        />
      </RigidBody>
    </group>
  );
}
