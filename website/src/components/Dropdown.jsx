import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Custom dropdown to replace native <select> elements.
 *
 * Props:
 *   value       – current selected value
 *   onChange     – (value) => void
 *   options      – [{ value, label }] or ['string', ...]
 *   placeholder  – shown when value is empty (optional)
 *   className    – extra wrapper classes (optional)
 *   icon         – Lucide icon component shown before label (optional)
 *   size         – 'sm' | 'md' (default 'md')
 */
export default function Dropdown({ value, onChange, options = [], placeholder, className = '', icon: Icon, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  // Normalize options to { value, label }
  const normalized = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selected = normalized.find(o => String(o.value) === String(value));
  const displayLabel = selected?.label || placeholder || 'Select...';

  // Determine if panel should open upward
  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const panelHeight = 280; // approximate dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUp(spaceBelow < panelHeight && spaceAbove > spaceBelow);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const pad = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm';
  const itemPad = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 w-full border border-gray-200 rounded-xl bg-white font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer ${pad} ${open ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
      >
        {Icon && <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <span className={`flex-1 text-left truncate ${!selected ? 'text-gray-400' : ''}`}>{displayLabel}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className={`absolute z-50 w-full min-w-[160px] bg-white rounded-xl border border-gray-200 shadow-lg shadow-gray-200/50 overflow-hidden ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
          <div className="max-h-64 overflow-y-auto py-1">
            {normalized.map((opt) => {
              const isActive = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`flex items-center gap-2.5 w-full text-left transition-colors ${itemPad} ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50 font-medium'
                  }`}
                >
                  <span className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${isActive ? '' : 'opacity-0'}`}>
                    <Check className="w-3.5 h-3.5 text-blue-600" />
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
