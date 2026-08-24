import React, { useState } from 'react';
import { BarChart2, Check, HelpCircle, EyeOff, Sparkles } from 'lucide-react';
import { Poll } from '../types/index';
import { ApiService } from '../services/api';

interface PollCardProps {
  poll: Poll;
  currentUserId: string;
}

export const PollCard: React.FC<PollCardProps> = ({ poll: initialPoll, currentUserId }) => {
  const [poll, setPoll] = useState<Poll>(initialPoll);
  const [voting, setVoting] = useState(false);

  const hasVoted = poll.options.some((opt) => opt.voter_ids.includes(currentUserId));
  const userVotedOptionId = poll.options.find((opt) => opt.voter_ids.includes(currentUserId))?.id;

  const handleVote = async (optionId: string) => {
    if (voting || poll.closed) return;
    setVoting(true);
    try {
      const res = await ApiService.votePoll(poll.id, optionId);
      if (res.poll) {
        setPoll(res.poll);
      }
    } catch (err) {
      console.error('Failed to vote on poll:', err);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="my-2 p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.08)] max-w-md w-full space-y-3 shadow-md">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-1.5 text-[10px] text-[#7f91a4] font-semibold uppercase tracking-wider mb-1">
          <BarChart2 className="w-3.5 h-3.5 text-[#3fc5f0]" />
          <span>{poll.is_quiz ? '🧠 Community Quiz' : '📊 Anonymous Poll'}</span>
          {poll.is_anonymous && (
            <span className="inline-flex items-center space-x-0.5 text-[#7f91a4]">
              <EyeOff className="w-3 h-3" />
            </span>
          )}
        </div>
        <h4 className="text-sm font-bold text-white leading-snug">{poll.question}</h4>
      </div>

      {/* Options List */}
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const isSelected = opt.id === userVotedOptionId;
          const percentage = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0;
          const isCorrect = poll.is_quiz && opt.id === poll.correct_option_id;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleVote(opt.id)}
              disabled={voting}
              className={`w-full p-2.5 rounded-xl text-left relative overflow-hidden border transition-all ${
                isSelected
                  ? 'border-[#2f88ff] bg-[#2f88ff]/15 shadow-sm'
                  : 'border-[rgba(255,255,255,0.06)] bg-[#17212b] hover:bg-[#1f2d3d]'
              }`}
            >
              {/* Progress Percentage Bar */}
              {hasVoted && (
                <div
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-500 opacity-25 ${
                    isCorrect ? 'bg-emerald-500' : isSelected ? 'bg-[#2f88ff]' : 'bg-white/20'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${
                      isSelected
                        ? 'bg-[#2f88ff] border-[#2f88ff] text-white'
                        : 'border-white/30 text-transparent'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                  <span className="text-xs font-semibold text-white/95">{opt.text}</span>
                </div>

                {hasVoted && (
                  <span className="text-xs font-mono font-bold text-[#7f91a4] ml-2">
                    {percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Explanation if Quiz */}
      {hasVoted && poll.is_quiz && poll.explanation && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
          <div className="font-bold flex items-center space-x-1 mb-0.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explanation:</span>
          </div>
          <p className="leading-relaxed">{poll.explanation}</p>
        </div>
      )}

      {/* Footer Meta */}
      <div className="flex items-center justify-between text-[11px] text-[#7f91a4] pt-1">
        <span>{poll.total_votes === 1 ? '1 vote' : `${poll.total_votes} votes`}</span>
        <span>{hasVoted ? 'Vote recorded ✓' : 'Click to vote'}</span>
      </div>
    </div>
  );
};
