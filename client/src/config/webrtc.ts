export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}

export interface WebRTCConfig {
  iceServers: IceServerConfig[];
}

function parseIceServers(): IceServerConfig[] {
  const iceServers: IceServerConfig[] = [];

  // STUN servers (comma-separated)
  const stunUrls = import.meta.env.VITE_STUN_URLS;
  if (stunUrls) {
    for (const url of stunUrls.split(',').map((s) => s.trim()).filter(Boolean)) {
      iceServers.push({ urls: url });
    }
  } else {
    // Default Google STUN servers
    iceServers.push(
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    );
  }

  // TURN servers (comma-separated, format: url|username|password)
  const turnUrls = import.meta.env.VITE_TURN_URLS;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD;

  if (turnUrls && turnUsername && turnPassword) {
    for (const url of turnUrls.split(',').map((s) => s.trim()).filter(Boolean)) {
      iceServers.push({
        urls: url,
        username: turnUsername,
        credential: turnPassword,
        credentialType: 'password',
      });
    }
  }

  return iceServers;
}

export const webRTCConfig: WebRTCConfig = {
  iceServers: parseIceServers(),
};

export function getIceServers(): RTCConfiguration {
  return { iceServers: webRTCConfig.iceServers };
}