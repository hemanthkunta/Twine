import React, { useState, useEffect } from 'react';
import { Search, X, MessageSquare, Sparkles, Zap, BrainCircuit, Check } from 'lucide-react';
import { Message } from '../types/index';
import { ApiService } from '../services/api';

interface GlobalSearchModalProps {
  onClose: () => void;
  onSelectResult: (chatId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ onClose, onSelectResult }) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keyword' | 'semantic'>('semantic');
  const [results, setResults] = useState<{ message: Message; score?: number; matchReason?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      if (mode === 'semantic') {
        ApiService.semanticSearch(query)
          .then((res) => setResults(res.results))
          .catch((err) => console.error(err))
          .finally(() => setLoading(false));
      } else {
        ApiService.searchMessages(query)
          .then((res) => setResults(res.messages.map((m) => ({ message: m }))))
          .catch((err) => console.error(err))
          .finally(() => setLoading(false));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Search Header */}
        <div className="p-4 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center space-x-3">
          {mode === 'semantic' ? (
            <Sparkles className="w-5 h-5 text-[#3fc5f0] animate-pulse flex-shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-[#7f91a4] flex-shrink-0" />
          )}

          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'semantic'
                ? 'Ask or search conceptually (e.g. "where we discussed the deploy issue")...'
                : 'Search exact words...'
            }
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-[#5e6d7d]"
          />

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Pill Bar */}
        <div className="flex bg-[#121c27] px-4 py-2 border-b border-[rgba(255,255,255,0.04)] items-center justify-between text-xs">
          <div className="flex space-x-2">
            <button
              onClick={() => setMode('semantic')}
              className={`px-3 py-1 rounded-xl font-semibold flex items-center space-x-1.5 transition-all ${
                mode === 'semantic'
                  ? 'bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] text-white shadow-md'
                  : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>✨ AI Semantic Search</span>
            </button>

            <button
              onClick={() => setMode('keyword')}
              className={`px-3 py-1 rounded-xl font-semibold flex items-center space-x-1.5 transition-all ${
                mode === 'keyword'
                  ? 'bg-[#2b5278] text-white shadow-md'
                  : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Exact Keyword</span>
            </button>
          </div>

          <span className="text-[10px] text-[#7f91a4]">
            {mode === 'semantic' ? 'Conceptual Intent Engine' : 'Substring Match'}
          </span>
        </div>

        {/* Results Stream */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-2 divide-y divide-[rgba(255,255,255,0.03)]">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#7f91a4] flex flex-col items-center space-y-2">
              <span className="animate-spin text-lg">✨</span>
              <span>Evaluating semantic vector search...</span>
            </div>
          ) : query && results.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7f91a4]">
              No messages found matching "{query}"
            </div>
          ) : !query ? (
            <div className="py-10 text-center text-xs text-[#7f91a4] space-y-1">
              <p className="font-semibold text-white/80">Semantic Vector Search Active</p>
              <p>Type any topic or concept to find messages by meaning.</p>
            </div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.message.id || idx}
                onClick={() => {
                  onSelectResult(item.message.chat_id);
                  onClose();
                }}
                className="p-3 rounded-2xl hover:bg-[#1e2a38] cursor-pointer transition-colors pt-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[#3fc5f0]">
                      {item.message.sender?.display_name || 'User'}
                    </span>
                    {item.score && (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                        {Math.round(item.score * 100)}% match
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#7f91a4]">
                    {new Date(item.message.created_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <p className="text-xs text-white/90 line-clamp-2 leading-relaxed">
                  {item.message.content_text}
                </p>

                {item.matchReason && (
                  <div className="mt-1 text-[10px] text-purple-300 font-mono">
                    💡 {item.matchReason}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
