// SPDX-License-Identifier: GPL-2.0-or-later
import { DevEnvironment, LAYERS, XRiftProvider } from '@xrift/world-components';
import { useThree } from '@react-three/fiber';
import type { CameraConfig, PhysicsConfig } from '@xrift/world-components';
import { createRoot } from 'react-dom/client';
import { World } from './World';
import xriftConfig from '../xrift.json';
import { InstanceStateContext, useSeatContext } from '@xrift/world-components';
import { Html } from '@react-three/drei';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
function LocalPreview({ children }: { children: ReactNode }) {
  const { camera } = useThree();
  useEffect(() => {
    const previous = camera.layers.mask;
    camera.layers.enable(LAYERS.FIRST_PERSON_ONLY);
    return () => {
      camera.layers.mask = previous;
    };
  }, [camera]);
  const seats = useSeatContext();
  const occupant = useSyncExternalStore(
    seats.subscribeOccupancy,
    () => seats.getOccupantId('doom-arcade/seat'),
    () => null,
  );
  const [states, setStates] = useState(new Map<string, unknown>());
  const sendState = (key: string, payload: unknown) => {
    queueMicrotask(() => setStates((previous) => new Map(previous).set(key, payload)));
  };
  return (
    <InstanceStateContext.Provider value={{ states, sendState }}>
      {children}
      {window.matchMedia('(pointer: coarse)').matches && !occupant && (
        <Html
          fullscreen
          position={[0, 1.5, -3.61]}
          calculatePosition={(_object, _camera, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              position: 'absolute',
              top: 84,
              left: 16,
              right: 16,
              textAlign: 'center',
              fontFamily: 'sans-serif',
            }}
          >
            <button
              onClick={(event) => {
                event.stopPropagation();
                seats.sit('doom-arcade/seat');
              }}
              style={{
                pointerEvents: 'auto',
                minHeight: 48,
                padding: '12px 20px',
                background: '#28352d',
                color: '#e2dfc9',
                border: '1px solid #8c9277',
                borderRadius: 6,
                fontSize: 16,
              }}
            >
              DOOMのタッチ操作を試す
            </button>
            <p style={{ marginTop: 8, color: '#e2dfc9', fontSize: 12 }}>
              ローカル確認：部屋の移動・視点操作はPC用です
            </p>
          </div>
        </Html>
      )}
    </InstanceStateContext.Provider>
  );
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
const worldConfig = xriftConfig.world as {
  physics?: PhysicsConfig;
  camera?: CameraConfig;
  outputBufferType?: string;
};
createRoot(rootElement).render(
  <XRiftProvider baseUrl="/">
    <DevEnvironment
      physicsConfig={worldConfig.physics}
      camera={worldConfig.camera}
      outputBufferType={worldConfig.outputBufferType}
    >
      <LocalPreview>
        <World />
      </LocalPreview>
    </DevEnvironment>
  </XRiftProvider>,
);
