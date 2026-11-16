import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Shield, ShieldCheck, X } from 'lucide-react';
import { User } from '../types/index';
import { ApiService } from '../services/api';

export type TwoFactorModalProps =
    | { mode: 'setup'; onClose: () => void; onSuccess: () => void }
    | {
          mode: 'challenge';
          challengeId: string;
          method?: 'totp' | 'backup';
          onClose: () => void;
          onSuccess: (user: User) => void;
      }
    | { mode: 'disable'; onClose: () => void; onSuccess: () => void }
    | { mode: 'backup-codes'; onClose: () => void; onSuccess: () => void };

const inputClass =
    'w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:ring-1 focus:ring-[#2f88ff] transition-all';
const codeInputClass = `${inputClass} font-mono tracking-[0.35em]`;
const primaryButtonClass =
    'w-full py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 font-bold text-white rounded-xl text-xs shadow-md transition-all disabled:opacity-50';

const errorMessage = (err: unknown, fallback: string): string =>
    err instanceof Error && err.message ? err.message : fallback;

interface ModalShellProps {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({ title, subtitle, onClose, children }) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-[#2b5278]/40 border border-[#2b5278]/60 text-[#3fc5f0] flex-shrink-0">
                        <Shield className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-white truncate">{title}</h2>
                        {subtitle && <p className="text-[11px] text-[#7f91a4]">{subtitle}</p>}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-xl text-[#7f91a4] hover:text-white hover:bg-[#202b36] transition-colors flex-shrink-0"
                    title="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="p-4 sm:p-6 max-h-[75vh] max-h-[75dvh] overflow-y-auto">{children}</div>
        </div>
    </div>
);

interface SetupViewProps {
    onClose: () => void;
    onSuccess: () => void;
}

const SetupView: React.FC<SetupViewProps> = ({ onClose, onSuccess }) => {
    const [setup, setSetup] = useState<{
        secret: string;
        qrCodeUri: string;
        qrCodeDataUrl: string;
        pending: boolean;
    } | null>(null);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [activated, setActivated] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        ApiService.enableTwoFactor()
            .then((res) => {
                if (!cancelled) setSetup(res);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(errorMessage(err, 'Could not start two-factor setup.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = code.trim();
        if (!/^\d{6}$/.test(value)) {
            setError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await ApiService.verifyTwoFactor(value);
            if (res.activated) {
                setActivated(true);
                return;
            }
            if (res.valid) {
                setError('Two-factor authentication is already active for this account.');
                return;
            }
            setError('That code was not accepted. Check your authenticator app and try again.');
        } catch (err: unknown) {
            setError(errorMessage(err, 'Could not verify the code.'));
        } finally {
            setSubmitting(false);
        }
    };

    if (activated) {
        return (
            <ModalShell title="Two-factor authentication" subtitle="Setup complete" onClose={onClose}>
                <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start space-x-2">
                        <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Two-factor authentication is now active for your account.</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs text-[#7f91a4] leading-relaxed">
                        <p className="font-bold text-white mb-1.5">Store your backup codes</p>
                        <p>
                            Open Settings → Security → Regenerate backup codes and save the codes somewhere
                            safe. Each code works once and lets you sign in when you lose your
                            authenticator app. The codes are shown only once.
                        </p>
                    </div>
                    <button type="button" onClick={onSuccess} className={primaryButtonClass}>
                        Done
                    </button>
                </div>
            </ModalShell>
        );
    }

    return (
        <ModalShell
            title="Set up two-factor authentication"
            subtitle="Scan the QR code with your authenticator app"
            onClose={onClose}
        >
            <div className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="py-6 text-center text-xs text-[#7f91a4]">
                        Preparing your secure key...
                    </div>
                )}

                {setup && (
                    <>
                        <div className="flex justify-center">
                            <img
                                src={setup.qrCodeDataUrl}
                                alt="Two-factor authentication QR code"
                                className="w-48 h-48 rounded-2xl bg-white p-2"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                                Setup key
                            </label>
                            <code className="block select-all break-all px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs font-mono">
                                {setup.secret}
                            </code>
                            <p className="text-[10px] text-[#7f91a4] mt-1.5 leading-relaxed">
                                Can&apos;t scan? Enter this key manually in your authenticator app.
                            </p>
                        </div>

                        <form onSubmit={handleConfirm} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                                    Verification Code
                                </label>
                                <div className="relative">
                                    <KeyRound className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        required
                                        autoFocus
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="123456"
                                        className={`${codeInputClass} pl-10`}
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={submitting} className={primaryButtonClass}>
                                {submitting ? 'Confirming...' : 'Confirm'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </ModalShell>
    );
};

interface ChallengeViewProps {
    challengeId: string;
    method?: 'totp' | 'backup';
    onClose: () => void;
    onSuccess: (user: User) => void;
}

const ChallengeView: React.FC<ChallengeViewProps> = ({ challengeId, method, onClose, onSuccess }) => {
    const [useBackup, setUseBackup] = useState(method === 'backup');
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = code.trim();
        if (useBackup) {
            if (!/^[A-Za-z0-9]{8}$/.test(value)) {
                setError('Backup codes are 8 letters or digits.');
                return;
            }
        } else if (!/^\d{6}$/.test(value)) {
            setError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await ApiService.completeTwoFactorChallenge(challengeId, value);
            onSuccess(res.user);
        } catch (err: unknown) {
            setError(errorMessage(err, 'Verification failed. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell title="Two-factor authentication" subtitle="Confirm it is you" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                        {useBackup ? 'Backup Code' : 'Verification Code'}
                    </label>
                    <div className="relative">
                        <KeyRound className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                        <input
                            type="text"
                            inputMode={useBackup ? 'text' : 'numeric'}
                            autoComplete={useBackup ? 'off' : 'one-time-code'}
                            maxLength={useBackup ? 8 : 6}
                            required
                            autoFocus
                            value={code}
                            onChange={(e) =>
                                setCode(
                                    useBackup
                                        ? e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
                                        : e.target.value.replace(/\D/g, '').slice(0, 6)
                                )
                            }
                            placeholder={useBackup ? 'ABCD1234' : '123456'}
                            className={`${codeInputClass} pl-10 ${useBackup ? 'tracking-[0.2em]' : ''}`}
                        />
                    </div>
                </div>

                <button type="submit" disabled={submitting} className={primaryButtonClass}>
                    {submitting ? 'Verifying...' : 'Verify'}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setUseBackup((prev) => !prev);
                        setCode('');
                        setError(null);
                    }}
                    className="w-full text-[11px] font-medium text-[#3fc5f0] hover:text-[#7fd8f7] transition-colors"
                >
                    {useBackup ? 'Use your authenticator app instead' : 'Use a backup code instead'}
                </button>
            </form>
        </ModalShell>
    );
};

interface DisableViewProps {
    onClose: () => void;
    onSuccess: () => void;
}

const DisableView: React.FC<DisableViewProps> = ({ onClose, onSuccess }) => {
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = code.trim();
        if (!/^\d{6}$/.test(value) && !/^[A-Za-z0-9]{8}$/.test(value)) {
            setError('Enter a 6-digit code or one of your backup codes.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await ApiService.disableTwoFactor(value);
            onSuccess();
        } catch (err: unknown) {
            setError(errorMessage(err, 'Could not disable two-factor authentication.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell
            title="Disable two-factor authentication"
            subtitle="Confirm with a code to remove the second factor"
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-[#ff9a9a] leading-relaxed">
                    Your account will be protected by your password only after this step.
                </div>

                <div>
                    <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                        Verification Code
                    </label>
                    <div className="relative">
                        <KeyRound className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            required
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase())}
                            placeholder="123456"
                            className={`${codeInputClass} pl-10`}
                        />
                    </div>
                    <p className="text-[10px] text-[#7f91a4] mt-1.5">A 6-digit authenticator code or one of your backup codes.</p>
                </div>

                <button type="submit" disabled={submitting} className={primaryButtonClass}>
                    {submitting ? 'Disabling...' : 'Confirm'}
                </button>
            </form>
        </ModalShell>
    );
};

interface BackupCodesViewProps {
    onClose: () => void;
    onSuccess: () => void;
}

const BackupCodesView: React.FC<BackupCodesViewProps> = ({ onClose, onSuccess }) => {
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState<string[] | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = code.trim();
        if (!/^\d{6}$/.test(value)) {
            setError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await ApiService.regenerateBackupCodes(value);
            setCodes(res.backupCodes || []);
        } catch (err: unknown) {
            setError(errorMessage(err, 'Could not generate backup codes.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopy = async () => {
        if (!codes) return;
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Copy failed. Select the codes and copy them manually.');
        }
    };

    if (codes) {
        return (
            <ModalShell title="Backup codes" subtitle="Shown only once" onClose={onClose}>
                <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start space-x-2 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                            These codes are shown only once. Save them now — they are the only way back
                            into your account if you lose your authenticator app.
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {codes.map((backupCode) => (
                            <code
                                key={backupCode}
                                className="px-3 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-center text-white text-xs font-mono tracking-[0.15em] select-all"
                            >
                                {backupCode}
                            </code>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex-1 py-2.5 bg-[#2b5278] hover:bg-[#34618f] font-bold text-white rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy all codes</span>
                                </>
                            )}
                        </button>
                        <button type="button" onClick={onSuccess} className={primaryButtonClass}>
                            Done
                        </button>
                    </div>
                </div>
            </ModalShell>
        );
    }

    return (
        <ModalShell
            title="Regenerate backup codes"
            subtitle="Confirm with your authenticator code"
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                        Verification Code
                    </label>
                    <div className="relative">
                        <KeyRound className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            className={`${codeInputClass} pl-10`}
                        />
                    </div>
                    <p className="text-[10px] text-[#7f91a4] mt-1.5">
                        Generating new codes invalidates your previous backup codes.
                    </p>
                </div>

                <button type="submit" disabled={submitting} className={primaryButtonClass}>
                    {submitting ? 'Generating...' : 'Generate codes'}
                </button>
            </form>
        </ModalShell>
    );
};

export const TwoFactorModal: React.FC<TwoFactorModalProps> = (props) => {
    switch (props.mode) {
        case 'setup':
            return <SetupView onClose={props.onClose} onSuccess={props.onSuccess} />;
        case 'challenge':
            return (
                <ChallengeView
                    challengeId={props.challengeId}
                    method={props.method}
                    onClose={props.onClose}
                    onSuccess={props.onSuccess}
                />
            );
        case 'disable':
            return <DisableView onClose={props.onClose} onSuccess={props.onSuccess} />;
        case 'backup-codes':
            return <BackupCodesView onClose={props.onClose} onSuccess={props.onSuccess} />;
        default:
            return null;
    }
};
