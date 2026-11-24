import { AnnotationStroke } from '../components/PresentationAnnotationLayer';

export type SyncWindowRole = 'presenter' | 'audience';

export interface SyncPresentationState {
  slideIndex: number;
  blackout: boolean;
  annotationsBySlide?: Record<string, AnnotationStroke[]>;
}

export interface SyncLaserPayload {
  active: boolean;
  x: number;
  y: number;
  color: string;
  slideId: string;
}

export type SyncMessagePayload =
  | { type: 'hello'; role: SyncWindowRole }
  | { type: 'goodbye'; role: SyncWindowRole }
  | { type: 'presentation-ended'; role: SyncWindowRole }
  | { type: 'ping'; role: SyncWindowRole }
  | { type: 'pong'; role: SyncWindowRole }
  | { type: 'state'; state: SyncPresentationState; requestAck?: boolean }
  | { type: 'laser'; laser: SyncLaserPayload };

interface SyncEnvelope {
  channel: string;
  senderId: string;
  seq: number;
  ts: number;
  payload: SyncMessagePayload;
}

export interface PresentationSyncOptions {
  syncId: string;
  role: SyncWindowRole;
  onMessage: (payload: SyncMessagePayload, senderId: string) => void;
  onPeersChange?: (audienceCount: number, presenterCount: number) => void;
}

export interface PresentationSyncBridge {
  readonly senderId: string;
  send: (payload: SyncMessagePayload, options?: { skipStorageFallback?: boolean }) => void;
  close: (options?: { endPresentation?: boolean }) => void;
}

export function buildAudienceWindowUrl(
  deckId: string,
  syncId: string,
  slideIndex: number
): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'audience');
    url.searchParams.set('deckId', deckId);
    url.searchParams.set('sync', syncId);
    url.searchParams.set('slide', String(slideIndex + 1));
    url.hash = '';
    return url.toString();
  } catch {
    const params = new URLSearchParams({
      view: 'audience',
      deckId,
      sync: syncId,
      slide: String(slideIndex + 1),
    });
    return `?${params.toString()}`;
  }
}

export function parseAudienceUrlParams(): {
  isAudienceView: boolean;
  deckId: string | null;
  syncId: string | null;
  slideIndex: number;
} {
  try {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const deckId = params.get('deckId');
    const syncId = params.get('sync');
    const slideParam = Number(params.get('slide') || '1');
    return {
      isAudienceView: view === 'audience',
      deckId: deckId || null,
      syncId: syncId || null,
      slideIndex: Number.isFinite(slideParam) && slideParam >= 1 ? Math.floor(slideParam) - 1 : 0,
    };
  } catch {
    return { isAudienceView: false, deckId: null, syncId: null, slideIndex: 0 };
  }
}

export function createPresentationSyncBridge(
  options: PresentationSyncOptions
): PresentationSyncBridge {
  const { syncId, role, onMessage, onPeersChange } = options;
  const channelName = `slideino-sync:${syncId}`;
  const storageKey = `slideino_sync_pkt:${syncId}`;
  const senderId = `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  let seq = 0;
  let closed = false;
  let lastStorageLaserTs = 0;
  const seenSeqBySender = new Map<string, number>();
  const peers = new Map<string, { role: SyncWindowRole; lastSeen: number }>();

  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(channelName);
    } catch {
      bc = null;
    }
  }

  const emitPeerCounts = () => {
    if (!onPeersChange) return;
    const now = Date.now();
    for (const [id, info] of peers.entries()) {
      if (now - info.lastSeen > 5500) {
        peers.delete(id);
      }
    }
    let audienceCount = 0;
    let presenterCount = 0;
    for (const info of peers.values()) {
      if (info.role === 'audience') audienceCount++;
      else presenterCount++;
    }
    onPeersChange(audienceCount, presenterCount);
  };

  const send = (
    payload: SyncMessagePayload,
    sendOpts?: { skipStorageFallback?: boolean }
  ) => {
    if (closed) return;
    seq += 1;
    const envelope: SyncEnvelope = {
      channel: channelName,
      senderId,
      seq,
      ts: Date.now(),
      payload,
    };

    if (bc) {
      try {
        bc.postMessage(envelope);
      } catch {
        // Ignore channel post errors
      }
    }

    // Write localStorage fallback for environments where BroadcastChannel doesn't cross contexts
    if (!sendOpts?.skipStorageFallback) {
      const now = Date.now();
      if (payload.type === 'laser') {
        if (bc) return; // Keep high-frequency laser off localStorage when BroadcastChannel works
        if (payload.laser.active && now - lastStorageLaserTs < 45) return;
        lastStorageLaserTs = now;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      } catch {
        // Ignore quota / privacy mode storage errors
      }
    }
  };

  const handleIncoming = (raw: unknown) => {
    if (closed || !raw || typeof raw !== 'object') return;
    const env = raw as SyncEnvelope;
    if (env.channel !== channelName || env.senderId === senderId || !env.payload) return;

    const prevSeq = seenSeqBySender.get(env.senderId) ?? 0;
    if (env.seq <= prevSeq) return;
    seenSeqBySender.set(env.senderId, env.seq);

    const p = env.payload;
    if (p.type === 'hello') {
      peers.set(env.senderId, { role: p.role, lastSeen: Date.now() });
      emitPeerCounts();
      send({ type: 'pong', role });
    } else if (p.type === 'ping') {
      peers.set(env.senderId, { role: p.role, lastSeen: Date.now() });
      emitPeerCounts();
      send({ type: 'pong', role });
    } else if (p.type === 'pong') {
      peers.set(env.senderId, { role: p.role, lastSeen: Date.now() });
      emitPeerCounts();
    } else if (p.type === 'goodbye' || p.type === 'presentation-ended') {
      peers.delete(env.senderId);
      emitPeerCounts();
    } else {
      const existing = peers.get(env.senderId);
      if (existing) {
        existing.lastSeen = Date.now();
      }
    }

    onMessage(p, env.senderId);
  };

  if (bc) {
    bc.onmessage = (event: MessageEvent) => {
      handleIncoming(event.data);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      handleIncoming(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed packets
    }
  };
  window.addEventListener('storage', onStorage);

  const onVisibilityChange = () => {
    if (closed || document.visibilityState !== 'visible') return;
    send({ type: 'ping', role }, { skipStorageFallback: Boolean(bc) });
    emitPeerCounts();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  let heartbeatId: number | null = null;

  const close = (closeOpts?: { endPresentation?: boolean }) => {
    if (closed) return;
    if (closeOpts?.endPresentation && role === 'presenter') {
      send({ type: 'presentation-ended', role });
    }
    send({ type: 'goodbye', role });
    // Immediately purge transient storage relay key so no stale sync state lingers after close
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
    closed = true;
    if (heartbeatId !== null) {
      window.clearInterval(heartbeatId);
      heartbeatId = null;
    }
    peers.clear();
    seenSeqBySender.clear();
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onPageHide);
    if (bc) {
      try {
        bc.onmessage = null;
        bc.close();
      } catch {
        // Ignore close error
      }
      bc = null;
    }
  };

  const onPageHide = () => {
    close({ endPresentation: role === 'presenter' });
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onPageHide);

  // Announce presence and run fast lightweight heartbeat to accurately detect closed tabs
  send({ type: 'hello', role });
  heartbeatId = window.setInterval(() => {
    send({ type: 'ping', role }, { skipStorageFallback: Boolean(bc) });
    emitPeerCounts();
  }, 2000);

  return {
    senderId,
    send,
    close,
  };
}
