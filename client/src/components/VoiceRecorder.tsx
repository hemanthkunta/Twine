import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Send, Check } from 'lucide-react';
import { sounds } from '../services/sound';

interface VoiceRecorderProps {
  onCancel: () => void;
  onSend: (audioBase64: string, waveform: number[], duration: number) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onCancel, onSend }) => {
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    startRecording();
    const timer = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      stopTracks();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const stopTracks = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
        else mimeType = '';
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      waveformSamplesRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      // Set up AudioContext for real-time waveform visualization
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;
        drawWaveform();
      }

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone access unavailable or denied, enabling HD voice simulation:', err);
      setIsRecording(true);
      simulateWaveform();
    }
  };

  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    if (canvas.parentElement) {
      const containerWidth = canvas.parentElement.clientWidth;
      if (canvas.width !== containerWidth && containerWidth > 0) {
        canvas.width = containerWidth;
      }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalBars = Math.min(32, Math.floor(canvas.width / 6));
    const step = Math.max(1, Math.floor(dataArray.length / totalBars));
    const barWidth = Math.max(2, (canvas.width - totalBars * 2) / totalBars);
    const gap = 2;
    let x = 0;
    let avg = 0;

    for (let i = 0; i < totalBars; i++) {
      const v = (dataArray[i * step] || 0) / 255;
      avg += v;
      const barHeight = Math.max(3, v * canvas.height * 0.9);

      ctx.fillStyle = '#3fc5f0';
      ctx.beginPath();
      ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth, barHeight, 2);
      ctx.fill();

      x += barWidth + gap;
      if (x > canvas.width) break;
    }

    // Capture normalized sample for playback waveform
    if (waveformSamplesRef.current.length < 24) {
      waveformSamplesRef.current.push(Math.min(1, Math.max(0.15, (avg / totalBars) * 2)));
    }

    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const simulateWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.parentElement) {
      const containerWidth = canvas.parentElement.clientWidth;
      if (canvas.width !== containerWidth && containerWidth > 0) {
        canvas.width = containerWidth;
      }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const totalBars = Math.min(32, Math.floor(canvas.width / 6));
    const barWidth = Math.max(2, (canvas.width - totalBars * 2) / totalBars);
    const gap = 2;
    let x = 0;

    for (let i = 0; i < totalBars; i++) {
      const h = Math.sin(Date.now() / 200 + i) * 8 + 12;
      ctx.fillStyle = '#3fc5f0';
      ctx.beginPath();
      ctx.roundRect(x, (canvas.height - h) / 2, barWidth, h, 2);
      ctx.fill();
      x += barWidth + gap;
    }

    animationFrameRef.current = requestAnimationFrame(simulateWaveform);
  };

  const handleFinishAndSend = () => {
    const recorder = mediaRecorderRef.current;
    let waveform = waveformSamplesRef.current;
    if (waveform.length === 0) {
      waveform = [0.3, 0.6, 0.8, 0.4, 0.9, 0.7, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 0.5, 0.9, 0.6, 0.4, 0.8, 0.3];
    }
    const finalDuration = Math.max(1, duration);

    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stopTracks();
        if (audioChunksRef.current.length > 0) {
          const mime = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mime });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            onSend(base64, waveform, finalDuration);
          };
          reader.readAsDataURL(audioBlob);
        }
      };

      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch {}
      recorder.stop();
    } else if (audioChunksRef.current.length > 0) {
      stopTracks();
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        onSend(base64, waveform, finalDuration);
      };
      reader.readAsDataURL(audioBlob);
    } else {
      stopTracks();
      onCancel();
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center space-x-1.5 sm:space-x-3 w-full bg-[#182533] p-1.5 sm:p-2 rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-inner min-w-0 overflow-hidden">
      <button
        onClick={onCancel}
        className="p-1.5 sm:p-2 text-[#7f91a4] hover:text-red-400 hover:bg-[#242f3d] rounded-xl transition-all flex-shrink-0"
        title="Cancel voice note"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Pulsing Recording Indicator */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></div>
        <span className="text-xs font-mono font-bold text-white min-w-[32px] sm:min-w-[36px]">
          {formatTimer(duration)}
        </span>
      </div>

      {/* Real-Time Audio Frequency Waveform Canvas */}
      <div className="flex-1 flex items-center justify-center h-7 sm:h-8 px-1 sm:px-2 overflow-hidden min-w-0">
        <canvas ref={canvasRef} width={160} height={28} className="w-full max-w-[200px] h-6 sm:h-7" />
      </div>

      {/* Send Voice Note Button */}
      <button
        onClick={handleFinishAndSend}
        className="p-2 sm:p-2.5 bg-[#2f88ff] hover:bg-[#2575dc] text-white rounded-xl shadow-md shadow-[#2f88ff]/30 transition-transform active:scale-95 flex-shrink-0"
        title="Send Voice Note"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
};
