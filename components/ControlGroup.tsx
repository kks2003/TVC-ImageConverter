import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const ControlGroup: React.FC<{ 
  title: string, 
  icon: React.ReactNode, 
  children: React.ReactNode, 
  extra?: React.ReactNode,
  collapsed?: boolean,
  onToggle?: () => void,
  contentClassName?: string,
  className?: string
}> = ({ title, icon, children, extra, collapsed, onToggle, contentClassName, className }) => (
  <div className={className || "space-y-4"}>
    <div 
      className={`flex items-center justify-between border-b border-slate-800 pb-2 ${onToggle ? 'cursor-pointer hover:bg-slate-800/50 rounded px-1 transition-colors' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center space-x-2 text-slate-100">
        {icon}
        <h4 className="text-xs font-bold uppercase tracking-wider">{title}</h4>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {onToggle && (
          <div className="text-slate-500">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        )}
      </div>
    </div>
    {!collapsed && (
      <div className={`px-1 animate-in slide-in-from-top-2 duration-200 ${contentClassName || 'space-y-4'}`}>
        {children}
      </div>
    )}
  </div>
);

export default ControlGroup;
