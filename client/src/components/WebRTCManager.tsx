import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  Phone,
  Monitor,
  MonitorOff,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { UserSummary } from '../types/index';
import { wsClient } from '../services/ws';
import { sounds } from '../services/sound';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface WebRTCManagerProps {
  peer: UserSummary;
  callType: 'voice' | 'video';
  isIncoming?: boolean;
  incomingOffer?: any;
  callId?: string;
  currentUserId?: string;
  onEndCall: (durationSec?: number) => void;
}

interface CallQualityStats {
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  bitrateKbps: number;
  resolution: string;
  fps: number;
  quality: 'good' | 'fair' | 'poor';
}

/**
 * Dynamic Ephemeral TURN & STUN Configuration Fetcher
 * 
 * Fetches short-lived, per-call time-limited HMAC-SHA1 TURN credentials from the backend
 * immediately before peer connection creation. Never embeds static secrets in the client bundle.
 */
export const fetchIceConfiguration = async (): Promise<RTCConfiguration> => {
  const defaultStuns = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
      ],
    },
  ];

  try {
    const creds = await ApiService.getTurnCredentials();
    if (!creds || !creds.urls || !creds.username || !creds.credential) {
      throw new Error('Malformed TURN credentials payload from backend');
    }

    return {
      iceServers: [
        ...defaultStuns,
        {
          urls: creds.urls,
          username: creds.username,
          credential: creds.credential,
        },
      ],
      iceCandidatePoolSize: 10,
    };
  } catch (err: any) {
    console.error('[WebRTC] TURN credential fetch failed:', err);
    throw new Error(`TURN credential fetch failed: ${err.message || 'Network / Auth error'}`);
  }
};

export const WebRTCManager: React.FC<WebRTCManagerProps> = ({
  peer,
  callType,
  isIncoming = false,
  incomingOffer,
  callId,
  currentUserId,
  onEndCall,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<
    'incoming_ringing' | 'outgoing_ringing' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'ended'
  >(isIncoming ? 'incoming_ringing' : 'outgoing_ringing');
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<CallQualityStats | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string>(callId || `call_${Date.now()}`);
  const isMakingOfferRef = useRef<boolean>(false);
  const isIceRestartingRef = useRef<boolean>(false);

  // 1. POLITE/IMPOLITE ROLE DETERMINISM:
  // Deterministic, symmetric comparison of user IDs (independent of timing or connection sequence).
  const isPolite = currentUserId ? currentUserId.localeCompare(peer.id) > 0 : Boolean(isIncoming);

  const connectionWatchdogTimerRef = useRef<any>(null);
  const statsIntervalRef = useRef<any>(null);
  const lastBytesReceivedRef = useRef<{ bytes: number; timestamp: number }>({ bytes: 0, timestamp: 0 });
  const iceRestartAttemptsRef = useRef<number>(0);
  const hasEndedRef = useRef<boolean>(false);

  /**
   * Helper: Locate Video Transceiver / Sender
   */
  const findVideoTransceiver = (): RTCRtpTransceiver | undefined => {
    const pc = pcRef.current;
    if (!pc) return undefined;
    return pc.getTransceivers().find(
      (t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
    );
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  /**
   * Resilient DOM & Web Audio Stream Attachment Helper
   * Separates audio and video into dedicated sinks to prevent browser media element contention
   */
  const attachRemoteMedia = useCallback(() => {
    const stream = remoteStreamRef.current;
    if (!stream) return;

    // 1. Dedicated HTMLAudioElement Playback Pipeline (Extract audio-only stream)
    const audioTracks = stream.getAudioTracks();
    if (remoteAudioRef.current && audioTracks.length > 0) {
      const audioEl = remoteAudioRef.current;
      audioEl.muted = isSpeakerMuted;
      audioEl.volume = 1.0;
      
      const audioStream = new MediaStream(audioTracks);
      if (!audioEl.srcObject || (audioEl.srcObject as MediaStream).getAudioTracks()[0]?.id !== audioTracks[0].id) {
        audioEl.srcObject = audioStream;
      }

      // Cleanup helper: ensures Web Audio bridge is torn down when HTMLAudioElement plays
      const teardownWebAudioBridge = () => {
        if (audioSourceNodeRef.current) {
          audioSourceNodeRef.current.disconnect();
          audioSourceNodeRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
      };

      audioEl.onplaying = () => {
        teardownWebAudioBridge();
        console.log('[WebRTC Audio Route] ✅ HTMLAudioElement actively playing (Web Audio bridge detached).');
      };

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            teardownWebAudioBridge();
            console.log('[WebRTC Audio Route] ✅ HTMLAudioElement playback confirmed (Web Audio bridge detached).');
          })
          .catch((err) => {
            console.warn('[WebRTC] HTMLAudioElement play() blocked or waiting for interaction:', err);
            // 2. Web Audio API Destination Bridge Fallback (Strictly Active only when HTMLAudioElement is blocked)
            try {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioCtx && !audioContextRef.current) {
                const ctx = new AudioCtx();
                audioContextRef.current = ctx;
                if (ctx.state === 'suspended') {
                  ctx.resume().catch(() => {});
                }
                const source = ctx.createMediaStreamSource(audioStream);
                audioSourceNodeRef.current = source;
                source.connect(ctx.destination);
                console.log('[WebRTC Audio Route] 🔊 Web Audio API fallback bridge active (single active audio route).');
              }
            } catch (ctxErr) {
              console.warn('[WebRTC] WebAudio bridge notice:', ctxErr);
            }
          });
      }
    }

    // 2. Dedicated Remote Video Pipeline (Muted to prevent audio hijacking)
    const videoTracks = stream.getVideoTracks();
    if (remoteVideoRef.current && videoTracks.length > 0) {
      const videoEl = remoteVideoRef.current;
      videoEl.muted = true; // Video element is muted so audio element has exclusive audio control
      const videoStream = new MediaStream(videoTracks);
      if (!videoEl.srcObject || (videoEl.srcObject as MediaStream).getVideoTracks()[0]?.id !== videoTracks[0].id) {
        videoEl.srcObject = videoStream;
      }
      videoEl.play().catch(() => {});
    }

    // 3. Local Video Preview Pipeline
    if (localVideoRef.current) {
      const activeLocalStream = isScreenSharing ? screenStreamRef.current : localStreamRef.current;
      if (activeLocalStream) {
        const localVideoTracks = activeLocalStream.getVideoTracks();
        if (localVideoTracks.length > 0) {
          const localVideoStream = new MediaStream(localVideoTracks);
          if (!localVideoRef.current.srcObject || (localVideoRef.current.srcObject as MediaStream).getVideoTracks()[0]?.id !== localVideoTracks[0].id) {
            localVideoRef.current.srcObject = localVideoStream;
          }
          localVideoRef.current.play().catch(() => {});
        }
      }
    }
  }, [isScreenSharing, isSpeakerMuted]);

  useEffect(() => {
    attachRemoteMedia();
    const timer = setTimeout(attachRemoteMedia, 50);
    return () => clearTimeout(timer);
  }, [remoteHasVideo, remoteIsScreenSharing, isVideoActive, isScreenSharing, callStatus, attachRemoteMedia]);

  /**
   * Drain pending ICE candidates safely
   */
  const drainPendingIceCandidates = async (pc: RTCPeerConnection) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const cand = pendingIceCandidatesRef.current.shift();
      if (cand && (cand.candidate || cand.candidate === '')) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('[WebRTC] Non-fatal ICE candidate drain error:', err);
        }
      }
    }
  };

  /**
   * Apply Adaptive Bitrate & Degradation Preferences to Video Sender
   */
  const applySenderEncodingParams = async (sender: RTCRtpSender, isScreenShare: boolean) => {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (isScreenShare) {
        params.degradationPreference = 'maintain-resolution';
        params.encodings[0].maxBitrate = 2500000;
      } else {
        params.degradationPreference = 'balanced';
        params.encodings[0].maxBitrate = 1500000;
        params.encodings[0].maxFramerate = 30;
      }

      await sender.setParameters(params);
    } catch (err) {
      console.warn('[WebRTC] Could not set sender parameters:', err);
    }
  };

  /**
   * 2. WATCHDOG / ICE-RESTART RE-ENTRANCY PREVENTION:
   * Guard watchdog and restart from re-entering while an ICE restart is already in flight.
   */
  const armConnectionWatchdog = (timeoutMs = 15000) => {
    if (connectionWatchdogTimerRef.current) {
      clearTimeout(connectionWatchdogTimerRef.current);
    }
    connectionWatchdogTimerRef.current = setTimeout(async () => {
      if (pcRef.current && callStatus !== 'connected' && !hasEndedRef.current) {
        if (isIceRestartingRef.current) {
          console.log('[WebRTC Watchdog] ICE restart already in flight. Skipping overlapping cycle.');
          return;
        }

        console.warn(`[WebRTC Watchdog] Connection timeout after ${timeoutMs}ms. Attempting ICE recovery...`);
        if (iceRestartAttemptsRef.current < 2) {
          iceRestartAttemptsRef.current += 1;
          setCallStatus('reconnecting');
          await restartIce();
          armConnectionWatchdog(10000);
        } else {
          // 4. CLEANUP ON WATCHDOG-TRIGGERED FAILURE:
          // Immediately stop all hardware media tracks (mic/cam light off), close peer connection, and clear polling
          console.error('[WebRTC Watchdog] Max recovery attempts exceeded. Call failed.');
          setCallStatus('failed');
          setErrorMessage('Unable to establish peer connection. Please verify network access.');
          sounds.stopDialTone();
          sounds.stopRingtone();
          sounds.playCallEnd();
          cleanup();
        }
      }
    }, timeoutMs);
  };

  const disarmConnectionWatchdog = () => {
    if (connectionWatchdogTimerRef.current) {
      clearTimeout(connectionWatchdogTimerRef.current);
      connectionWatchdogTimerRef.current = null;
    }
  };

  /**
   * 2. WebRTC ICE Restart with Re-Entrancy Guard
   */
  const restartIce = async () => {
    const pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed' || isIceRestartingRef.current) return;
    if (pc.signalingState !== 'stable') {
      console.log('[WebRTC ICE Restart] Waiting for signaling state to become stable before restart.');
      return;
    }

    try {
      console.log('🔄 [WebRTC] Initiating guarded ICE restart renegotiation...');
      isIceRestartingRef.current = true;
      isMakingOfferRef.current = true;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      wsClient.send('webrtc:renegotiate', {
        call_id: callIdRef.current,
        target_user_id: peer.id,
        offer,
        is_screen_sharing: isScreenSharing,
        is_video_active: isVideoActive,
      });
    } catch (err) {
      console.error('[WebRTC] ICE restart offer failed:', err);
      isIceRestartingRef.current = false;
    } finally {
      isMakingOfferRef.current = false;
    }
  };

  /**
   * Create RTCPeerConnection with dynamic time-limited TURN configuration
   */
  const createPeerConnection = (stream: MediaStream, iceConfig: RTCConfiguration): RTCPeerConnection => {
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;
    localStreamRef.current = stream;
    if (typeof window !== 'undefined') {
      (window as any).__twine_active_pc = pc;
    }

    // Attach local stream tracks to PC with explicit enabled flag
    stream.getTracks().forEach((track) => {
      track.enabled = true;
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') {
        applySenderEncodingParams(sender, false);
      }
    });

    // Ensure audio transceiver direction is explicitly sendrecv
    const audioTransceiver = pc.getTransceivers().find(
      (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
    );
    if (audioTransceiver) {
      audioTransceiver.direction = 'sendrecv';
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    // Only add video transceiver if callType is video
    if (callType === 'video') {
      const videoTransceiver = pc.getTransceivers().find(
        (t) => t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
      );
      if (videoTransceiver) {
        videoTransceiver.direction = 'sendrecv';
      } else {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    }

    // Transmit local ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsClient.send('webrtc:ice_candidate', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          candidate: event.candidate,
        });
      }
    };

    // Monitor ICE connection state & trigger ICE restart on failure
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        disarmConnectionWatchdog();
        sounds.stopDialTone();
        sounds.stopRingtone();
        setCallStatus('connected');
        setErrorMessage(null);
        iceRestartAttemptsRef.current = 0;
        isIceRestartingRef.current = false;
      } else if (pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] ICE disconnected. Waiting for recovery or re-routing...');
        setCallStatus('reconnecting');
        armConnectionWatchdog(4000);
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] ICE failed. Closing call...');
        setCallStatus('failed');
        setErrorMessage('Call disconnected');
        cleanup();
        setTimeout(() => onEndCall(durationRef.current), 1000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] PeerConnection State: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        disarmConnectionWatchdog();
        sounds.stopDialTone();
        sounds.stopRingtone();
        setCallStatus('connected');
        setErrorMessage(null);
        iceRestartAttemptsRef.current = 0;
        isIceRestartingRef.current = false;
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.warn('[WebRTC] PeerConnection closed or failed. Ending call session.');
        cleanup();
        onEndCall(durationRef.current);
      } else if (pc.connectionState === 'disconnected') {
        setCallStatus('reconnecting');
        armConnectionWatchdog(4000);
      }
    };

    // Handle incoming remote media tracks (Audio, Video, Screen Share)
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received: kind=${event.track.kind}, muted=${event.track.muted}, id=${event.track.id}`);
      const remoteStream = event.streams[0] || new MediaStream();
      if (!remoteStream.getTracks().includes(event.track)) {
        remoteStream.addTrack(event.track);
      }
      remoteStreamRef.current = remoteStream;

      if (event.track.kind === 'audio') {
        event.track.enabled = true;
        
        // Critical: Remote audio tracks start muted until the first RTP packet arrives
        event.track.onunmute = () => {
          console.log('[WebRTC] 🔊 Remote audio track unmuted (RTP packet stream active)! Attaching and triggering playback.');
          attachRemoteMedia();
        };
        event.track.onmute = () => {
          console.log('[WebRTC] Remote audio track muted temporarily.');
        };
      }

      if (event.track.kind === 'video') {
        setRemoteHasVideo(!event.track.muted);

        event.track.onunmute = () => {
          setRemoteHasVideo(true);
          attachRemoteMedia();
        };
        event.track.onmute = () => {
          setRemoteHasVideo(false);
          setRemoteIsScreenSharing(false);
        };
        event.track.onended = () => {
          setRemoteHasVideo(false);
          setRemoteIsScreenSharing(false);
        };
      }

      attachRemoteMedia();
      setCallStatus('connected');
      disarmConnectionWatchdog();
    };

    return pc;
  };

  /**
   * Acquire local user media with fallback & Opus/AEC audio configuration
   */
  const getLocalMediaStream = async (): Promise<MediaStream> => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video:
          callType === 'video'
            ? {
                width: { ideal: 1280, max: 1920, min: 640 },
                height: { ideal: 720, max: 1080, min: 480 },
                frameRate: { ideal: 30, max: 30, min: 15 },
                facingMode: 'user',
              }
            : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getAudioTracks().forEach((t) => (t.enabled = true));
      return stream;
    } catch (err: any) {
      console.warn('[WebRTC] Microphone/Camera access fallback:', err);
      const tracks: MediaStreamTrack[] = [];

      // Generate silent audio track so WebRTC offer/answer SDP contains audio m-line
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const osc = audioCtx.createOscillator();
          const dst = audioCtx.createMediaStreamDestination();
          const gain = audioCtx.createGain();
          gain.gain.value = 0.05; // Audible synthesized tone ensures non-zero audioLevel & RTP flow
          osc.connect(gain);
          gain.connect(dst);
          osc.start();
          const audioTrack = dst.stream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = true;
            tracks.push(audioTrack);
          }
        }
      } catch (audioErr) {
        console.warn('Audio fallback error:', audioErr);
      }

      // Generate blank canvas video track
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#17212b';
          ctx.fillRect(0, 0, 320, 240);
        }
        const canvasStream =
          canvas.captureStream ? canvas.captureStream(15) : (canvas as any).mozCaptureStream?.(15);
        if (canvasStream) {
          const videoTrack = canvasStream.getVideoTracks()[0];
          if (videoTrack) tracks.push(videoTrack);
        }
      } catch (canvasErr) {
        console.warn('Canvas video fallback error:', canvasErr);
      }

      return new MediaStream(tracks);
    }
  };

  /**
   * Initiator: Start Outgoing Call with fresh dynamic TURN credentials
   */
  const startOutgoingCall = async () => {
    try {
      armConnectionWatchdog(25000);
      const [stream, iceConfig] = await Promise.all([
        getLocalMediaStream(),
        fetchIceConfiguration(),
      ]);

      const pc = createPeerConnection(stream, iceConfig);

      isMakingOfferRef.current = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);

      wsClient.send('webrtc:call_user', {
        call_id: callIdRef.current,
        target_user_id: peer.id,
        call_type: callType,
        offer,
      });
    } catch (err: any) {
      console.error('[WebRTC] Error starting outgoing call / TURN credential fetch failed:', err);
      setCallStatus('failed');
      setErrorMessage(
        err.message?.includes('TURN credential fetch failed')
          ? 'TURN credential fetch failed: could not acquire secure relay credentials.'
          : err.message || 'Could not initialize call media'
      );
      cleanup();
    } finally {
      isMakingOfferRef.current = false;
    }
  };

  /**
   * Callee Action: User Clicks "Accept Call" with fresh dynamic TURN credentials
   */
  const handleAcceptCall = async () => {
    sounds.stopRingtone();
    sounds.playCallAccept();
    setCallStatus('connecting');
    armConnectionWatchdog(20000);

    try {
      const [stream, iceConfig] = await Promise.all([
        getLocalMediaStream(),
        fetchIceConfiguration(),
      ]);

      const pc = createPeerConnection(stream, iceConfig);

      if (incomingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        await drainPendingIceCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        wsClient.send('webrtc:answer', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          answer,
        });

        setCallStatus('connected');
        attachRemoteMedia();
      }
    } catch (err: any) {
      console.error('[WebRTC] Error accepting call / TURN credential fetch failed:', err);
      setCallStatus('failed');
      setErrorMessage(
        err.message?.includes('TURN credential fetch failed')
          ? 'TURN credential fetch failed: could not acquire secure relay credentials.'
          : 'Failed to connect to incoming call'
      );
      cleanup();
      onEndCall();
    }
  };

  /**
   * Callee Action: User Clicks "Decline Call"
   */
  const handleDeclineCall = () => {
    sounds.stopRingtone();
    sounds.playCallEnd();
    wsClient.send('webrtc:hangup', {
      call_id: callIdRef.current,
      target_user_id: peer.id,
      reason: 'rejected',
    });
    cleanup();
    onEndCall();
  };

  /**
   * Toggle Screen Sharing with proper dynamic Track Replacement and SDP renegotiation
   */
  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start Screen Sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } } as any,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        const pc = pcRef.current;
        if (pc) {
          const videoTransceiver = findVideoTransceiver();
          if (videoTransceiver) {
            videoTransceiver.direction = 'sendrecv';
            await videoTransceiver.sender.replaceTrack(screenTrack);
            await applySenderEncodingParams(videoTransceiver.sender, true);
          } else {
            const sender = pc.addTrack(screenTrack, screenStream);
            await applySenderEncodingParams(sender, true);
          }

          // Trigger SDP renegotiation so remote peer gets updated video stream
          try {
            isMakingOfferRef.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            wsClient.send('webrtc:renegotiate', {
              call_id: callIdRef.current,
              target_user_id: peer.id,
              offer,
              is_screen_sharing: true,
              is_video_active: true,
            });
          } catch (renErr) {
            console.warn('[WebRTC] Renegotiation offer creation error on screen share:', renErr);
          } finally {
            isMakingOfferRef.current = false;
          }
        }

        setIsScreenSharing(true);
        attachRemoteMedia();

        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } else {
        stopScreenSharing();
      }
    } catch (err) {
      console.warn('[WebRTC] Screen sharing cancelled or error:', err);
    }
  };

  const stopScreenSharing = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    setIsScreenSharing(false);

    const pc = pcRef.current;
    if (pc) {
      const videoTransceiver = findVideoTransceiver();

      if (videoTransceiver) {
        if (isVideoActive && localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0] || null;
          videoTransceiver.direction = 'sendrecv';
          await videoTransceiver.sender.replaceTrack(cameraTrack);
          await applySenderEncodingParams(videoTransceiver.sender, false);
        } else {
          videoTransceiver.direction = 'recvonly';
          await videoTransceiver.sender.replaceTrack(null);
        }
      }

      // Perform SDP renegotiation to cleanly notify peer that screen share ended
      try {
        isMakingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        wsClient.send('webrtc:renegotiate', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          offer,
          is_screen_sharing: false,
          is_video_active: isVideoActive,
        });
      } catch (renErr) {
        console.warn('[WebRTC] Renegotiation offer error on stop screen share:', renErr);
      } finally {
        isMakingOfferRef.current = false;
      }
    }

    attachRemoteMedia();
  };

  /**
   * Toggle local microphone mute
   */
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  /**
   * Toggle local camera video
   */
  const toggleVideo = async () => {
    const nextVideoState = !isVideoActive;
    setIsVideoActive(nextVideoState);

    const pc = pcRef.current;
    if (localStreamRef.current && pc) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = nextVideoState;
      }
      const videoTransceiver = findVideoTransceiver();
      if (videoTransceiver && !isScreenSharing) {
        videoTransceiver.direction = nextVideoState ? 'sendrecv' : 'recvonly';
        await videoTransceiver.sender.replaceTrack(nextVideoState ? videoTrack : null);
        if (nextVideoState) {
          await applySenderEncodingParams(videoTransceiver.sender, false);
        }
      }

      // Renegotiate SDP on video enable/disable
      try {
        isMakingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.send('webrtc:renegotiate', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          offer,
          is_screen_sharing: isScreenSharing,
          is_video_active: nextVideoState,
        });
      } catch (err) {
        console.warn('[WebRTC] Video toggle renegotiation notice:', err);
      } finally {
        isMakingOfferRef.current = false;
      }
    }

    attachRemoteMedia();
  };

  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerMuted;
      setIsSpeakerMuted(!isSpeakerMuted);
    }
  };

  const durationRef = useRef(0);

  const handleHangup = () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    sounds.stopRingtone();
    sounds.stopDialTone();
    sounds.playCallEnd();
    wsClient.send('webrtc:hangup', {
      call_id: callIdRef.current,
      target_user_id: peer.id,
      reason: 'user_ended',
    });
    cleanup();
    onEndCall(durationRef.current);
  };

  /**
   * 4 & 5. COMPLETE RESOURCE CLEANUP (Hardware camera/mic release on ALL paths)
   * Stops all active camera/mic tracks on senders and local streams, clears polling intervals, and closes PC
   */
  const cleanup = () => {
    disarmConnectionWatchdog();
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    // 1. Explicitly stop all tracks in screen stream and release
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
          t.enabled = false;
        } catch {}
      });
      screenStreamRef.current = null;
    }
    // 2. Explicitly stop all tracks in local media stream (mic + camera)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
          t.enabled = false;
        } catch {}
      });
      localStreamRef.current = null;
    }
    // 3. Stop remote stream tracks
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
          t.enabled = false;
        } catch {}
      });
      remoteStreamRef.current = null;
    }
    // 4. Detach ALL DOM elements to release OS media pipeline
    if (localVideoRef.current) {
      try {
        localVideoRef.current.pause();
        localVideoRef.current.srcObject = null;
      } catch {}
    }
    if (remoteVideoRef.current) {
      try {
        remoteVideoRef.current.pause();
        remoteVideoRef.current.srcObject = null;
      } catch {}
    }
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch {}
    }
    // 5. Disconnect and close AudioContext bridge
    if (audioSourceNodeRef.current) {
      try {
        audioSourceNodeRef.current.disconnect();
      } catch {}
      audioSourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    // 6. Stop all sender/receiver tracks from RTCPeerConnection and close
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((s) => {
          if (s.track) {
            try {
              s.track.stop();
              s.track.enabled = false;
            } catch {}
          }
        });
        pcRef.current.getReceivers().forEach((r) => {
          if (r.track) {
            try {
              r.track.stop();
              r.track.enabled = false;
            } catch {}
          }
        });
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (typeof window !== 'undefined') {
      (window as any).__twine_active_pc = null;
    }
    pendingIceCandidatesRef.current = [];
    isIceRestartingRef.current = false;
  };

  /**
   * 5. Realtime WebRTC Quality Monitor (getStats Engine)
   */
  const pollCallQualityStats = async () => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState !== 'connected') return;

    try {
      const statsReport = await pc.getStats();
      let rtt = 0;
      let packetsLost = 0;
      let totalPackets = 0;
      let jitter = 0;
      let bytesReceived = 0;
      let frameWidth = 0;
      let frameHeight = 0;
      let framesPerSec = 0;

      statsReport.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : rtt;
        }
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'video') {
            frameWidth = report.frameWidth || frameWidth;
            frameHeight = report.frameHeight || frameHeight;
            framesPerSec = report.framesPerSecond || framesPerSec;
          }
          if (report.jitter !== undefined) {
            jitter = Math.round(report.jitter * 1000);
          }
          if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
            packetsLost += report.packetsLost;
            totalPackets += report.packetsLost + report.packetsReceived;
          }
          if (report.bytesReceived !== undefined) {
            bytesReceived += report.bytesReceived;
          }
        }
      });

      const now = Date.now();
      let bitrate = 0;
      if (lastBytesReceivedRef.current.timestamp > 0) {
        const timeDiffSec = (now - lastBytesReceivedRef.current.timestamp) / 1000;
        const bytesDiff = bytesReceived - lastBytesReceivedRef.current.bytes;
        if (timeDiffSec > 0 && bytesDiff >= 0) {
          bitrate = Math.round((bytesDiff * 8) / (timeDiffSec * 1000));
        }
      }
      lastBytesReceivedRef.current = { bytes: bytesReceived, timestamp: now };

      const lossRate = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
      const lossPercent = Math.round(lossRate * 10) / 10;

      let quality: 'good' | 'fair' | 'poor' = 'good';
      if (rtt > 300 || lossPercent > 8) {
        quality = 'poor';
      } else if (rtt > 150 || lossPercent > 3) {
        quality = 'fair';
      }

      setStats({
        rttMs: rtt,
        packetLossPercent: lossPercent,
        jitterMs: jitter,
        bitrateKbps: bitrate,
        resolution: frameWidth > 0 ? `${frameWidth}x${frameHeight}` : 'Audio Only',
        fps: Math.round(framesPerSec),
        quality,
      });
    } catch (err) {
      console.warn('[WebRTC Stats Error]', err);
    }
  };

  useEffect(() => {
    if (isIncoming) {
      sounds.startRingtone();
    } else {
      sounds.startDialTone();
      startOutgoingCall();
    }

    const durationTimer = setInterval(() => {
      setCallStatus((status) => {
        if (status === 'connected') {
          setDuration((d) => d + 1);
        }
        return status;
      });
    }, 1000);

    // 5. Poll WebRTC statistics every 2.5 seconds
    statsIntervalRef.current = setInterval(pollCallQualityStats, 2500);

    // --- WebSocket Signaling Listeners ---

    // A. Call Accepted by Peer (Initiator receives Answer)
    const unsubAnswer = wsClient.on('webrtc:call_accepted', async (payload) => {
      sounds.stopDialTone();
      sounds.playCallAccept();
      disarmConnectionWatchdog();
      if (pcRef.current && payload.answer) {
        try {
          if (pcRef.current.signalingState === 'have-local-offer') {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
            await drainPendingIceCandidates(pcRef.current);
          }
          setCallStatus('connected');
          isIceRestartingRef.current = false;
          attachRemoteMedia();
        } catch (err) {
          console.error('[WebRTC] Error setting remote description on answer:', err);
        }
      }
    });

    // B. ICE Candidate received
    const unsubIce = wsClient.on('webrtc:ice_candidate', async (payload) => {
      if (payload.candidate) {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.warn('[WebRTC] Non-fatal ICE candidate handling warning:', e);
          }
        } else {
          pendingIceCandidatesRef.current.push(payload.candidate);
        }
      }
    });

    // C. Screen Share & Media State Sync / SDP Renegotiation (Perfect Negotiation)
    const unsubRenegotiate = wsClient.on('webrtc:renegotiate', async (payload) => {
      if (payload.call_id && payload.call_id !== callIdRef.current) return;

      const pc = pcRef.current;

      // Handle SDP Offer in Renegotiation with Perfect Negotiation Glare Handling
      if (payload.offer && pc) {
        try {
          const offerCollision = isMakingOfferRef.current || pc.signalingState !== 'stable';
          const ignoreOffer = !isPolite && offerCollision;

          if (ignoreOffer) {
            console.warn('[WebRTC Glare] Impolite peer ignoring colliding offer');
            return;
          }

          if (offerCollision && isPolite) {
            console.log('[WebRTC Glare] Polite peer rolling back to accept colliding offer');
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' } as any),
              pc.setRemoteDescription(new RTCSessionDescription(payload.offer)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          }

          await drainPendingIceCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          wsClient.send('webrtc:renegotiate', {
            call_id: callIdRef.current,
            target_user_id: peer.id,
            answer,
            is_screen_sharing: payload.is_screen_sharing,
            is_video_active: payload.is_video_active,
          });
        } catch (renErr) {
          console.error('[WebRTC] Error handling renegotiation offer:', renErr);
        }
      }

      // Handle SDP Answer in Renegotiation
      if (payload.answer && pc) {
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            await drainPendingIceCandidates(pc);
            isIceRestartingRef.current = false;
          }
        } catch (ansErr) {
          console.error('[WebRTC] Error setting remote description on renegotiation answer:', ansErr);
        }
      }

      // Update Remote Peer Video / Screen Share UI State
      if (payload.is_screen_sharing !== undefined) {
        setRemoteIsScreenSharing(Boolean(payload.is_screen_sharing));
      }

      if (payload.is_screen_sharing !== undefined || payload.is_video_active !== undefined) {
        const peerHasVideo =
          Boolean(payload.is_screen_sharing) || Boolean(payload.is_video_active);
        setRemoteHasVideo(peerHasVideo);
      }

      attachRemoteMedia();
    });

    // D. Remote Peer Hangup / Ended
    const unsubEnded = wsClient.on('webrtc:call_ended', (payload) => {
      if (hasEndedRef.current) return;
      hasEndedRef.current = true;
      sounds.stopRingtone();
      sounds.stopDialTone();
      sounds.playCallEnd();
      setCallStatus('ended');
      if (payload?.reason === 'offline') {
        setErrorMessage('User is offline or unreachable.');
      } else if (payload?.reason === 'blocked') {
        setErrorMessage('Call could not be completed.');
      } else if (payload?.reason === 'busy') {
        setErrorMessage('User is currently on another call (Busy).');
      } else if (payload?.reason === 'rejected') {
        setErrorMessage('Call declined by user.');
      }
      cleanup();
      setTimeout(() => onEndCall(durationRef.current), 1200);
    });

    const handleBeforeUnload = () => {
      cleanup();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(durationTimer);
      sounds.stopRingtone();
      sounds.stopDialTone();
      unsubAnswer();
      unsubIce();
      unsubRenegotiate();
      unsubEnded();
      cleanup();
    };
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const showVideoView =
    (callType === 'video' && (isVideoActive || remoteHasVideo)) ||
    isScreenSharing ||
    remoteIsScreenSharing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-slate-950/75 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Hidden dedicated audio element for continuous high-fidelity remote audio streaming */}
      <audio
        ref={(el) => {
          remoteAudioRef.current = el;
          if (el && remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
            el.srcObject = remoteStreamRef.current;
            el.play().catch(() => {});
          }
        }}
        autoPlay
        playsInline
      />

      {/* --- 1. INCOMING CALL RINGING DIALOG --- */}
      {callStatus === 'incoming_ringing' ? (
        <div className="w-full max-w-sm bg-gradient-to-b from-[#1e2c3a] to-[#0f1720] sm:rounded-3xl rounded-2xl overflow-hidden shadow-2xl border border-white/15 flex flex-col items-center justify-between p-6 sm:p-8 text-center min-h-[380px] sm:min-h-[440px] animate-in fade-in zoom-in duration-200 m-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#3fc5f0]/15 border border-[#3fc5f0]/30 text-[#3fc5f0] text-xs font-semibold animate-pulse">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Incoming {callType === 'video' ? 'Video' : 'Voice'} Call</span>
            </div>
            <h3 className="text-xl font-black text-white mt-2 truncate max-w-[280px]">{peer.display_name}</h3>
            <p className="text-xs text-[#7f91a4] truncate">@{peer.username} is calling you on Twine</p>
          </div>

          {/* Animated Avatar with Pulsing Waves */}
          <div className="relative my-6 sm:my-8">
            <div className="absolute inset-0 -m-6 rounded-full border-2 border-emerald-400/40 animate-ping opacity-75"></div>
            <div className="absolute inset-0 -m-3 rounded-full border-2 border-emerald-400/60 animate-pulse"></div>
            <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="xl" className="shadow-2xl relative z-10" />
          </div>

          {/* Accept / Decline Action Buttons */}
          <div className="flex items-center justify-center space-x-6 sm:space-x-8 w-full pt-2 sm:pt-4">
            {/* Decline */}
            <div className="flex flex-col items-center space-y-1.5">
              <button
                type="button"
                onClick={handleDeclineCall}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform active:scale-90"
                title="Decline Call"
              >
                <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
              </button>
              <span className="text-xs font-semibold text-red-400">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center space-y-1.5">
              <button
                type="button"
                onClick={handleAcceptCall}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 transition-transform active:scale-90 animate-bounce"
                title="Accept Call"
              >
                <Phone className="w-6 h-6 sm:w-7 sm:h-7" />
              </button>
              <span className="text-xs font-semibold text-emerald-400">Accept</span>
            </div>
          </div>
        </div>
      ) : (
        /* --- 2. ACTIVE / OUTGOING / CONNECTING CALL MODAL (Premium Glassmorphism Design) --- */
        <div className="w-full h-full sm:h-auto sm:max-w-2xl bg-gradient-to-b from-[#182533]/95 via-[#0e1621]/98 to-[#090e14]/99 sm:rounded-3xl rounded-none shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] border-0 sm:border sm:border-white/10 flex flex-col min-h-[100dvh] sm:min-h-[520px] max-h-[100dvh] sm:max-h-[85vh] justify-between overflow-hidden">
          {/* Top Call Info Bar */}
          <div className="p-3.5 sm:p-4 bg-[#17212b]/85 backdrop-blur-md border-b border-white/10 flex items-center justify-between flex-shrink-0 min-w-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1 mr-2">
              <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="sm" isOnline={true} />
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">{peer.display_name}</h3>
                <p className="text-[10px] sm:text-[11px] font-medium flex items-center space-x-1.5">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      callStatus === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : callStatus === 'failed'
                        ? 'bg-red-500'
                        : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span
                    className={
                      callStatus === 'connected'
                        ? 'text-emerald-400'
                        : callStatus === 'failed'
                        ? 'text-red-400'
                        : 'text-amber-300'
                    }
                  >
                    {callStatus === 'outgoing_ringing'
                      ? 'Ringing...'
                      : callStatus === 'connecting'
                      ? 'Connecting...'
                      : callStatus === 'reconnecting'
                      ? 'Reconnecting (Network fluctuation)...'
                      : callStatus === 'failed'
                      ? 'Connection Failed'
                      : `Connected (${formatTimer(duration)})`}
                  </span>
                </p>
              </div>
            </div>

            {/* Quality & Status Badges */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
              {stats && callStatus === 'connected' && (
                <button
                  type="button"
                  onClick={() => setShowStatsModal(!showStatsModal)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    stats.quality === 'good'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : stats.quality === 'fair'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/15 text-red-400 border-red-500/40 animate-pulse'
                  }`}
                  title="Click to view real-time WebRTC quality metrics"
                >
                  <Activity className="w-3 h-3" />
                  <span>{stats.rttMs}ms</span>
                  {stats.packetLossPercent > 0 && <span>• {stats.packetLossPercent}%</span>}
                </button>
              )}

              {(isScreenSharing || remoteIsScreenSharing) && (
                <div className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] sm:text-[11px] font-semibold animate-pulse">
                  <Monitor className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">
                    {isScreenSharing ? 'Sharing Screen' : `${peer.display_name} Screen`}
                  </span>
                </div>
              )}

              <div className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] sm:text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">E2EE Stream</span>
              </div>
            </div>
          </div>

          {/* Diagnostic Stats Overlay Card */}
          {showStatsModal && stats && (
            <div className="p-3 bg-[#0d1620]/90 backdrop-blur-md border-b border-white/10 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs animate-in slide-in-from-top-2">
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">RTT (Latency)</div>
                <div className="font-bold text-white">{stats.rttMs} ms</div>
              </div>
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">Packet Loss</div>
                <div className="font-bold text-white">{stats.packetLossPercent}%</div>
              </div>
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">Jitter</div>
                <div className="font-bold text-white">{stats.jitterMs} ms</div>
              </div>
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">Bitrate</div>
                <div className="font-bold text-white">{stats.bitrateKbps} kbps</div>
              </div>
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">Resolution</div>
                <div className="font-bold text-white">{stats.resolution}</div>
              </div>
              <div className="p-1.5 bg-[#17212b] rounded-lg">
                <div className="text-[10px] text-[#7f91a4]">Framerate</div>
                <div className="font-bold text-white">{stats.fps > 0 ? `${stats.fps} fps` : 'N/A'}</div>
              </div>
            </div>
          )}

          {/* Video / Screen Share / Voice Stream Container */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[340px]">
            {errorMessage && (
              <div className="absolute top-4 left-4 right-4 z-30 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center space-x-2 backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {showVideoView ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                {/* Main View: If remote is sharing video/screen, show remote stream; otherwise show local shared screen */}
                {remoteHasVideo || remoteIsScreenSharing ? (
                  <video
                    ref={(el) => {
                      remoteVideoRef.current = el;
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover sm:object-contain bg-black"
                  />
                ) : (
                  <video
                    ref={(el) => {
                      localVideoRef.current = el;
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover sm:object-contain bg-black"
                  />
                )}

                {/* Subtitle / Overlay Badge */}
                <div className="absolute top-3 left-3 z-10 px-2.5 sm:px-3 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] sm:text-xs font-semibold text-white flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="truncate max-w-[180px] sm:max-w-none">
                    {remoteIsScreenSharing
                      ? `🖥️ ${peer.display_name}'s Screen`
                      : isScreenSharing
                      ? `🖥️ You are sharing screen`
                      : `${peer.display_name}`}
                  </span>
                </div>

                {/* Picture-in-Picture (Bottom-Right corner with safe offset) */}
                <div className="absolute bottom-20 right-3 sm:bottom-4 sm:right-4 z-20 w-28 h-36 sm:w-44 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-[#17212b] flex items-center justify-center">
                  {(remoteHasVideo || remoteIsScreenSharing) && (isScreenSharing || isVideoActive) ? (
                    <video
                      ref={(el) => {
                        localVideoRef.current = el;
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-1 text-center p-1.5">
                      <UserAvatar name={isScreenSharing ? peer.display_name : 'You'} size="sm" isOnline={true} />
                      <span className="text-[9px] sm:text-[10px] text-white/80 font-medium truncate max-w-[80px] sm:max-w-[120px]">
                        {isScreenSharing ? peer.display_name : 'You'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Voice Call Audio View - Centered with Rich Ambient Glow */
              <div className="flex flex-col items-center justify-center space-y-5 py-8 px-4 w-full">
                <div className="relative flex items-center justify-center">
                  {callStatus === 'connected' && (
                    <>
                      <div className="absolute w-40 h-40 rounded-full bg-emerald-500/10 blur-xl animate-pulse"></div>
                      <div className="absolute inset-0 -m-6 rounded-full border border-emerald-400/30 animate-ping opacity-60"></div>
                      <div className="absolute inset-0 -m-3 rounded-full border border-emerald-400/50 animate-pulse"></div>
                    </>
                  )}
                  {callStatus === 'reconnecting' && (
                    <>
                      <div className="absolute w-40 h-40 rounded-full bg-amber-500/15 blur-xl animate-pulse"></div>
                      <div className="absolute inset-0 -m-4 rounded-full border-2 border-amber-400/50 animate-spin"></div>
                    </>
                  )}
                  {callStatus === 'outgoing_ringing' && (
                    <>
                      <div className="absolute w-40 h-40 rounded-full bg-cyan-500/15 blur-xl animate-pulse"></div>
                      <div className="absolute inset-0 -m-5 rounded-full border border-[#3fc5f0]/40 animate-pulse"></div>
                    </>
                  )}
                  <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="xl" className="shadow-[0_10px_35px_rgba(0,0,0,0.6)] relative z-10 scale-105" />
                </div>
                <div className="text-center space-y-1.5 px-4 max-w-sm">
                  <p className="text-lg sm:text-2xl font-bold text-white tracking-wide truncate">{peer.display_name}</p>
                  <p className="text-xs text-[#7f91a4] font-medium">
                    {callStatus === 'connected'
                      ? 'HD Voice Stream Active • Opus 48kHz'
                      : callStatus === 'reconnecting'
                      ? 'Reconnecting audio stream...'
                      : callStatus === 'failed'
                      ? 'Connection failed'
                      : 'Calling...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar (Mobile touch-friendly >= 48px touch targets, bottom safe-area) */}
          <div className="p-3.5 sm:p-4 bg-[#17212b]/85 backdrop-blur-md border-t border-white/10 flex items-center justify-center space-x-3 sm:space-x-5 flex-shrink-0 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
            {/* Microphone Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all ${
                isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            {/* Camera Video Toggle */}
            <button
              type="button"
              onClick={toggleVideo}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all ${
                !isVideoActive ? 'bg-[#242f3d] text-white/50 hover:bg-[#2f3f52]' : 'bg-[#2b5278] text-white hover:bg-[#356391]'
              }`}
              title={isVideoActive ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoActive ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            {/* Speaker Toggle */}
            <button
              type="button"
              onClick={toggleSpeaker}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all ${
                isSpeakerMuted ? 'bg-amber-600 text-white' : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            >
              {isSpeakerMuted ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all ${
                isScreenSharing
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-400 animate-pulse'
                  : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={handleHangup}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform active:scale-95 ml-1"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
