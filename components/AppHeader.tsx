import React from 'react';
import { Languages, ChevronDown, HelpCircle } from 'lucide-react';
import Button from './Button';
import type { Language, Translation } from '../i18n';

interface AppHeaderProps {
  t: Translation;
  lang: Language;
  onLangChange: (lang: Language) => void;
  onShowManual: () => void;
  showNewButton: boolean;
  onNew: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ t, lang, onLangChange, onShowManual, showNewButton, onNew }) => (
  <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 h-11 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-sm mono italic shadow-md shadow-blue-500/20">
          TVC
        </div>
        <h1 className="text-sm md:text-base font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
          {t.headerTitle} <span className="text-[10px] font-mono text-blue-500/80 ml-1">V{__APP_VERSION__}</span>
        </h1>
      </div>
      <div className="flex items-center space-x-3">
        <div className="relative flex items-center bg-slate-900 border border-slate-700/70 rounded-lg px-2 py-1 text-slate-200 hover:text-white transition-colors focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50 shadow-sm">
          <Languages size={14} className="text-blue-400 mr-1.5 flex-shrink-0" />
          <select
            value={lang}
            onChange={(e) => onLangChange(e.target.value as Language)}
            className="bg-slate-900 text-slate-200 font-bold text-[11px] font-mono uppercase focus:outline-none cursor-pointer pr-1 py-0.5 appearance-none"
            title={t.ttLanguage}
          >
            <option value="hu" className="bg-slate-900 text-slate-100 font-semibold">HU</option>
            <option value="en" className="bg-slate-900 text-slate-100 font-semibold">EN</option>
            <option value="pl" className="bg-slate-900 text-slate-100 font-semibold">PL</option>
            <option value="de" className="bg-slate-900 text-slate-100 font-semibold">DE</option>
            <option value="ru" className="bg-slate-900 text-slate-100 font-semibold">RU</option>
            <option value="uk" className="bg-slate-900 text-slate-100 font-semibold">UK</option>
            <option value="es" className="bg-slate-900 text-slate-100 font-semibold">ES</option>
            <option value="sk" className="bg-slate-900 text-slate-100 font-semibold">SK</option>
            <option value="ro" className="bg-slate-900 text-slate-100 font-semibold">RO</option>
          </select>
          <ChevronDown size={10} className="text-slate-400 pointer-events-none ml-0.5 flex-shrink-0" />
        </div>
        <button 
          onClick={onShowManual}
          className="p-1.5 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-1.5 text-xs font-mono border border-transparent hover:border-slate-700"
          title={t.ttManual}
        >
          <HelpCircle size={16} />
        </button>
        {showNewButton && (
          <Button onClick={onNew} variant="ghost" className="text-xs py-1 px-2.5" title={t.ttNew}>
            {t.new}
          </Button>
        )}
      </div>
    </div>
  </header>
);

export default AppHeader;
