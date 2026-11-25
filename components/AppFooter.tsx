import React from 'react';
import { Facebook } from 'lucide-react';
import type { Translation } from '../i18n';

const AppFooter: React.FC<{ t: Translation }> = ({ t }) => (
  <footer className="mt-auto border-t border-slate-800/60 py-8 bg-slate-900/30">
    <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-center gap-8 text-slate-500 text-xs font-mono">
      <a href="http://tvc.homeserver.hu" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
        tvc.homeserver.hu
      </a>
      <a href="https://www.facebook.com/groups/videotontvcomputer" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-2">
        <Facebook size={14} className="text-blue-500" />
        {t.facebookGroup}
      </a>
    </div>
  </footer>
);

export default AppFooter;
