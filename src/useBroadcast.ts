// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useState } from 'react';
import VDONinjaSDK from './generated/vdo.js';
export type Session = {
  id: string;
  owner: string;
  name: string;
} | null;
export function useBroadcast(userId: string, session: Session, outgoing: MediaStream | null) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState('接続中…');
  const hosting = session?.owner === userId;
  useEffect(() => {
    setRemoteStream(null);
    if (!session) {
      setStatus('ゲームは待機中です');
      return;
    }
    if (hosting && !outgoing) {
      setStatus('ゲーム起動待ち');
      return;
    }
    let disposed = false;
    const streamId = `doom_${session.id.replace(/-/g, '')}`;
    const received = new MediaStream();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const reconnect = () => {
      if (disposed) return;
      setStatus('再接続中…');
      reconnectTimer ??= setTimeout(() => setRetry((value) => value + 1), 10000);
    };
    const sdk = new VDONinjaSDK({
      host: 'wss://wss.vdo.ninja',
      salt: 'vdo.ninja',
      password: session.id,
      turnServers: null,
      forceTURN: false,
      autoRelay: true,
      allowresources: false,
      allowchunked: false,
    });
    setStatus('接続中…');
    sdk.on('track', ({ detail: { track } }) => {
      if (disposed || hosting) return;
      for (const previous of received.getTracks()) {
        if (previous.kind === track.kind) received.removeTrack(previous);
      }
      received.addTrack(track);
      setRemoteStream(new MediaStream(received.getTracks()));
    });
    sdk.on('peerConnected', () => {
      if (disposed) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      if (hosting) {
        const canvas = (outgoing?.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)
          ?.canvas;
        if (canvas) canvas.getContext('2d')?.drawImage(canvas, 0, 0);
      } else setStatus('観戦中');
    });
    sdk.on('peerDisconnected', () => {
      if (disposed) return;
      if (!hosting) {
        setRemoteStream(null);
        setStatus('再接続中…');
      }
    });
    sdk.on('reconnecting', () => {
      if (!disposed) setStatus('再接続中…');
    });
    sdk.on('relayEscalated', () => {
      if (!disposed && !hosting) setStatus('中継で再接続中…');
    });
    sdk.on('connectionRecovered', () => {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      if (!disposed && !hosting) setStatus('観戦中');
    });
    sdk.on('error', reconnect);
    void (async () => {
      await sdk.connect();
      if (disposed) return;
      await sdk.joinRoom({ room: streamId });
      if (disposed) return;
      if (hosting && outgoing) {
        await sdk.publish(outgoing, { streamID: streamId });
        if (!disposed) setStatus('配信中');
      } else {
        await sdk.view(streamId, {
          audio: true,
          video: true,
          downloads: false,
          allowresources: false,
        });
      }
    })().catch((error) => {
      if (!disposed) {
        console.warn('DOOM VDO.Ninja:', error);
        reconnect();
      }
    });
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      void sdk.disconnect().catch((error) => console.warn('DOOM VDO.Ninja teardown:', error));
    };
  }, [session?.id, hosting, outgoing, retry]);
  return { remoteStream, status };
}
