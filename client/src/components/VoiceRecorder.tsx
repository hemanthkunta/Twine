import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, X } from 'lucide-react';

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

    // Original physical microphone stream.
    const streamRef = useRef<MediaStream | null>(null);

    // Processed stream coming from Web Audio.
    const processedStreamRef = useRef<MediaStream | null>(null);

    const chunksRef = useRef<Blob[]>([]);
    const startTimeRef = useRef(0);
    const timerRef = useRef<number | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const compressorRef = useRef<DynamicsCompressorNode | null>(null);
    const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    const animationRef = useRef<number | null>(null);

    const waveformRef = useRef<number[]>([]);
    const lastWaveformUpdateRef = useRef(0);

    const cleanup = () => {
        // Stop timer.
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Stop waveform animation.
        if (animationRef.current !== null) {
            window.cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        // Stop processed output tracks.
        if (processedStreamRef.current) {
            processedStreamRef.current.getTracks().forEach((track) => {
                try {
                    track.stop();
                } catch {
                    // Ignore already stopped tracks.
                }
            });

            processedStreamRef.current = null;
        }

        // Stop physical microphone.
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
                try {
                    track.stop();
                } catch {
                    // Ignore already stopped tracks.
                }
            });

            streamRef.current = null;
        }

        // Close Web Audio graph.
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        gainNodeRef.current = null;
        compressorRef.current = null;
        destinationRef.current = null;
        mediaRecorderRef.current = null;
    };

    const updateWaveform = (timestamp = performance.now()) => {
        const analyser = analyserRef.current;

        if (!analyser) {
            return;
        }

        const data = new Uint8Array(analyser.fftSize);

        analyser.getByteTimeDomainData(data);

        let sum = 0;

        for (let i = 0; i < data.length; i++) {
            const value = data[i] - 128;
            sum += value * value;
        }

        const rms = Math.sqrt(sum / data.length);

        /*
         * The signal has already passed through the gain +
         * compressor, so this represents the actual recorded level.
         */
        const level = Math.max(0.05, Math.min(1, rms / 28));

        waveformRef.current.push(level);

        // Keep latest 48 samples.
        if (waveformRef.current.length > 48) {
            waveformRef.current.splice(0, waveformRef.current.length - 48);
        }

        // Limit React updates to ~20 FPS.
        if (timestamp - lastWaveformUpdateRef.current >= 50) {
            lastWaveformUpdateRef.current = timestamp;

            setWaveform([...waveformRef.current]);
        }

        animationRef.current = window.requestAnimationFrame(updateWaveform);
    };

    const startRecording = async () => {
        try {
            setError(null);
            setDuration(0);
            setWaveform([]);

            waveformRef.current = [];
            lastWaveformUpdateRef.current = 0;

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Microphone access is not supported by this browser.');
            }

            const mimeType = getSupportedMimeType();

            if (!mimeType) {
                throw new Error('This browser does not support WebM/Opus recording.');
            }

            console.log('[VOICE] Selected MIME:', mimeType);

            /*
             * Request the microphone.
             *
             * We keep browser processing enabled because Chrome's
             * echo cancellation / noise suppression / AGC are useful
             * for normal laptop microphones.
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

            const track = stream.getAudioTracks()[0];

            if (track) {
                console.log('[VOICE] Microphone settings:', track.getSettings());
            }

            /*
             * ---------------------------------------------------------
             * WEB AUDIO PROCESSING
             * ---------------------------------------------------------
             */

            const AudioContextClass =
                window.AudioContext ||
                (
                    window as typeof window & {
                        webkitAudioContext?: typeof AudioContext;
                    }
                ).webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error('Web Audio API is not supported by this browser.');
            }

            const audioContext = new AudioContextClass();

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            audioContextRef.current = audioContext;

            /*
             * Microphone source.
             */
            const source = audioContext.createMediaStreamSource(stream);

            /*
             * ---------------------------------------------------------
             * GAIN
             * ---------------------------------------------------------
             *
             * 2.0 = approximately +6 dB
             * 2.5 = approximately +8 dB
             * 3.0 = approximately +9.5 dB
             *
             * Start at 2.5.
             */
            const gainNode = audioContext.createGain();

            gainNode.gain.value = 1.0;

            gainNodeRef.current = gainNode;

            /*
             * ---------------------------------------------------------
             * COMPRESSOR
             * ---------------------------------------------------------
             *
             * Prevents the amplified voice from becoming badly clipped.
             */
            const compressor = audioContext.createDynamicsCompressor();

            compressor.threshold.value = -24;
            compressor.knee.value = 18;
            compressor.ratio.value = 3;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            compressorRef.current = compressor;

            /*
             * ---------------------------------------------------------
             * ANALYSER
             * ---------------------------------------------------------
             *
             * This receives the processed audio so the waveform
             * represents the amplified recording signal.
             */
            const analyser = audioContext.createAnalyser();

            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.65;

            analyserRef.current = analyser;

            /*
             * ---------------------------------------------------------
             * MEDIA STREAM DESTINATION
             * ---------------------------------------------------------
             *
             * This is the important part.
             *
             * MediaRecorder will record THIS processed stream,
             * not the original microphone stream.
             */
            const destination = audioContext.createMediaStreamDestination();

            destinationRef.current = destination;

            /*
             * Audio graph:
             *
             * microphone
             *      ↓
             * gain
             *      ↓
             * compressor
             *      ↓
             * analyser
             *      ↓
             * destination
             */
            source.connect(gainNode);
            gainNode.connect(compressor);
            compressor.connect(analyser);
            analyser.connect(destination);

            processedStreamRef.current = destination.stream;

            /*
             * ---------------------------------------------------------
             * MEDIA RECORDER
             * ---------------------------------------------------------
             *
             * IMPORTANT:
             * Use processedStreamRef.current instead of stream.
             */
            const recorder = new MediaRecorder(destination.stream, {
                mimeType,
                audioBitsPerSecond: 128000,
            });

            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onerror = (event) => {
                console.error('[VOICE] MediaRecorder error:', event);

                setError('Recording failed. Please try again.');

                cleanup();
                setIsRecording(false);
            };

            recorder.onstop = () => {
                const finalDuration = Math.max(
                    1,
                    Math.round((Date.now() - startTimeRef.current) / 1000)
                );

                try {
                    const actualMimeType = recorder.mimeType || mimeType;

                    const blob = new Blob(chunksRef.current, {
                        type: actualMimeType,
                    });

                    if (!blob.size) {
                        throw new Error('The recorded audio is empty.');
                    }

                    const finalWaveform =
                        waveformRef.current.length > 0 ? [...waveformRef.current] : [0.25];

                    console.log('[VOICE] Recording created:', {
                        mimeType: actualMimeType,
                        size: blob.size,
                        duration: finalDuration,
                        waveformSamples: finalWaveform.length,
                    });

                    const reader = new FileReader();

                    reader.onloadend = () => {
                        const result = reader.result;

                        if (typeof result !== 'string') {
                            setError('Could not convert audio recording.');

                            cleanup();
                            setIsRecording(false);
                            return;
                        }

                        onRecordingComplete(result, actualMimeType, finalDuration, finalWaveform);

                        cleanup();
                        setIsRecording(false);
                    };

                    reader.onerror = () => {
                        setError('Could not read the audio recording.');

                        cleanup();
                        setIsRecording(false);
                    };

                    reader.readAsDataURL(blob);
                } catch (err) {
                    console.error('[VOICE] Failed to process recording:', err);

                    setError(err instanceof Error ? err.message : 'Failed to process recording.');

                    cleanup();
                    setIsRecording(false);
                }
            };

            /*
             * Start waveform animation.
             */
            updateWaveform();

            startTimeRef.current = Date.now();

            /*
             * Collect one chunk every second.
             */
            recorder.start(1000);

            setIsRecording(true);

            timerRef.current = window.setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 250);

            console.log('[VOICE] Recording started with amplified microphone signal');
        } catch (err) {
            console.error('[VOICE] Unable to start recording:', err);

            setError(err instanceof Error ? err.message : 'Unable to access microphone.');

            cleanup();
            setIsRecording(false);
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;

        if (!recorder) {
            return;
        }

        if (recorder.state !== 'inactive') {
            recorder.stop();
        }
    };

    const cancelRecording = () => {
        cleanup();

        chunksRef.current = [];
        waveformRef.current = [];

        setIsRecording(false);
        setDuration(0);
        setWaveform([]);

        onCancel();
    };

    useEffect(() => {
        startRecording();

        return () => {
            cleanup();
        };
    }, []);

    return (
        <div className="flex items-center gap-3 bg-[#17212b] border border-white/10 rounded-2xl p-2 shadow-lg w-full">
            {/* Cancel */}
            <button
                type="button"
                onClick={cancelRecording}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
                title="Cancel recording"
            >
                <X className="w-5 h-5" />
            </button>

            {/* Recording indicator */}
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <Mic className="w-4 h-4 text-red-400" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-red-400 font-medium">Recording</span>

                    <span className="text-xs text-white/60 font-mono">
                        {Math.floor(duration / 60)
                            .toString()
                            .padStart(2, '0')}
                        :{(duration % 60).toString().padStart(2, '0')}
                    </span>
                </div>

                {/* Live waveform */}
                <div className="flex items-center gap-[2px] h-8 overflow-hidden">
                    {(waveform.length ? waveform : [0.12, 0.18, 0.25, 0.18, 0.12]).map(
                        (level, index) => (
                            <span
                                key={index}
                                className="w-[3px] rounded-full bg-[#3fc5f0]"
                                style={{
                                    height: `${Math.max(4, Math.min(28, level * 30))}px`,
                                    opacity: 0.45 + level * 0.55,
                                }}
                            />
                        )
                    )}
                </div>

                {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
            </div>

            {/* Send */}
            <button
                type="button"
                onClick={stopRecording}
                disabled={!isRecording}
                className="w-11 h-11 rounded-full bg-[#3fc5f0] text-black flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-50"
                title="Send voice note"
            >
                <Send className="w-5 h-5" />
            </button>
        </div>
    );
};
