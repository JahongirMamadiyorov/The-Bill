import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

/**
 * Custom date picker to replace native <input type="date">.
 *
 * Props:
 *   value      – 'YYYY-MM-DD' string or ''
 *   onChange    – (dateStr) => void   — always 'YYYY-MM-DD' or ''
 *   placeholder – text when empty (default 'Pick a date')
 *   className   – extra wrapper classes
 *   size        – 'sm' | 'md' (default 'md')
 *   label       – optional label above (not rendered if omitted)
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function pad(n) { return String(n).padStart(2, '0'); }

function parseVal(v) {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function toStr(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function DatePicker({ value, onChange, placeholder, className = '', size = 'md' }) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('placeholders.pickDate', 'Pick a date');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, openUp: false });

  const parsed = parseVal(value);
  const today = new Date();
  const [viewYear, setViewYear]   = useState(parsed?.year  ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());

  // Sync view when value changes externally
  useEffect(() => {
    const p = parseVal(value);
    if (p) { setViewYear(p.year); setViewMonth(p.month); }
  }, [value]);

  // Position the portal panel relative to the trigger button
  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const panelHeight = 340;
    const panelWidth = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    // Clamp left so panel doesn't go off-screen right
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
    if (left < 8) left = 8;
    setPanelPos({
      top: shouldOpenUp ? rect.top - panelHeight - 4 : rect.bottom + 4,
      left,
      openUp: shouldOpenUp,
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-datepicker-portal]')) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Calendar math
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const startOffset = (firstDayOfMonth + 6) % 7; // shift so Monday=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day) => {
    onChange(toStr(viewYear, viewMonth, day));
    setOpen(false);
  };

  const clearDate = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const isToday = (day) => {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  };
  const isSelected = (day) => {
    return parsed && parsed.year === viewYear && parsed.month === viewMonth && parsed.day === day;
  };

  const displayValue = parsed
    ? `${pad(parsed.day)}/${pad(parsed.month + 1)}/${parsed.year}`
    : '';

  const pad2 = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm';

  // Build grid cells
  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, type: 'prev' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, type: 'current' });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, type: 'next' });
  }

  const calendarPanel = open ? createPortal(
    <div
      data-datepicker-portal
      className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl p-3 w-[280px]"
      style={{ top: panelPos.top, left: panelPos.left }}
    >
      {/* Header: month/year nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-gray-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (cell.type !== 'current') {
            return (
              <div key={i} className="w-9 h-9 flex items-center justify-center text-xs text-gray-300">
                {cell.day}
              </div>
            );
          }
          const sel = isSelected(cell.day);
          const tod = isToday(cell.day);
          return (
            <button
              key={i}
              type="button"
              onClick={() => selectDay(cell.day)}
              className={`w-9 h-9 flex items-center justify-center text-xs font-medium rounded-lg transition-colors
                ${sel
                  ? 'bg-blue-600 text-white font-bold'
                  : tod
                    ? 'bg-blue-50 text-blue-600 font-bold hover:bg-blue-100'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600 font-medium">Clear</button>
        <button type="button" onClick={() => { onChange(toStr(today.getFullYear(), today.getMonth(), today.getDate())); setOpen(false); }}
          className="text-xs text-blue-600 hover:text-blue-700 font-semibold">Today</button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 w-full border border-gray-200 rounded-xl bg-white font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer ${pad2} ${open ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
      >
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 text-left whitespace-nowrap ${!displayValue ? 'text-gray-400' : ''}`}>
          {displayValue || effectivePlaceholder}
        </span>
        {displayValue && (
          <span onClick={clearDate} className="text-gray-300 hover:text-gray-500 text-xs font-bold ml-1 flex-shrink-0">&times;</span>
        )}
      </button>
      {calendarPanel}
    </div>
  );
}
