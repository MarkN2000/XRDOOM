// SPDX-License-Identifier: GPL-2.0-or-later
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import {
  Interactable,
  LAYERS,
  Seat,
  SpawnPoint,
  useInstanceEvent,
  useInstanceState,
  useSeatContext,
  useUsers,
  useViewpoint,
  useXRift,
} from '@xrift/world-components';
import {
  CanvasTexture,
  VideoTexture,
  LinearFilter,
  NearestFilter,
  SRGBColorSpace,
  Vector3,
  PerspectiveCamera,
  DoubleSide,
  type Group,
  type Mesh,
} from 'three';
import { KEY, spatialAudio, startDoom, type DoomRuntime } from './doom';
import { useBroadcast, type Session } from './useBroadcast';
import { useControls, type Action, type ControlState } from './useControls';
import {
  Room,
  RoomModel,
  ROOM_SCALE,
  WORLD_OFFSET,
  STATION_FORWARD,
  SCREEN,
  SCREEN_WORLD,
  CHAIR,
} from './Room';
import { DosHint, DosPrompt } from './DosPrompt';
import { MobileButton } from './MobileUI';
const SEAT = 'doom-arcade/seat';
function Button({
  id,
  label,
  action,
  onAction,
  buttons,
  position,
  width = 0.48,
  height = 0.19,
  font,
}: {
  id: string;
  label: string;
  action: Action;
  onAction(action: Action): void;
  buttons: MutableRefObject<Mesh[]>;
  position: [number, number, number];
  width?: number;
  height?: number;
  font: string;
}) {
  const mesh = useRef<Mesh | null>(null);
  const register = useCallback(
    (value: Mesh | null) => {
      if (mesh.current) buttons.current = buttons.current.filter((item) => item !== mesh.current);
      mesh.current = value;
      if (value) buttons.current.push(value);
    },
    [buttons],
  );
  return (
    <group position={position}>
      <Interactable id={id} onInteract={() => onAction(action)} interactionText={label}>
        <mesh ref={register} userData={{ action }} layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}>
          <boxGeometry args={[width, height, 0.012]} />
          <meshBasicMaterial color={action === 'leave' ? '#493f34' : '#252525'} />
        </mesh>
        <Text
          layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}
          font={font}
          position={[0, 0, 0.009]}
          fontSize={Math.min(height * 0.29, width / (label.length * 1.1))}
          color="#e2dfc9"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      </Interactable>
    </group>
  );
}
export function World() {
  const { baseUrl } = useXRift();
  const { localUser } = useUsers();
  const seats = useSeatContext();
  const { camera, gl, size } = useThree();
  const { isThirdPerson, getViewpoint } = useViewpoint();
  const inVR = useSyncExternalStore(
    useCallback(
      (notify) => {
        gl.xr.addEventListener('sessionstart', notify);
        gl.xr.addEventListener('sessionend', notify);
        return () => {
          gl.xr.removeEventListener('sessionstart', notify);
          gl.xr.removeEventListener('sessionend', notify);
        };
      },
      [gl],
    ),
    () => gl.xr.isPresenting,
    () => false,
  );
  const viewBlocked = !inVR && isThirdPerson;
  const mobile = !inVR && (size.width < 650 || window.matchMedia('(pointer: coarse)').matches);
  const mobileLandscape = mobile && size.width > size.height;
  const desktop = !inVR && window.matchMedia('(any-pointer: fine)').matches;
  const occupant = useSyncExternalStore(
    seats.subscribeOccupancy,
    () => seats.getOccupantId(SEAT),
    () => null,
  );
  const seated = occupant !== null && occupant === seats.getLocalUserId();
  const userId = localUser?.id ?? seats.getLocalUserId() ?? 'local';
  const [sharedSession, setSession] = useInstanceState<Session>('doom-arcade/session', null);
  const [lastPlayer, setLastPlayer] = useInstanceState<string | null>('doom-arcade/last-player', null);
  const session =
    sharedSession && (sharedSession.owner === userId ? seated : occupant === sharedSession.owner)
      ? sharedSession
      : null;
  const hosting = seated && session?.owner === userId;
  const originalFov = useRef(camera instanceof PerspectiveCamera ? camera.fov : 50);
  const [seatVisible, setSeatVisible] = useState(true);
  const [runtime, setRuntime] = useState<DoomRuntime | null>(null);
  const retainedRuntime = useRef<DoomRuntime | null>(null);
  const [booting, setBooting] = useState(false);
  const [menu, setMenu] = useState(true);
  const showMenu = menu || viewBlocked;
  const framedFov = viewBlocked
    ? originalFov.current
    : hosting && mobile
      ? mobileLandscape
        ? (2 *
            Math.atan(
              (Math.max(0.5, (0.86 * size.height) / size.width) * ROOM_SCALE) /
                (2 * (CHAIR[2] - 0.15 - SCREEN[2])),
            ) *
            180) /
          Math.PI
        : Math.max(
            originalFov.current,
            (2 *
              Math.atan(
                (0.86 * ROOM_SCALE) /
                  ((2 * (CHAIR[2] - 0.15 - SCREEN[2]) * size.width) / size.height),
              ) *
              180) /
              Math.PI,
          )
      : hosting && desktop
        ? Math.max(
            36,
            (2 *
              Math.atan(
                (0.86 * ROOM_SCALE) /
                  ((2 * (CHAIR[2] - 0.15 - SCREEN[2]) * size.width) / size.height),
              ) *
              180) /
              Math.PI,
          )
        : originalFov.current;
  const focusOffset = mobileLandscape ? 0 : desktop && !mobile ? 0.02 : 0.23;
  const [streamSound, setStreamSound] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioRunning, setAudioRunning] = useState(false);
  const [message, setMessage] = useState('');
  const buttons = useRef<Mesh[]>([]);
  const axes = useRef<ControlState>({ forward: 0, right: 0 });
  const hud = useRef<Group>(null);
  const desktopHud = useRef<Group>(null);
  const desktopGuide = useRef<Group>(null);
  const screenBottom = useRef(new Vector3());
  const gameView = useRef(camera.quaternion.clone());
  const listenerPosition = useRef(new Vector3());
  const listenerForward = useRef(new Vector3());
  const viewerAudio = useRef<ReturnType<typeof spatialAudio> | null>(null);
  const sessionRef = useRef(sharedSession);
  sessionRef.current = sharedSession;
  const broadcast = useBroadcast(userId, session, runtime?.stream ?? null);
  const font = `${baseUrl}NotoSansJP.otf`;
  useInstanceEvent('user-left', ({ userId: departed }) => {
    if (sessionRef.current?.owner === departed) setSession(null);
  });
  useEffect(() => {
    if (!seated) setSeatVisible(true);
    if (seated && session && session.owner !== userId) setSeatVisible(false);
  }, [seated, session?.owner, userId]);
  useEffect(() => {
    if (!hosting || viewBlocked || gl.xr.isPresenting) return;
    const frame = requestAnimationFrame(() => {
      if (gl.xr.isPresenting || getViewpoint() === 'third-person') return;
      camera.lookAt(SCREEN_WORLD[0], SCREEN_WORLD[1] - focusOffset * ROOM_SCALE, SCREEN_WORLD[2]);
      gameView.current.copy(camera.quaternion);
    });
    return () => cancelAnimationFrame(frame);
  }, [hosting, camera, gl, focusOffset, inVR, viewBlocked, getViewpoint]);
  useEffect(() => {
    if (!hosting || viewBlocked || gl.xr.isPresenting || !(camera instanceof PerspectiveCamera))
      return;
    const previous = camera.fov;
    camera.fov = framedFov;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = previous;
      camera.updateProjectionMatrix();
    };
  }, [hosting, gl, camera, framedFov, inVR, viewBlocked]);
  useEffect(() => {
    if (hosting && viewBlocked) {
      setMenu(true);
    }
  }, [hosting, viewBlocked]);
  useEffect(() => {
    return () => {
      retainedRuntime.current?.dispose();
      retainedRuntime.current = null;
    };
  }, [baseUrl, userId]);
  useEffect(() => {
    if (!hosting && lastPlayer && lastPlayer !== userId) {
      retainedRuntime.current?.dispose();
      retainedRuntime.current = null;
    }
  }, [hosting, lastPlayer, userId]);
  useEffect(() => {
    if (!hosting) return;
    let cancelled = false;
    let created: DoomRuntime | undefined;
    setMessage('');
    setMenu(true);
    setBooting(false);
    if (retainedRuntime.current) {
      created = retainedRuntime.current;
      setRuntime(created);
    } else void startDoom(baseUrl, 3)
      .then((value) => {
        if (cancelled) {
          value.dispose();
          return;
        }
        created = value;
        retainedRuntime.current = value;
        value.pause(true);
        setRuntime(value);
        setMessage('');
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      created?.pause(true);
      if (created && !created.started) {
        created.dispose();
        if (retainedRuntime.current === created) retainedRuntime.current = null;
      }
      setRuntime(null);
      axes.current = { forward: 0, right: 0 };
    };
  }, [hosting, session?.id, baseUrl, userId]);
  useEffect(() => {
    runtime?.pause(!hosting || showMenu || booting);
  }, [runtime, showMenu, booting, hosting]);
  useEffect(() => {
    runtime?.run(false);
  }, [runtime]);
  useEffect(() => {
    runtime?.audio?.volume(0.5);
  }, [runtime]);
  useEffect(() => {
    if (!audioContext) return;
    const changed = () => setAudioRunning(audioContext.state === 'running');
    changed();
    audioContext.addEventListener('statechange', changed);
    return () => {
      audioContext.removeEventListener('statechange', changed);
      void audioContext.close();
    };
  }, [audioContext]);
  const localTexture = useMemo(() => {
    if (!runtime) return null;
    const texture = new CanvasTexture(runtime.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = texture.magFilter = runtime.started ? LinearFilter : NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [runtime, booting]);
  useEffect(() => () => localTexture?.dispose(), [localTexture]);
  const [remoteTexture, setRemoteTexture] = useState<VideoTexture | null>(null);
  useEffect(() => {
    const stream = broadcast.remoteStream;
    setRemoteTexture(null);
    setMessage('');
    if (!stream) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const texture = new VideoTexture(video);
    texture.colorSpace = SRGBColorSpace;
    video.onloadeddata = () => setRemoteTexture(texture);
    let disposed = false;
    void video.play().catch(() => {
      if (!disposed) setMessage('映像を再生できません');
    });
    return () => {
      disposed = true;
      video.onloadeddata = null;
      video.pause();
      video.srcObject = null;
      texture.dispose();
    };
  }, [broadcast.remoteStream]);
  useEffect(() => {
    const stream = broadcast.remoteStream;
    if (!audioContext || !streamSound || seated || !stream?.getAudioTracks().length) return;
    const audio = spatialAudio(audioContext, audioContext.createMediaStreamSource(stream));
    audio.volume(0.5);
    viewerAudio.current = audio;
    return () => {
      audio.dispose();
      viewerAudio.current = null;
    };
  }, [broadcast.remoteStream, audioContext, streamSound, seated]);
  const restorePointerLock = useCallback(async () => {
    if (!desktop || mobile || gl.xr.isPresenting || document.pointerLockElement?.contains(gl.domElement))
      return;
    try {
      await document.body.requestPointerLock();
    } catch {
      // The browser may require another click after focus loss.
    }
  }, [desktop, mobile, gl]);
  const onAction = useCallback(
    async (action: Action) => {
      if (action === 'sit') {
        if (!session || session.owner === userId) seats.sit(SEAT);
        return;
      }
      if (action === 'soundOn') {
        const context = audioContext ?? new AudioContext();
        setAudioContext(context);
        setStreamSound(true);
        void context.resume().catch(() => setAudioRunning(false));
        return;
      }
      if (action === 'soundOff') {
        setStreamSound(false);
        return;
      }
      if (!hosting) return;
      if (action === 'leave') {
        void restorePointerLock();
        runtime?.release();
        setSession(null);
        setSeatVisible(false);
        setMenu(true);
        return;
      }
      if (action === 'menu') {
        setMenu(true);
        if (!gl.xr.isPresenting && document.pointerLockElement?.contains(gl.domElement))
          document.exitPointerLock();
        return;
      }
      if (action === 'resume' || action === 'restart') {
        if (!showMenu || (action === 'restart' && !runtime?.started)) return;
        if (!gl.xr.isPresenting && getViewpoint() === 'third-person') return;
        if (runtime && !booting) {
          runtime.resumeAudio();
          if (
            desktop &&
            !mobile &&
            !gl.xr.isPresenting &&
            !document.pointerLockElement?.contains(gl.domElement)
          ) {
            try {
              await document.body.requestPointerLock();
            } catch {
              return;
            }
          }
          if (
            sessionRef.current?.id !== session?.id ||
            seats.getOccupantId(SEAT) !== seats.getLocalUserId()
          )
            return;
          if (!gl.xr.isPresenting) {
            camera.lookAt(
              SCREEN_WORLD[0],
              SCREEN_WORLD[1] - focusOffset * ROOM_SCALE,
              SCREEN_WORLD[2],
            );
            gameView.current.copy(camera.quaternion);
          }
          if (action === 'restart') runtime.restart();
          setMenu(false);
          if (!runtime.started) {
            setBooting(true);
            void runtime.start().then((completed) => {
              if (
                completed &&
                retainedRuntime.current === runtime &&
                sessionRef.current?.id === session?.id
              ) {
                setLastPlayer(userId);
                setBooting(false);
              }
            });
          } else setLastPlayer(userId);
        }
        return;
      }
      if (!menu && !booting && (gl.xr.isPresenting || getViewpoint() === 'first-person')) {
        runtime?.resumeAudio();
        if (action === 'map') runtime?.pulse(KEY.map);
        if (action === 'weapon') runtime?.pulse(KEY.next);
        if (action === 'use') runtime?.pulse(KEY.use);
        if (action === 'fire') runtime?.pulse(KEY.fire);
      }
    },
    [
      hosting,
      runtime,
      menu,
      showMenu,
      booting,
      session,
      seats,
      userId,
      audioContext,
      setSession,
      setLastPlayer,
      restorePointerLock,
      camera,
      gl,
      focusOffset,
      inVR,
      getViewpoint,
      desktop,
      mobile,
    ],
  );
  useControls(hosting && !viewBlocked, !showMenu && !booting, runtime, buttons, axes, onAction);
  useFrame(() => {
    if (hosting && !menu && !gl.xr.isPresenting) {
      if (getViewpoint() === 'third-person') {
        runtime?.pause(true);
        setMenu(true);
      } else camera.quaternion.copy(gameView.current);
    }
    if (localTexture && runtime && localTexture.userData.frame !== runtime.frame) {
      localTexture.userData.frame = runtime.frame;
      localTexture.needsUpdate = true;
    }
    camera.getWorldPosition(listenerPosition.current);
    camera.getWorldDirection(listenerForward.current);
    runtime?.audio?.listener(listenerPosition.current, listenerForward.current);
    viewerAudio.current?.listener(listenerPosition.current, listenerForward.current);
    if (hud.current) {
      hud.current.position.copy(camera.position);
      hud.current.parent?.worldToLocal(hud.current.position);
      hud.current.quaternion.copy(camera.quaternion);
    }
    if (desktopHud.current) {
      desktopHud.current.position.copy(camera.position);
      desktopHud.current.quaternion.copy(camera.quaternion);
      desktopHud.current.parent?.worldToLocal(desktopHud.current.position);
      screenBottom.current
        .set(SCREEN_WORLD[0], SCREEN_WORLD[1] - 0.225 * ROOM_SCALE, SCREEN_WORLD[2])
        .project(camera);
      if (desktopGuide.current)
        desktopGuide.current.visible =
          ((1 + screenBottom.current.y) * size.height) / 2 >= desktopGuideHeight + 24;
    }
  });
  const buttonProps = { buttons, onAction, font };
  const touchProps = buttonProps;
  const texture = localTexture ?? remoteTexture;
  const gesture = inVR ? '選択して' : mobile ? 'タップで' : 'クリックで';
  const screenAction: Action | undefined = hosting
    ? runtime && showMenu && !booting && !viewBlocked
      ? 'resume'
      : undefined
    : !seated && !session
      ? 'sit'
      : undefined;
  const screenHint =
    hosting && showMenu && !booting
      ? viewBlocked
        ? '一人称視点に\n切り替えてください'
        : message ||
          (runtime
            ? runtime.started
              ? `${gesture}再開`
              : `${inVR ? 'Select' : mobile ? 'Tap' : 'Click'} to start`
            : 'Loading DOOM...')
      : !hosting && session && !remoteTexture
        ? message || broadcast.status
        : null;
  const consoleHint = hosting && !runtime?.started && !viewBlocked && !message;
  const splitScreen = screenAction === 'resume' && Boolean(runtime?.started);
  const hudScale = (2 * Math.tan((framedFov * Math.PI) / 360)) / size.height;
  const hudRight = size.width / 2;
  const hudBottom = -size.height / 2;
  const desktopButtonWidth = Math.min(248, size.width / 2 - 96);
  const desktopGuideWidth = Math.max(220, Math.min(500, size.width / 2 - 96));
  const desktopGuideColumns = desktopGuideWidth >= 430 ? 2 : 1;
  const desktopGuideHeight = (desktopGuideColumns === 2 ? 4 : 7) * 28 + 24;
  const desktopGuideTextures = useMemo(() => {
    if (!desktop || mobile) return [];
    return [180, desktopGuideWidth].map((width, index) => {
      const height = index === 0 ? 128 : desktopGuideHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * 2);
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.fillStyle = '#252525';
      ctx.fillRect(0, 0, width, height);
      ctx.textBaseline = 'middle';
      ctx.font = '16px sans-serif';
      const keycap = (label: string, x: number, y: number) => {
        const keyWidth = ctx.measureText(label).width + 12;
        ctx.strokeStyle = '#77736c';
        ctx.beginPath();
        const keyHeight = label === 'Esc' ? 36 : 24;
        ctx.roundRect(x, y - keyHeight / 2, keyWidth, keyHeight, 3);
        ctx.stroke();
        ctx.fillText(label, x + 6, y);
        return keyWidth;
      };
      if (index === 0) {
        ctx.font = '26px sans-serif';
        ctx.fillStyle = '#f4d99c';
        keycap('Esc', (width - ctx.measureText('Esc').width - 12) / 2, 34);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f2f0e9';
        ctx.font = '18px sans-serif';
        ctx.fillText('一時停止', width / 2, 72);
        ctx.fillStyle = '#c6c4bf';
        ctx.font = '12px sans-serif';
        ctx.fillText('カーソル解除', width / 2, 99);
      } else {
        const rows = [
          ['移動', ['W A S D']],
          ['旋回', ['マウス', '← →']],
          ['走る', ['Shift', '長押し']],
          ['地図', ['M', 'Tab']],
          ['射撃', ['左クリック']],
          ['使う', ['Space', 'F']],
          ['武器', ['右クリック', 'R']],
        ] as const;
        rows.forEach(([label, keys], row) => {
          const column = desktopGuideColumns === 2 && row >= 4 ? 1 : 0;
          const x = 18 + column * (width / 2);
          const y = 24 + (row - column * 4) * 28;
          ctx.fillStyle = '#c6c4bf';
          ctx.fillText(label, x, y);
          let keyX = x + 44;
          keys.forEach((key, keyIndex) => {
            if (keyIndex && key !== '長押し') {
              ctx.fillStyle = '#aaa69e';
              ctx.fillText('/', keyX, y);
              keyX += 12;
            }
            ctx.fillStyle = '#f2f0e9';
            if (['マウス', '左クリック', '右クリック', '長押し'].includes(key)) {
              ctx.fillText(key, keyX, y);
              keyX += ctx.measureText(key).width + 8;
            } else keyX += keycap(key, keyX, y) + 8;
          });
        });
      }
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      return texture;
    });
  }, [desktop, mobile, desktopGuideWidth, desktopGuideColumns, desktopGuideHeight]);
  useEffect(
    () => () => desktopGuideTextures.forEach((texture) => texture.dispose()),
    [desktopGuideTextures],
  );
  const touchTop = -hudBottom - 112;
  const touchCenter = hudBottom + size.height * (size.width > size.height ? 144 / 375 : 228 / 722);
  return (
    <Suspense fallback={null}>
      <SpawnPoint position={[0, 0, 0]} />
      <group name="doom-room-origin" position={[...WORLD_OFFSET]}>
        <Room baseUrl={baseUrl} />
        <mesh
          name="doom-screen-backing"
          position={[SCREEN[0], SCREEN[1], SCREEN[2] - 0.004 * ROOM_SCALE]}
          scale={ROOM_SCALE}
        >
          <planeGeometry args={[0.6, 0.45]} />
          <meshBasicMaterial color="black" side={DoubleSide} toneMapped={false} />
        </mesh>
        <Suspense fallback={null}>
          <Text name="doom-font-preload" font={font} visible={false}>席を離れる Space</Text>
        </Suspense>
        <Suspense fallback={null}>
        {!session && !seated && seatVisible && (
          <Interactable
            id="doom-station-seat"
            onInteract={() => onAction('sit')}
            interactionText="座って遊ぶ"
          >
            <mesh
              name="doom-seat-target"
              position={[0, 0.92 * ROOM_SCALE, (-3.07 + STATION_FORWARD) * ROOM_SCALE]}
              scale={ROOM_SCALE}
              userData={{ action: 'sit' }}
              ref={(value) => {
                buttons.current = buttons.current.filter(
                  (item) => item.name !== 'doom-seat-target',
                );
                if (value) buttons.current.push(value);
              }}
            >
              <boxGeometry args={[0.84, 1.88, 2.46]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                colorWrite={false}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
          </Interactable>
        )}
        <Interactable
          id="doom-screen"
          enabled={!splitScreen && Boolean(screenAction)}
          onInteract={() => screenAction && onAction(screenAction)}
          interactionText={hosting ? (runtime?.started ? '再開する' : '開始する') : '座って遊ぶ'}
        >
          <mesh
            name="doom-screen"
            position={[...SCREEN]}
            scale={ROOM_SCALE}
            userData={{ action: splitScreen ? undefined : screenAction }}
            ref={(value) => {
              buttons.current = buttons.current.filter((item) => item.name !== 'doom-screen');
              if (value && screenAction && !splitScreen) buttons.current.push(value);
            }}
          >
            <planeGeometry args={[0.6, 0.45]} />
            <meshBasicMaterial
              key={texture?.uuid ?? 'idle'}
              map={texture}
              color={texture ? 'white' : '#07110d'}
              toneMapped={false}
            />
          </mesh>
          {screenHint && !splitScreen && (
            <group
              name={hosting ? 'doom-play-hint' : 'doom-stream-status'}
              position={[
                SCREEN[0],
                SCREEN[1],
                SCREEN[2] + (consoleHint ? 0.003 : 0.012) * ROOM_SCALE,
              ]}
              scale={ROOM_SCALE}
            >
              {consoleHint ? (
                <DosHint baseUrl={baseUrl} text={screenHint} ready={screenAction === 'resume'} />
              ) : (
                <>
                  <mesh visible={!(hosting && runtime?.started && showMenu)}>
                    <planeGeometry args={[0.6, 0.45]} />
                    <meshBasicMaterial
                      color="#07110d"
                      transparent
                      opacity={0.94}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                  <Text
                    name={hosting ? 'doom-play-hint-text' : 'doom-stream-status-text'}
                    font={font}
                    position={[0, 0, 0.003]}
                    fontSize={viewBlocked ? 0.062 : 0.065}
                    maxWidth={0.56}
                    textAlign="center"
                    color="#e2dfc9"
                    material-toneMapped={false}
                  >
                    {screenHint}
                  </Text>
                </>
              )}
            </group>
          )}
        </Interactable>
        {splitScreen && (
          <group name="doom-screen-options" position={[SCREEN[0], SCREEN[1], SCREEN[2] + 0.012 * ROOM_SCALE]} scale={ROOM_SCALE}>
            {([
              ['resume', 0.0675, 0.315, `${gesture}再開`],
              ['restart', -0.1575, 0.135, '最初から'],
            ] as const).map(([action, y, height, label]) => (
              <Interactable key={action} id={`doom-screen-${action}`} onInteract={() => onAction(action)} interactionText={label}>
                <mesh
                  name={`doom-screen-${action}`}
                  position={[0, y, 0]}
                  userData={{ action }}
                  ref={(value) => {
                    buttons.current = buttons.current.filter(item => item.name !== `doom-screen-${action}`);
                    if (value) buttons.current.push(value);
                  }}
                >
                  <planeGeometry args={[0.6, height]} />
                  <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
                </mesh>
                <Text font={font} position={[0, y, 0.003]} fontSize={action === 'resume' ? 0.05 : 0.045} maxWidth={0.56} textAlign="center" color="#e2dfc9" material-toneMapped={false}>
                  {label}
                </Text>
              </Interactable>
            ))}
            <mesh position={[0, -0.09, 0.003]}>
              <planeGeometry args={[0.56, 0.0015]} />
              <meshBasicMaterial color="#e2dfc9" toneMapped={false} />
            </mesh>
          </group>
        )}
        {!texture && <DosPrompt baseUrl={baseUrl} />}
        {!seated && session && (
          <group
            name="doom-stream-audio"
            position={[0.68 * ROOM_SCALE, SCREEN[1], SCREEN[2] + 0.025 * ROOM_SCALE]}
            scale={0.002 * ROOM_SCALE}
          >
            <MobileButton
              {...buttonProps}
              id="doom-sound-toggle"
              label={streamSound && audioRunning ? '配信音声 ON' : '配信音声 OFF'}
              icon={streamSound && audioRunning ? 'soundOn' : 'soundOff'}
              primary={streamSound && audioRunning}
              action={streamSound && audioRunning ? 'soundOff' : 'soundOn'}
              position={[0, 0, 0]}
              width={224}
              height={64}
            />
          </group>
        )}
        </Suspense>
        {seatVisible && (
          <Seat
            id={SEAT}
            position={[...CHAIR]}
            exitOffset={{ forward: 0, right: 1.1 * ROOM_SCALE }}
            enabled={!session || session.owner === userId}
            interactionText="座る"
            onControlInput={(input) => {
              axes.current = input;
            }}
            onEnter={({ isLocalUser }) => {
              if (!isLocalUser) return;
              setSession({
                id: crypto.randomUUID(),
                owner: userId,
                name: localUser?.displayName ?? 'プレイヤー',
              });
              setMenu(true);
            }}
            onLeave={({ isLocalUser }) => {
              if (!isLocalUser) return;
              void restorePointerLock();
              runtime?.release();
              if (sessionRef.current?.owner === userId) setSession(null);
              setMenu(true);
            }}
          >
            <group scale={ROOM_SCALE}>
              <RoomModel baseUrl={baseUrl} name="chair" />
            </group>
          </Seat>
        )}
        <Suspense fallback={null}>
        {hosting && (showMenu || booting) && !mobile && !desktop && (
          <group
            name="doom-idle-controls"
            position={[0, 1.04 * ROOM_SCALE, (-3.3 + STATION_FORWARD) * ROOM_SCALE]}
            rotation={[-0.35, 0, 0]}
            scale={ROOM_SCALE}
          >
            <Button
              {...buttonProps}
              id="doom-leave"
              label="席を離れる"
              action="leave"
              position={[0, 0, 0]}
              width={0.38}
              height={0.09}
            />
          </group>
        )}
        {hosting && desktop && !mobile && (
          <group ref={desktopHud}>
            <group name="doom-desktop-controls" position={[0, 0, -1]} scale={hudScale}>
              {!showMenu && !booting && (
                <group ref={desktopGuide} name="doom-desktop-guide" position={[0, hudBottom + 12, 0]}>
                  {desktopGuideTextures.map((texture, index) => {
                    const width = index === 0 ? 180 : desktopGuideWidth;
                    const height = index === 0 ? 128 : desktopGuideHeight;
                    return (
                      <mesh
                        key={index}
                        name={index === 0 ? 'doom-desktop-pause-guide' : 'doom-desktop-input-guide'}
                        position={[index === 0 ? -80 - width / 2 : 80 + width / 2, height / 2, 0]}
                        layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}
                        renderOrder={18}
                      >
                        <planeGeometry args={[width, height]} />
                        <meshBasicMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false} />
                      </mesh>
                    );
                  })}
                </group>
              )}
              {(showMenu || booting) && (
                <MobileButton
                  {...buttonProps}
                  id="doom-leave-playing"
                  label="席を離れる  Space"
                  icon="leave"
                  primary
                  action="leave"
                  position={[desktopButtonWidth / 2 + 80, hudBottom + 40, 0]}
                  width={desktopButtonWidth}
                  height={56}
                  fontSize={Math.min(16, (desktopButtonWidth - 40) / 13)}
                />
              )}
            </group>
          </group>
        )}
        {hosting && !showMenu && !booting && !mobile && !desktop && (
          <group
            name="doom-controls"
            position={[0, 0.98 * ROOM_SCALE, (-3.32 + STATION_FORWARD) * ROOM_SCALE]}
            rotation={[-0.35, 0, 0]}
            scale={ROOM_SCALE}
          >
            {[
              '移動 左スティック\n使う 左トリガー',
              '旋回 右スティック\n武器 右スティック上下',
              '射撃 右トリガー\n一時停止 B',
            ].map((label, index) => (
              <group key={label} position={[(index - 1) * 0.3, 0.045, 0]}>
                <mesh layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}>
                  <planeGeometry args={[0.28, 0.1]} />
                  <meshBasicMaterial color="#252525" />
                </mesh>
                <Text
                  layers-mask={1 << LAYERS.FIRST_PERSON_ONLY}
                  font={font}
                  position={[0, 0, 0.006]}
                  fontSize={0.018}
                  lineHeight={1.15}
                  color="#dadcc3"
                  textAlign="center"
                >
                  {label}
                </Text>
              </group>
            ))}
            <Button
              {...buttonProps}
              id="doom-menu"
              label="一時停止 B"
              action="menu"
              position={[-0.3, -0.07, 0]}
              width={0.24}
              height={0.07}
            />
            <Button
              {...buttonProps}
              id="doom-map"
              label="地図"
              action="map"
              position={[0, -0.07, 0]}
              width={0.24}
              height={0.07}
            />
            <Button
              {...buttonProps}
              id="doom-leave-playing"
              label="席を離れる"
              action="leave"
              position={[0.3, -0.07, 0]}
              width={0.24}
              height={0.07}
            />
          </group>
        )}
        {hosting && mobile && (
          <group ref={hud}>
            <group position={[0, 0, -1]} scale={hudScale}>
              {(showMenu || booting) && (
                <MobileButton
                  {...touchProps}
                  id="doom-touch-leave"
                  label="離席"
                  action="leave"
                  icon="leave"
                  width={76}
                  height={44}
                  position={[-hudRight + 56, touchTop, 0]}
                />
              )}
              {!showMenu && !booting && (
                <>
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-menu"
                    label=""
                    action="menu"
                    icon="menu"
                    round
                    width={44}
                    height={44}
                    position={[
                      hudRight - 40,
                      mobileLandscape ? hudBottom + 44 : touchTop,
                      0,
                    ]}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-leave"
                    label="離席"
                    action="leave"
                    icon="leave"
                    width={76}
                    height={44}
                    position={[-hudRight + 56, touchTop, 0]}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-map"
                    label="地図"
                    action="map"
                    icon="map"
                    width={76}
                    height={44}
                    position={[-hudRight + 148, touchTop, 0]}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-stick"
                    label="移動"
                    joystick
                    position={[-hudRight + 74, touchCenter, 0]}
                    width={116}
                    height={116}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-fire"
                    label="射撃"
                    action="fire"
                    icon="fire"
                    hold={KEY.fire}
                    round
                    position={[hudRight - 74, touchCenter, 0]}
                    width={92}
                    height={92}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-use"
                    label="使う"
                    action="use"
                    icon="use"
                    round
                    width={56}
                    height={56}
                    position={[hudRight - 42, touchCenter + 86, 0]}
                  />
                  <MobileButton
                    {...touchProps}
                    id="doom-touch-weapon"
                    label="武器"
                    action="weapon"
                    icon="weapon"
                    round
                    width={56}
                    height={56}
                    position={[hudRight - 116, touchCenter + 84, 0]}
                  />
                </>
              )}
            </group>
          </group>
        )}
      </Suspense>
      </group>
    </Suspense>
  );
}
