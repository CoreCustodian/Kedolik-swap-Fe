import React from 'react';
import { getExplorerUrl } from '../config/addresses';

interface TransactionModalProps {
  isOpen: boolean;
  status: 'pending' | 'success' | 'error';
  message: string;
  txSignature?: string;
  onClose: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  status,
  message,
  txSignature,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-dark-800 rounded-2xl border border-white/20 p-6 sm:p-8 max-w-md w-full shadow-2xl animate-scale-in">
        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {status === 'pending' && (
            <div className="relative">
              <div className="w-20 h-20 border-4 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center animate-bounce-once">
              <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          {status === 'error' && (
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center animate-shake">
              <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Status Title */}
        <h3 className="text-xl sm:text-2xl font-bold text-center mb-3">
          {status === 'pending' && 'Processing Transaction'}
          {status === 'success' && 'Transaction Successful!'}
          {status === 'error' && 'Transaction Failed'}
        </h3>

        {/* Message */}
        <p className="text-gray-300 text-center mb-6 text-sm sm:text-base">{message}</p>

        {/* Transaction Link */}
        {txSignature && (
          <div className="bg-dark-900/50 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-400 mb-2">Transaction Signature:</p>
            <p className="text-xs font-mono text-brand-cyan break-all mb-3">{txSignature}</p>
            <a
              href={getExplorerUrl(txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 text-sm text-brand-pink hover:text-brand-cyan transition-colors"
            >
              <span>View on Explorer</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Close Button (only for success/error) */}
        {status !== 'pending' && (
          <button
            onClick={onClose}
            className="w-full bg-gradient-brand py-3 rounded-lg font-semibold hover:brightness-110 transition-all"
          >
            Close
          </button>
        )}

        {/* Pending State Info */}
        {status === 'pending' && (
          <p className="text-xs text-gray-400 text-center">Please confirm the transaction in your wallet...</p>
        )}
      </div>
    </div>
  );
};

