import React from 'react';
import Markdown from 'react-markdown';
import { X } from 'lucide-react';
import type { Language, Translation } from '../i18n';
import huManual from '../USER_MANUAL_HU.md?raw';
import enManual from '../USER_MANUAL_EN.md?raw';

const ManualModal: React.FC<{ t: Translation; lang: Language; onClose: () => void }> = ({ t, lang, onClose }) => (
  <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
    <div className="relative bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col max-w-4xl w-full max-h-[95vh] overflow-hidden">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-white shadow-xl transition-all z-10"
        title={t.ttClosePreview}
      >
        <X size={20} />
      </button>
      <div className="overflow-y-auto custom-scrollbar pr-4 pb-4 prose prose-invert prose-slate max-w-none">
        <Markdown>{lang === 'hu' ? huManual : enManual}</Markdown>
      </div>
    </div>
  </div>
);

export default ManualModal;
