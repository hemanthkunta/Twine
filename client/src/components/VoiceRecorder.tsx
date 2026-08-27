import React, { useRef, useState } from 'react';
import { Mic, Square, X, Send } from 'lucide-react';

interface VoiceRecorderProps {
    onRecordingComplete: (
        base64Data: string,
        mimeType: string,
        duration: number,
        waveform: number[]
    ) => void;
    onCancel: () => void;
}

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'];

function getSupportedMimeType(): string | null {
    if (typeof MediaRecorder === 'undefined') {
        return null;
    }

    for (const mimeType of MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }

    return null;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordingComplete, onCancel }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [waveform, setWaveform] = useState<number[]>([]);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const chunksRef = useRef<Blob[]>([]);
    const startTimeRef = useRef<number>(0);

    const timerRef = useRef<number | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const animationFrameRef = useRef<number | null>(null);

    const waveformSamplesRef = useRef<number[]>([]);

    const cleanup = () => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (sourceRef.current) {
            try {
                sourceRef.current.disconnect();
            } catch {
                // Already disconnected.
            }

            sourceRef.current = null;
        }

        if (analyserRef.current) {
            try {
                analyserRef.current.disconnect();
            } catch {
                // Already disconnected.
            }

            analyserRef.current = null;
        }

        if (audioContextRef.current) {
            void audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
                track.stop();
            });

            streamRef.current = null;
        }

        mediaRecorderRef.current = null;
    };

    const collectWaveform = () => {
        const analyser = analyserRef.current;

        if (!analyser) {
            return;
        }

        const data = new Uint8Array(analyser.fftSize);

        analyser.getByteTimeDomainData(data);

        let sum = 0;

        for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / data.length);

        // Make quiet speech visible without changing the actual recording volume.
        const level = Math.min(1, Math.max(0.08, rms * 5));

        waveformSamplesRef.current.push(level);

        // Keep approximately the latest 80 samples.
        if (waveformSamplesRef.current.length > 80) {
            waveformSamplesRef.current.shift();
        }

        setWaveform([...waveformSamplesRef.current]);

        animationFrameRef.current = window.requestAnimationFrame(collectWaveform);
    };

    const startRecording = async () => {
        try {
            setError(null);

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Microphone access is not supported by this browser.');
            }

            const mimeType = getSupportedMimeType();

            if (!mimeType) {
                throw new Error('This browser does not support WebM/Opus recording.');
            }

            /*
             * Do NOT route microphone audio back to speakers.
             *
             * This is important because routing the microphone through an
             * AudioContext can accidentally create feedback/echo.
             */
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            streamRef.current = stream;

            const recorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 128000,
            });

            mediaRecorderRef.current = recorder;

            chunksRef.current = [];
            waveformSamplesRef.current = [];

            setWaveform([]);
            setDuration(0);

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                console.error('MediaRecorder error');

                setError('Recording failed. Please try again.');
                cleanup();
                setIsRecording(false);
            };

            recorder.onstop = () => {
                try {
                    const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;

                    const finalDuration = Math.max(1, Math.round(elapsedSeconds));

                    const actualMimeType = recorder.mimeType || mimeType;

                    const blob = new Blob(chunksRef.current, {
                        type: actualMimeType,
                    });

                    if (blob.size === 0) {
                        throw new Error('The recorded audio is empty.');
                    }

                    const reader = new FileReader();

                    reader.onloadend = () => {
                        try {
                            const result = reader.result;

                            if (typeof result !== 'string') {
                                throw new Error('Could not convert audio recording.');
                            }

                            const finalWaveform =
                                waveformSamplesRef.current.length > 0
                                    ? [...waveformSamplesRef.current]
                                    : [0.08];

                            console.log('Voice recording created:', {
                                mimeType: actualMimeType,
                                size: blob.size,
                                duration: finalDuration,
                                waveformSamples: finalWaveform.length,
                            });

                            onRecordingComplete(
                                result,
                                actualMimeType,
                                finalDuration,
                                finalWaveform
                            );

                            cleanup();
                            setIsRecording(false);
                        } catch (err) {
                            console.error('Failed to process recording:', err);

                            setError(
                                err instanceof Error ? err.message : 'Failed to process recording.'
                            );

                            cleanup();
                            setIsRecording(false);
                        }
                    };

                    reader.readAsDataURL(blob);
                } catch (err) {
                    console.error('Failed to process recording:', err);

                    setError(err instanceof Error ? err.message : 'Failed to process recording.');

                    cleanup();
                    setIsRecording(false);
                }
            };

            /*
             * The analyser is ONLY used for visualization.
             *
             * There is intentionally NO:
             *
             * source.connect(destination)
             *
             * so microphone audio cannot be played back through speakers.
             */
            try {
                const AudioContextClass =
                    window.AudioContext ||
                    (
                        window as typeof window & {
                            webkitAudioContext?: typeof AudioContext;
                        }
                    ).webkitAudioContext;

                if (AudioContextClass) {
                    const audioContext = new AudioContextClass();

                    const source = audioContext.createMediaStreamSource(stream);

                    const analyser = audioContext.createAnalyser();

                    analyser.fftSize = 512;
                    analyser.smoothingTimeConstant = 0.75;

                    source.connect(analyser);

                    audioContextRef.current = audioContext;
                    sourceRef.current = source;
                    analyserRef.current = analyser;

                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    }
                }
            } catch (err) {
                console.warn('Waveform analyser unavailable:', err);
            }

            startTimeRef.current = Date.now();

            recorder.start(100);

            setIsRecording(true);

            timerRef.current = window.setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);

                setDuration(elapsed);
            }, 100);

            animationFrameRef.current = window.requestAnimationFrame(collectWaveform);
        } catch (err) {
            console.error('Could not start recording:', err);

            cleanup();

            setIsRecording(false);

            setError(err instanceof Error ? err.message : 'Could not access the microphone.');
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;

        if (!recorder) {
            return;
        }

        if (recorder.state === 'recording') {
            recorder.stop();
        }

        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);

            animationFrameRef.current = null;
        }
    };

    const cancelRecording = () => {
        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = null;
            recorder.stop();
        }

        chunksRef.current = [];
        waveformSamplesRef.current = [];

        cleanup();

        setWaveform([]);
        setDuration(0);
        setIsRecording(false);

        onCancel();
    };

    const formatDuration = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    /*
     * Initial state: show microphone button.
     */
    if (!isRecording) {
        return (
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={startRecording}
                    className="p-2.5 rounded-xl text-[#7f91a4] hover:text-white hover:bg-[#242f3d] transition-all"
                    title="Record voice message"
                >
                    <Mic className="w-5 h-5" />
                </button>

                {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
            </div>
        );
    }

    /*
     * Recording UI.
     */
    return (
        <div className="flex items-center gap-3 bg-[#17212b] border border-[rgba(255,255,255,0.08)] rounded-2xl px-3 py-2 w-full">
            <button
                type="button"
                onClick={cancelRecording}
                className="p-2 rounded-full text-[#7f91a4] hover:text-white hover:bg-[#242f3d] transition-all"
                title="Cancel recording"
            >
                <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-red-400">
                <Mic className="w-5 h-5" />

                <span className="text-sm font-medium min-w-[42px]">{formatDuration(duration)}</span>
            </div>

            <div className="flex-1 h-10 flex items-center gap-[2px] overflow-hidden">
                {Array.from({
                    length: 50,
                }).map((_, index) => {
                    const sourceIndex = Math.floor((index / 50) * Math.max(waveform.length, 1));

                    const value = waveform[sourceIndex] ?? 0.08;

                    const height = Math.max(4, Math.round(value * 34));

                    return (
                        <span
                            key={index}
                            className="w-[3px] rounded-full bg-[#3fc5f0] transition-[height] duration-75"
                            style={{
                                height: `${height}px`,
                            }}
                        />
                    );
                })}
            </div>

            <button
                type="button"
                onClick={stopRecording}
                className="p-2.5 rounded-full bg-[#3fc5f0] text-white hover:opacity-90 transition-all"
                title="Send voice message"
            >
                <Send className="w-5 h-5" />
            </button>

            {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
    );
};
