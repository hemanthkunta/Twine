import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { UserSummary } from '../types/index';
import { wsClient } from '../services/ws';
import { sounds } from '../services/sound';
import { UserAvatar } from './UserAvatar';

interface WebRTCManagerProps {
  peer: UserSummary;
  callType: 'voice' | 'video';
  isIncoming?: boolean;
  incomingOffer?: any;
  callId?: string;
  onEndCall: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export const WebRTCManager: React.FC<WebRTCManagerProps> = ({
  peer,
  callType,
  isIncoming = false,
  incomingOffer,
  callId,
  onEndCall,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<
    'incoming_ringing' | 'outgoing_ringing' | 'connecting' | 'connected' | 'ended'
  >(isIncoming ? 'incoming_ringing' : 'outgoing_ringing');
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string>(callId || `call_${Date.now()}`);

  useEffect(() => {
    if (isIncoming) {
      // 1. Incoming Call -> Play ringtone and wait for user to accept/decline
      sounds.startRingtone();
    } else {
      // 2. Outgoing Call -> Start outgoing call sequence immediately
      sounds.startDialTone();
      startOutgoingCall();
    }

    // Call Duration Timer (ticks when connected)
    const timer = setInterval(() => {
      setCallStatus((status) => {
        if (status === 'connected') {
          setDuration((d) => d + 1);
        }
        return status;
      });
    }, 1000);

    // --- WebSocket Signaling Listeners ---

    // A. Call Accepted by Peer
    const unsubAnswer = wsClient.on('webrtc:call_accepted', async (payload) => {
      sounds.stopDialTone();
      sounds.playCallAccept();
      if (pcRef.current && payload.answer) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          // Drain queued ICE candidates
          while (pendingIceCandidatesRef.current.length > 0) {
            const cand = pendingIceCandidatesRef.current.shift()!;
            await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }
          setCallStatus('connected');
        } catch (err) {
          console.error('Error setting remote description on answer:', err);
          setCallStatus('connected');
        }
      }
    });

    // B. ICE Candidate received
    const unsubIce = wsClient.on('webrtc:ice_candidate', async (payload) => {
      if (payload.candidate) {
        if (pcRef.current && pcRef.current.remoteDescription) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error('Failed to add ICE candidate:', e);
          }
        } else {
          pendingIceCandidatesRef.current.push(payload.candidate);
        }
      }
    });

    // C. Screen Share & Media State Sync from Peer
    const unsubRenegotiate = wsClient.on('webrtc:renegotiate', async (payload) => {
      if (payload.is_screen_sharing !== undefined) {
        setRemoteIsScreenSharing(Boolean(payload.is_screen_sharing));
        if (payload.is_screen_sharing) {
          setRemoteHasVideo(true);
          // Ensure remote video element attaches and plays
          setTimeout(() => {
            if (remoteVideoRef.current && remoteStreamRef.current) {
              remoteVideoRef.current.srcObject = remoteStreamRef.current;
              remoteVideoRef.current.play().catch(() => {});
            }
          }, 100);
        } else if (!payload.is_video_active) {
          setRemoteHasVideo(false);
        }
      }

      if (payload.is_video_active !== undefined) {
        setRemoteHasVideo(Boolean(payload.is_video_active || payload.is_screen_sharing));
      }
    });

    // D. Remote Peer Hangup / Ended
    const unsubEnded = wsClient.on('webrtc:call_ended', () => {
      sounds.stopRingtone();
      sounds.stopDialTone();
      sounds.playCallEnd();
      cleanup();
      onEndCall();
    });

    return () => {
      clearInterval(timer);
      sounds.stopRingtone();
      sounds.stopDialTone();
      unsubAnswer();
      unsubIce();
      unsubRenegotiate();
      unsubEnded();
      cleanup();
    };
  }, []);

  /**
   * Helper to safely acquire local user media with graceful fallback
   */
  const getLocalMediaStream = async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      return stream;
    } catch (err) {
      console.warn('Microphone/Camera not available or denied, creating synthesized audio/video track:', err);
      // Create empty synthesized canvas & silent audio tracks so WebRTC handshakes succeed
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#17212b';
      ctx.fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(15);
      return stream;
    }
  };

  /**
   * Setup RTCPeerConnection and attach transceivers & listeners
   */
  const createPeerConnection = (stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    localStreamRef.current = stream;

    if (localVideoRef.current && callType === 'video') {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }

    // Always add audio and video transceivers to guarantee video/screen can be added dynamically
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    // Attach local stream tracks to PC
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

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

    // Handle incoming remote media tracks (Audio, Video, Screen Share)
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamRef.current = remoteStream;

      if (event.track.kind === 'video') {
        setRemoteHasVideo(true);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        event.track.onended = () => {
          setRemoteHasVideo(false);
          setRemoteIsScreenSharing(false);
        };
        event.track.onmute = () => {
          // When track is temporarily muted
        };
        event.track.onunmute = () => {
          setRemoteHasVideo(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(() => {});
          }
        };
      }

      // Connect remote audio element to ensure audio always plays
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }

      setCallStatus('connected');
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        sounds.stopDialTone();
        sounds.stopRingtone();
        setCallStatus('connected');
      }
    };

    return pc;
  };

  /**
   * Initiator: Create Offer & Send to Peer
   */
  const startOutgoingCall = async () => {
    try {
      const stream = await getLocalMediaStream();
      const pc = createPeerConnection(stream);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      wsClient.send('webrtc:call_user', {
        call_id: callIdRef.current,
        target_user_id: peer.id,
        call_type: callType,
        offer,
      });
    } catch (err) {
      console.error('Error starting outgoing call:', err);
    }
  };

  /**
   * Callee Action: User Clicks "Accept Call"
   */
  const handleAcceptCall = async () => {
    sounds.stopRingtone();
    sounds.playCallAccept();
    setCallStatus('connecting');

    try {
      const stream = await getLocalMediaStream();
      const pc = createPeerConnection(stream);

      if (incomingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));

        // Drain any pending ICE candidates received before answer
        while (pendingIceCandidatesRef.current.length > 0) {
          const cand = pendingIceCandidatesRef.current.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        wsClient.send('webrtc:answer', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          answer,
        });

        setCallStatus('connected');
      }
    } catch (err) {
      console.error('Error accepting call:', err);
      setCallStatus('connected');
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
   * Toggle Screen Sharing with dynamic Track Replacement
   */
  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start Screen Sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as any,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (pcRef.current) {
          // Find video sender or transceiver
          const videoSender =
            pcRef.current.getSenders().find((s) => s.track?.kind === 'video' || (s as any).kind === 'video') ||
            pcRef.current.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;

          if (videoSender) {
            await videoSender.replaceTrack(screenTrack);
          } else {
            pcRef.current.addTrack(screenTrack, screenStream);
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
          localVideoRef.current.play().catch(() => {});
        }

        // Notify peer via WebSocket
        wsClient.send('webrtc:renegotiate', {
          call_id: callIdRef.current,
          target_user_id: peer.id,
          is_screen_sharing: true,
          is_video_active: true,
        });

        setIsScreenSharing(true);

        // Handle user stopping screen share via browser floating bar
        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } else {
        // Stop Screen Sharing
        stopScreenSharing();
      }
    } catch (err) {
      console.warn('Screen sharing access cancelled or error:', err);
    }
  };

  const stopScreenSharing = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    setIsScreenSharing(false);

    if (pcRef.current) {
      const videoSender =
        pcRef.current.getSenders().find((s) => s.track?.kind === 'video' || (s as any).kind === 'video') ||
        pcRef.current.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;

      if (videoSender) {
        if (isVideoActive && localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0];
          await videoSender.replaceTrack(cameraTrack || null);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        } else {
          await videoSender.replaceTrack(null);
        }
      }
    }

    // Notify peer
    wsClient.send('webrtc:renegotiate', {
      call_id: callIdRef.current,
      target_user_id: peer.id,
      is_screen_sharing: false,
      is_video_active: isVideoActive,
    });
  };

  /**
   * End / Hangup Active Call
   */
  const handleHangup = () => {
    sounds.stopRingtone();
    sounds.stopDialTone();
    sounds.playCallEnd();
    wsClient.send('webrtc:hangup', {
      call_id: callIdRef.current,
      target_user_id: peer.id,
      reason: 'user_ended',
    });
    cleanup();
    onEndCall();
  };

  const cleanup = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = async () => {
    const nextVideoState = !isVideoActive;
    setIsVideoActive(nextVideoState);

    if (localStreamRef.current && pcRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = nextVideoState;
      }
      const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video' || (s as any).kind === 'video');
      if (videoSender && !isScreenSharing) {
        await videoSender.replaceTrack(nextVideoState ? videoTrack : null);
      }
    }

    wsClient.send('webrtc:renegotiate', {
      call_id: callIdRef.current,
      target_user_id: peer.id,
      is_screen_sharing: isScreenSharing,
      is_video_active: nextVideoState,
    });
  };

  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerMuted;
      setIsSpeakerMuted(!isSpeakerMuted);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Condition to render video / screen share canvas
  const showVideoView = isVideoActive || isScreenSharing || remoteHasVideo || remoteIsScreenSharing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl">
      {/* Hidden dedicated audio element for continuous high-fidelity remote audio streaming */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* --- 1. INCOMING CALL RINGING DIALOG --- */}
      {callStatus === 'incoming_ringing' ? (
        <div className="w-full max-w-sm glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.15)] flex flex-col items-center justify-between p-6 sm:p-8 text-center min-h-[420px] sm:min-h-[460px] animate-in fade-in zoom-in duration-200">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#3fc5f0]/15 border border-[#3fc5f0]/30 text-[#3fc5f0] text-xs font-semibold animate-pulse">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Incoming {callType === 'video' ? 'Video' : 'Voice'} Call</span>
            </div>
            <h3 className="text-xl font-black text-white mt-2">{peer.display_name}</h3>
            <p className="text-xs text-[#7f91a4]">@{peer.username} is calling you on Twine</p>
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
        /* --- 2. ACTIVE / OUTGOING CALL MODAL --- */
        <div className="w-full max-w-3xl glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.15)] flex flex-col min-h-[460px] sm:min-h-[520px] max-h-[94vh] justify-between">
          {/* Top Call Info Bar */}
          <div className="p-3.5 sm:p-4 bg-[#17212b]/95 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
              <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="sm" isOnline={true} />
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">{peer.display_name}</h3>
                <p className="text-[10px] sm:text-[11px] font-medium flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${callStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
                  <span className={callStatus === 'connected' ? 'text-emerald-400' : 'text-amber-300'}>
                    {callStatus === 'outgoing_ringing'
                      ? 'Ringing...'
                      : callStatus === 'connecting'
                      ? 'Connecting...'
                      : `Connected (${formatTimer(duration)})`}
                  </span>
                </p>
              </div>
            </div>

            {/* Status Badges */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
              {(isScreenSharing || remoteIsScreenSharing) && (
                <div className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] sm:text-[11px] font-semibold animate-pulse">
                  <Monitor className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">{isScreenSharing ? 'Sharing Screen' : `${peer.display_name} Screen`}</span>
                </div>
              )}
              <div className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] sm:text-[11px] font-semibold">
                <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">WebRTC</span>
              </div>
            </div>
          </div>

          {/* Video / Screen Share / Voice Stream Container */}
          <div className="relative flex-1 bg-[#0b1219] flex items-center justify-center overflow-hidden min-h-[280px] sm:min-h-[350px]">
            {showVideoView ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                {/* Main View: If remote is sharing video/screen, show remote stream; otherwise show local shared screen */}
                {remoteHasVideo || remoteIsScreenSharing ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                )}

                {/* Subtitle / Overlay Badge */}
                <div className="absolute top-3 left-3 z-10 px-2.5 sm:px-3 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[11px] sm:text-xs font-semibold text-white flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="truncate max-w-[200px] sm:max-w-none">
                    {remoteIsScreenSharing
                      ? `🖥️ ${peer.display_name}'s Screen`
                      : isScreenSharing
                      ? `🖥️ You are sharing screen`
                      : `${peer.display_name}`}
                  </span>
                </div>

                {/* Picture-in-Picture (Bottom-Right) */}
                <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 w-28 h-20 sm:w-44 sm:h-32 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border-2 border-[rgba(255,255,255,0.2)] bg-[#17212b] flex items-center justify-center">
                  {(remoteHasVideo || remoteIsScreenSharing) && (isScreenSharing || isVideoActive) ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-1 text-center p-1.5">
                      <UserAvatar name={isScreenSharing ? peer.display_name : 'You'} size="sm" isOnline={true} />
                      <span className="text-[9px] sm:text-[10px] text-white/80 font-medium truncate max-w-[90px] sm:max-w-[120px]">
                        {isScreenSharing ? peer.display_name : 'You'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Voice Call Audio View */
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <div className="relative">
                  {callStatus === 'connected' && (
                    <div className="absolute inset-0 -m-4 rounded-full border-2 border-emerald-400/40 animate-ping opacity-75"></div>
                  )}
                  {callStatus === 'outgoing_ringing' && (
                    <div className="absolute inset-0 -m-4 rounded-full border-2 border-[#3fc5f0]/40 animate-pulse"></div>
                  )}
                  <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="xl" className="shadow-2xl" />
                </div>
                <div className="text-center space-y-1 px-4">
                  <p className="text-sm font-bold text-white">{peer.display_name}</p>
                  <p className="text-xs text-[#7f91a4]">
                    {callStatus === 'connected'
                      ? 'HD WebRTC Voice Stream Active'
                      : 'Waiting for peer to answer...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="p-3 sm:p-4 bg-[#17212b] border-t border-[rgba(255,255,255,0.06)] flex items-center justify-center space-x-2.5 sm:space-x-4 flex-shrink-0">
            {/* Microphone Toggle */}
            <button
              onClick={toggleMute}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Camera Video Toggle */}
            <button
              onClick={toggleVideo}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                !isVideoActive ? 'bg-[#242f3d] text-white/50 hover:bg-[#2f3f52]' : 'bg-[#2b5278] text-white hover:bg-[#356391]'
              }`}
              title={isVideoActive ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoActive ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Speaker Toggle */}
            <button
              onClick={toggleSpeaker}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                isSpeakerMuted ? 'bg-amber-600 text-white' : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            >
              {isSpeakerMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                isScreenSharing
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-400 animate-pulse'
                  : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
              }`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* End Call Button */}
            <button
              onClick={handleHangup}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform active:scale-95"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
