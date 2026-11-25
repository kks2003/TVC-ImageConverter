import React from 'react';
import { Plus, Minus } from 'lucide-react';

const Slider: React.FC<{ 
  label: string, value: number, min: number, max: number, step: number, 
  onChange: (val: number) => void, icon?: React.ReactNode, disabled?: boolean,
  suffix?: string,
  titles?: { increase: string, decrease: string }
}> = ({ label, value, min, max, step, onChange, icon, disabled, suffix, titles }) => {
  const precision = step.toString().split('.')[1]?.length || 0;
  const { increase, decrease } = titles || { increase: 'Increase', decrease: 'Decrease' };

  const updateValue = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    onChange(parseFloat(next.toFixed(precision)));
  };

  const displayValue = label.includes('Zoom') || label.includes('Nagyítás') || label.includes('Nagyít') || label.includes('Nagyt')
    ? `${(value * 100).toFixed(0)}%` 
    : (suffix ? `${value.toFixed(0)}${suffix}` : value);

  return (
    <div className={`grid grid-cols-[82px_1fr_72px] gap-2 items-center py-0.5 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex items-center space-x-1 shrink-0 text-[10px] min-w-0">
        <span className="text-slate-400 shrink-0">{icon}</span>
        <span className="text-slate-300 truncate select-none" title={label}>{label}</span>
      </div>
      
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all disabled:cursor-not-allowed min-w-0"
      />
      
      <div className="flex items-center justify-end space-x-0.5 shrink-0">
        <button 
          onClick={() => updateValue(-step)}
          className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          title={decrease}
        >
          <Minus size={8} />
        </button>
        <span className="mono text-blue-400 font-bold text-[9px] w-7 text-center bg-slate-900/85 py-0.5 rounded border border-slate-800/80 shrink-0 tabular-nums">
          {displayValue}
        </span>
        <button 
          onClick={() => updateValue(step)}
          className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          title={increase}
        >
          <Plus size={8} />
        </button>
      </div>
    </div>
  );
};

export default Slider;
