/**
 * Reusable Uzbek phone input with +998 country code prefix.
 *
 * Props:
 *   value    – full phone string (e.g. "+998 90 123 45 67" or raw digits)
 *   onChange – called with formatted string "+998 XX XXX XX XX"
 *   label    – optional label text (default: "Phone Number")
 *   className – extra classes on the wrapper div
 *   disabled – disable the input
 *   size     – "sm" | "md" (default "md")
 */
import { useTranslation } from '../context/LanguageContext';

export default function PhoneInput({ value = '', onChange, label, className = '', disabled = false, size = 'md' }) {
  const { t } = useTranslation();
  // Strip to local 9 digits
  const toLocal = (v) => {
    const digits = (v || '').replace(/\D/g, '');
    return (digits.startsWith('998') ? digits.slice(3) : digits).slice(0, 9);
  };

  // Format local digits for display: "90 123 45 67"
  const formatLocal = (d) => {
    let out = '';
    if (d.length > 0) out += d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  };

  // Format full phone: "+998 XX XXX XX XX"
  const formatFull = (d) => {
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  };

  const localDigits = toLocal(value);
  const displayValue = formatLocal(localDigits);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    onChange?.(formatFull(raw));
  };

  const isSm = size === 'sm';

  return (
    <div className={className}>
      {label && <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>}
      <div className={`flex border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${disabled ? 'bg-gray-50' : 'bg-white'}`}>
        <div className={`flex items-center gap-1.5 bg-gray-50 border-r border-gray-300 select-none ${isSm ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
          <span className={isSm ? 'text-sm' : 'text-base'}>🇺🇿</span>
          <span className={`font-bold text-gray-700 ${isSm ? 'text-xs' : 'text-sm'}`}>+998</span>
        </div>
        <input
          type="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder={t('placeholders.phoneLocal', '90 123 45 67')}
          disabled={disabled}
          maxLength={13}
          className={`flex-1 border-0 outline-none focus:ring-0 ${isSm ? 'px-2 py-1.5 text-sm' : 'px-3 py-2.5 text-sm'} ${disabled ? 'text-gray-400' : 'text-gray-900'}`}
        />
      </div>
    </div>
  );
}

/**
 * Format a stored phone string for display: "+998 90 123 45 67"
 * If already formatted, returns as-is. If raw digits, formats them.
 */
export function formatPhoneDisplay(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '—';

  // Already has +998 formatting
  if (phone.startsWith('+998') && phone.includes(' ')) return phone;

  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length === 0) return '—';

  let out = '+998';
  if (local.length > 0) out += ' ' + local.slice(0, 2);
  if (local.length > 2) out += ' ' + local.slice(2, 5);
  if (local.length > 5) out += ' ' + local.slice(5, 7);
  if (local.length > 7) out += ' ' + local.slice(7, 9);
  return out;
}
