import React, { useState } from 'react';
import { BarChart3, Plus, Trash2, X, Check, HelpCircle, EyeOff } from 'lucide-react';
import { ApiService } from '../services/api';
import { Message } from '../types/index';

interface CreatePollModalProps {
  chatId: string;
  onClose: () => void;
  onPollCreated: (message: Message) => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({ chatId, onClose, onPollCreated }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctOptionIdx, setCorrectOptionIdx] = useState<number>(0);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddOption = () => {
    if (options.length < 8) {
      setOptions([...options, '']);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || validOptions.length < 2) return;

    setLoading(true);
    try {
      const res = await ApiService.createPoll({
        chatId,
        question: question.trim(),
        options: validOptions,
        isAnonymous,
        isQuiz,
        correctOptionId: isQuiz ? `opt_${correctOptionIdx}` : undefined,
        explanation: isQuiz ? explanation.trim() : undefined,
      });

      onPollCreated(res.message);
      onClose();
    } catch (err) {
      console.error('Failed to create poll:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#2f88ff]/15 border border-[#2f88ff]/30 text-[#3fc5f0]">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">New Poll or Quiz</h3>
              <p className="text-[11px] text-[#7f91a4]">Interactive community voting</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Question */}
          <div>
            <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
              Question
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
              Poll Options
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  {isQuiz && (
                    <button
                      type="button"
                      onClick={() => setCorrectOptionIdx(idx)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                        correctOptionIdx === idx
                          ? 'bg-emerald-500 border-emerald-400 text-white'
                          : 'border-white/20 text-transparent hover:border-emerald-500'
                      }`}
                      title="Set as correct answer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
                  />

                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-[#7f91a4] hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 8 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2 text-xs font-semibold text-[#3fc5f0] hover:underline flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add an Option</span>
              </button>
            )}
          </div>

          {/* Settings / Toggles */}
          <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Anonymous Voting</div>
                <div className="text-[10px] text-[#7f91a4]">Hide voter identities from results</div>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 accent-[#2f88ff]"
              />
            </div>

            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Quiz Mode</div>
                <div className="text-[10px] text-[#7f91a4]">Has one correct answer with explanation</div>
              </div>
              <input
                type="checkbox"
                checked={isQuiz}
                onChange={(e) => setIsQuiz(e.target.checked)}
                className="w-4 h-4 accent-[#2f88ff]"
              />
            </div>

            {isQuiz && (
              <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] space-y-1">
                <label className="text-[11px] font-semibold text-[#7f91a4]">Explanation (Shown after voting)</label>
                <input
                  type="text"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain why this answer is correct..."
                  className="w-full px-3 py-1.5 bg-[#17212b] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-[#2f88ff]/25 transition-all"
          >
            {loading ? 'Publishing...' : 'Create Poll'}
          </button>
        </form>
      </div>
    </div>
  );
};
