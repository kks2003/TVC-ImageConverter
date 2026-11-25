import React from 'react';
import { Wand2 } from 'lucide-react';
import type { Translation } from '../i18n';

const AutoTuneModal: React.FC<{ t: Translation; progress: number; onCancel: () => void }> = ({ t, progress, onCancel }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
      <Wand2 className="w-12 h-12 text-blue-500 mb-4 animate-pulse" />
      <h3 className="text-xl font-bold text-white mb-2">{t.autoTuningTitle}</h3>
      <p className="text-slate-400 text-sm mb-6">{t.autoTuningDesc}</p>
      
      <div className="w-full bg-slate-800 rounded-full h-2 mb-6 overflow-hidden">
        <div 
          className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        ></div>
      </div>
      
      <button 
        onClick={onCancel}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors border border-slate-700"
        title={t.ttCancelAutoTune}
      >
        {t.cancelAutoTune}
      </button>
    </div>
  </div>
);

export default AutoTuneModal;
