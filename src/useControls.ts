// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useViewpoint } from '@xrift/world-components';
import { Raycaster, Vector2, Vector3, Matrix4, type Mesh } from 'three';
import { KEY, type DoomRuntime } from './doom';
export type Action =
  | 'sit'
  | 'menu'
  | 'resume'
  | 'weapon'
  | 'use'
  | 'map'
  | 'leave'
  | 'soundOn'
  | 'soundOff'
  | 'fire';
export type ControlState = {
  forward: number;
  right: number;
};
const keyboardKeys: Record<string, number> = {
  KeyW: KEY.forward,
  KeyS: KEY.back,
  KeyA: KEY.strafeLeft,
  KeyD: KEY.strafeRight,
  ArrowUp: KEY.forward,
  ArrowDown: KEY.back,
  ArrowLeft: KEY.left,
  ArrowRight: KEY.right,
  KeyZ: KEY.strafeLeft,
  KeyC: KEY.strafeRight,
  KeyF: KEY.use,
  Space: KEY.use,
  ShiftLeft: KEY.speed,
  ShiftRight: KEY.speed,
};
export function useControls(
  active: boolean,
  playing: boolean,
  runtime: DoomRuntime | null,
  buttons: MutableRefObject<Mesh[]>,
  axes: MutableRefObject<ControlState>,
  action: (action: Action) => void,
) {
  const { gl, camera, get, size } = useThree();
  const { getViewpoint } = useViewpoint();
  const current = useRef({ active, playing, runtime, action });
  current.current = { active, playing, runtime, action };
  const held = useRef(new Set<number>());
  const keyboard = useRef(new Set<string>());
  const keyboardTarget = useRef<HTMLInputElement | null>(null);
  const mouseDelta = useRef(0);
  const desktopPointer = window.matchMedia('(any-pointer: fine)').matches;
  const inVR = gl.xr.isPresenting;
  const touches = useRef(new Map<number, number>());
  const ray = useRef(new Raycaster());
  const point = useRef(new Vector2());
  const rotation = useRef(new Matrix4());
  const previousWeapon = useRef(false);
  const previousMenu = useRef(false);
  const stick = useRef<{
    id: number;
    x: number;
    y: number;
    forward: number;
    right: number;
  } | null>(null);
  const look = useRef<{
    id: number;
    x: number;
  } | null>(null);
  const isGameSurface = (target: EventTarget | null) =>
    target === gl.domElement ||
    target === get().events.connected ||
    (target === document.pointerLockElement &&
      Boolean(document.pointerLockElement?.contains(gl.domElement)));
  const hitButton = (x?: number, y?: number) => {
    const bounds = gl.domElement.getBoundingClientRect();
    point.current.set(
      x === undefined ? 0 : ((x - bounds.left) / bounds.width) * 2 - 1,
      y === undefined ? 0 : -((y - bounds.top) / bounds.height) * 2 + 1,
    );
    ray.current.layers.enableAll();
    ray.current.setFromCamera(point.current, camera);
    return ray.current.intersectObjects(buttons.current, false)[0]?.object;
  };
  useLayoutEffect(() => {
    let handledTouch = false;
    const clear = () => {
      held.current.clear();
      keyboard.current.clear();
      mouseDelta.current = 0;
      touches.current.clear();
      stick.current = null;
      look.current = null;
      current.current.runtime?.release();
      for (const button of buttons.current)
        Object.assign(button.userData, {
          pressed: false,
          pointer: undefined,
          stickX: 0,
          stickY: 0,
        });
    };
    const mouseDown = (event: MouseEvent) => {
      if (!isGameSurface(event.target)) return;
      const locked = Boolean(document.pointerLockElement?.contains(gl.domElement));
      const button = hitButton(
        locked ? undefined : event.clientX,
        locked ? undefined : event.clientY,
      );
      if (
        event.button === 0 &&
        button?.userData.hold &&
        current.current.active &&
        current.current.playing
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        held.current.add(button.userData.hold);
        current.current.runtime?.pulse(button.userData.hold);
        return;
      }
      if (event.button === 0 && button?.userData.action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        current.current.action(button.userData.action);
        return;
      }
      if (!current.current.active || !current.current.playing) return;
      if (keyboardTarget.current) {
        event.preventDefault();
        keyboardTarget.current.focus({ preventScroll: true });
      }
      if (event.button === 0) {
        held.current.add(KEY.fire);
        current.current.runtime?.pulse(KEY.fire);
        event.stopImmediatePropagation();
      }
      if (event.button === 2) {
        held.current.add(KEY.use);
        current.current.runtime?.pulse(KEY.use);
        event.stopImmediatePropagation();
      }
      current.current.runtime?.resumeAudio();
    };
    const mouseUp = (event: MouseEvent) => {
      held.current.delete(event.button === 2 ? KEY.use : KEY.fire);
    };
    const mouseMove = (event: MouseEvent) => {
      if (
        !current.current.active ||
        !current.current.playing ||
        gl.xr.isPresenting ||
        !isGameSurface(event.target)
      )
        return;
      if (document.pointerLockElement?.contains(gl.domElement))
        mouseDelta.current += event.movementX;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || gl.xr.isPresenting || !isGameSurface(event.target))
        return;
      handledTouch = false;
      const button = hitButton(event.clientX, event.clientY);
      if (!button) {
        if (current.current.active && current.current.playing && !gl.xr.isPresenting) {
          handledTouch = true;
          event.preventDefault();
          event.stopImmediatePropagation();
          const bounds = gl.domElement.getBoundingClientRect();
          if (!look.current && event.clientX > bounds.left + bounds.width / 2) {
            look.current = { id: event.pointerId, x: event.clientX };
            gl.domElement.setPointerCapture(event.pointerId);
          }
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      handledTouch = true;
      button.userData.pressed = true;
      button.userData.pointer = event.pointerId;
      current.current.runtime?.resumeAudio();
      if (button.userData.joystick && current.current.active && current.current.playing) {
        if (stick.current) return;
        const center = button.getWorldPosition(new Vector3()).project(camera);
        const bounds = gl.domElement.getBoundingClientRect();
        stick.current = {
          id: event.pointerId,
          x: bounds.left + ((center.x + 1) * bounds.width) / 2,
          y: bounds.top + ((1 - center.y) * bounds.height) / 2,
          forward: 0,
          right: 0,
        };
        pointerMove(event);
        gl.domElement.setPointerCapture(event.pointerId);
      } else if (button.userData.hold && current.current.active && current.current.playing) {
        touches.current.set(event.pointerId, button.userData.hold);
        current.current.runtime?.pulse(button.userData.hold);
        if (button.userData.hold === KEY.fire && !look.current)
          look.current = { id: event.pointerId, x: event.clientX };
        gl.domElement.setPointerCapture(event.pointerId);
      } else if (button.userData.action && button.userData.action !== 'soundOn')
        current.current.action(button.userData.action);
    };
    const pointerMove = (event: PointerEvent) => {
      if (stick.current?.id === event.pointerId) {
        const x = (event.clientX - stick.current.x) / 40;
        const y = (stick.current.y - event.clientY) / 40;
        const length = Math.max(1, Math.hypot(x, y));
        stick.current.forward = y / length;
        stick.current.right = x / length;
        const button = buttons.current.find((item) => item.userData.joystick);
        if (button) {
          button.userData.stickX = x / length;
          button.userData.stickY = y / length;
        }
      } else if (look.current?.id === event.pointerId) {
        const bounds = gl.domElement.getBoundingClientRect();
        mouseDelta.current +=
          ((event.clientX - look.current.x) * 4096) / Math.min(bounds.width, bounds.height);
        look.current.x = event.clientX;
      } else if (
        event.pointerType !== 'touch' ||
        !current.current.active ||
        !current.current.playing ||
        gl.xr.isPresenting ||
        !isGameSurface(event.target)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const touchMove = (event: TouchEvent) => {
      if (
        !current.current.active ||
        !current.current.playing ||
        gl.xr.isPresenting ||
        !isGameSurface(event.target)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const pointerUp = (event: PointerEvent) => {
      touches.current.delete(event.pointerId);
      if (stick.current?.id === event.pointerId) stick.current = null;
      if (look.current?.id === event.pointerId) look.current = null;
      for (const button of buttons.current)
        if (button.userData.pointer === event.pointerId) {
          if (event.type === 'pointerup' && button.userData.action === 'soundOn')
            current.current.action('soundOn');
          Object.assign(button.userData, {
            pressed: false,
            pointer: undefined,
            stickX: 0,
            stickY: 0,
          });
        }
    };
    const click = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !handledTouch || !isGameSurface(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handledTouch = false;
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        !current.current.active ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        event.target !== keyboardTarget.current &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target instanceof HTMLElement && event.target.isContentEditable))
      )
        return;
      const enter = event.code === 'Enter' || event.code === 'NumpadEnter';
      if (enter) {
        if (
          event.target !== keyboardTarget.current &&
          event.target !== document.body &&
          event.target !== document.documentElement &&
          !isGameSurface(event.target)
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.code === 'Escape' || enter) {
        if (!event.repeat)
          current.current.action(enter && !current.current.playing ? 'resume' : 'menu');
        return;
      }
      if (!current.current.playing) return;
      if (event.code === 'Space' || event.code === 'KeyE') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      const code = keyboardKeys[event.code];
      if (code) {
        event.preventDefault();
        keyboard.current.add(event.code);
        if (code === KEY.use && !event.repeat) current.current.runtime?.pulse(code);
      }
      if (event.code === 'KeyM' || event.code === 'Tab') {
        event.preventDefault();
        if (!event.repeat) current.current.action('map');
      }
      if (event.code === 'KeyR' && !event.repeat) current.current.action('weapon');
    };
    const keyUp = (event: KeyboardEvent) => {
      keyboard.current.delete(event.code);
    };
    const blur = () => {
      clear();
      if (current.current.active) current.current.action('menu');
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const context = (event: MouseEvent) => {
      if (current.current.active) event.preventDefault();
    };
    window.addEventListener('mousedown', mouseDown, true);
    window.addEventListener('mouseup', mouseUp, true);
    window.addEventListener('mousemove', mouseMove, { capture: true, passive: false });
    window.addEventListener('pointerdown', pointerDown, { capture: true, passive: false });
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
    window.addEventListener('pointercancel', pointerUp, true);
    window.addEventListener('click', click, true);
    window.addEventListener('lostpointercapture', pointerUp, true);
    window.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', blur);
    window.addEventListener('contextmenu', context);
    document.addEventListener('visibilitychange', visibility);
    gl.xr.addEventListener('sessionstart', clear);
    gl.xr.addEventListener('sessionend', clear);
    return () => {
      clear();
      window.removeEventListener('mousedown', mouseDown, true);
      window.removeEventListener('mouseup', mouseUp, true);
      window.removeEventListener('mousemove', mouseMove, true);
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('pointermove', pointerMove, true);
      window.removeEventListener('pointercancel', pointerUp, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('lostpointercapture', pointerUp, true);
      window.removeEventListener('touchmove', touchMove, true);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('contextmenu', context);
      document.removeEventListener('visibilitychange', visibility);
      gl.xr.removeEventListener('sessionstart', clear);
      gl.xr.removeEventListener('sessionend', clear);
    };
  }, [gl, camera]);
  useEffect(() => {
    if (!active || !playing || !desktopPointer || inVR) return;
    const input = document.createElement('input');
    input.readOnly = true;
    input.inputMode = 'none';
    input.tabIndex = -1;
    input.setAttribute('aria-label', 'DOOM キーボード操作');
    Object.assign(input.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      left: '0',
      top: '0',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(input);
    keyboardTarget.current = input;
    input.focus({ preventScroll: true });
    const blur = () => {
      keyboard.current.clear();
      current.current.runtime?.release();
      current.current.action('menu');
    };
    input.addEventListener('blur', blur);
    return () => {
      input.removeEventListener('blur', blur);
      keyboardTarget.current = null;
      input.remove();
    };
  }, [active, playing, desktopPointer, inVR]);
  useEffect(() => {
    if (!active) return;
    const previous = gl.domElement.style.touchAction;
    gl.domElement.style.touchAction = 'none';
    return () => {
      gl.domElement.style.touchAction = previous;
    };
  }, [active, gl]);
  useEffect(() => {
    if (!active || desktopPointer || inVR) return;
    const panel = document.querySelector<HTMLElement>('[data-ui="virtual-joystick"]');
    if (!panel) return;
    const previous = panel.style.display;
    panel.style.display = 'none';
    return () => {
      panel.style.display = previous;
    };
  }, [active, desktopPointer, inVR]);
  useEffect(() => {
    held.current.clear();
    keyboard.current.clear();
    mouseDelta.current = 0;
    touches.current.clear();
    stick.current = null;
    look.current = null;
    runtime?.release();
    for (const button of buttons.current)
      Object.assign(button.userData, { pressed: false, pointer: undefined, stickX: 0, stickY: 0 });
  }, [active, playing, runtime, size.width, size.height]);
  useFrame(() => {
    if (!active || !playing || !runtime) return;
    if (!gl.xr.isPresenting && getViewpoint() === 'third-person') {
      runtime.release();
      action('menu');
      return;
    }
    const keys = new Set([
      ...held.current,
      ...Array.from(keyboard.current, (code) => keyboardKeys[code]),
      ...touches.current.values(),
    ]);
    const session = gl.xr.getSession();
    if (session?.visibilityState === 'visible-blurred' || session?.visibilityState === 'hidden') {
      runtime.release();
      action('menu');
      return;
    }
    const desktop = desktopPointer && !session;
    let forward = session
      ? 0
      : (stick.current?.forward ??
        (desktop
          ? Number(keys.has(KEY.forward)) - Number(keys.has(KEY.back))
          : axes.current.forward));
    let turn = session
      ? 0
      : desktop
        ? Number(keys.has(KEY.right)) - Number(keys.has(KEY.left))
        : axes.current.right;
    let side =
      stick.current?.right ?? Number(keys.has(KEY.strafeRight)) - Number(keys.has(KEY.strafeLeft));
    const pixels = Math.trunc(mouseDelta.current);
    mouseDelta.current -= pixels;
    if (!session && pixels) runtime.turn(pixels);
    let weapon = false;
    let menu = false;
    if (session) {
      const frame = gl.xr.getFrame();
      const referenceSpace = gl.xr.getReferenceSpace();
      for (const source of session.inputSources) {
        const pad = source.gamepad;
        if (!pad || pad.mapping !== 'xr-standard' || !frame || !referenceSpace) continue;
        const pose = frame.getPose(source.targetRaySpace, referenceSpace);
        if (!pose) continue;
        rotation.current.fromArray(pose.transform.matrix);
        if (camera.parent) rotation.current.premultiply(camera.parent.matrixWorld);
        ray.current.ray.origin.setFromMatrixPosition(rotation.current);
        ray.current.ray.direction.set(0, 0, -1).transformDirection(rotation.current);
        const overUI = ray.current.intersectObjects(buttons.current, false).length > 0;
        if (source.handedness === 'left') {
          forward = -(pad.axes[3] ?? 0);
          side = pad.axes[2] ?? 0;
          if (!overUI && pad.buttons[0]?.pressed) keys.add(KEY.use);
          menu ||= Boolean(pad.buttons[5]?.pressed);
        } else if (source.handedness === 'right') {
          turn = pad.axes[2] ?? 0;
          if (!overUI && pad.buttons[0]?.pressed) keys.add(KEY.fire);
          weapon ||= Math.abs(pad.axes[3] ?? 0) > 0.65;
          menu ||= Boolean(pad.buttons[5]?.pressed);
        }
      }
    }
    if (weapon && !previousWeapon.current) action('weapon');
    if (menu && !previousMenu.current) action('menu');
    previousWeapon.current = weapon;
    previousMenu.current = menu;
    runtime.key(KEY.forward, forward > 0.2);
    runtime.key(KEY.back, forward < -0.2);
    runtime.key(KEY.left, turn < -0.2);
    runtime.key(KEY.right, turn > 0.2);
    runtime.key(KEY.strafeLeft, side < -0.2 || keys.has(KEY.strafeLeft));
    runtime.key(KEY.strafeRight, side > 0.2 || keys.has(KEY.strafeRight));
    runtime.key(KEY.speed, desktop && keys.has(KEY.speed));
    runtime.key(KEY.fire, keys.has(KEY.fire));
    runtime.key(KEY.use, keys.has(KEY.use));
  });
}
