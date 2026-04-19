// ════════════════════════════════════════════════════════════════
// ConfirmDialog — Styled replacement for window.confirm / alert
// ════════════════════════════════════════════════════════════════
import { AlertTriangle, Trash2, CheckCircle, Info, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

/**
 * Usage:
 *
 * 1) Add state:
 *    const [dialog, setDialog] = useState(null);
 *
 * 2) Show dialog:
 *    // Info / error / success:
 *    setDialog({ title: 'Error', message: 'Something went wrong', type: 'error' });
 *    setDialog({ title: 'Saved!', message: 'Changes saved.', type: 'success' });
 *
 *    // Confirm destructive:
 *    setDialog({
 *      title: 'Delete Item', message: 'Are you sure?', type: 'danger',
 *      confirmLabel: 'Delete', onConfirm: () => { setDialog(null); doDelete(); },
 *    });
 *
 * 3) Render once:
 *    <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
 */

const ICONS = {
  danger:  Trash2,
  error:   XCircle,
  warning: AlertTriangle,
  success: CheckCircle,
  info:    Info,
};

const TYPE_CONFIG = {
  danger:  { iconCls: 'text-red-600',    circleCls: 'bg-red-100',    btnCls: 'bg-red-600 hover:bg-red-700' },
  error:   { iconCls: 'text-red-600',    circleCls: 'bg-red-100',    btnCls: 'bg-blue-600 hover:bg-blue-700' },
  warning: { iconCls: 'text-amber-600',  circleCls: 'bg-amber-100',  btnCls: 'bg-blue-600 hover:bg-blue-700' },
  success: { iconCls: 'text-green-600',  circleCls: 'bg-green-100',  btnCls: 'bg-green-600 hover:bg-green-700' },
  info:    { iconCls: 'text-blue-600',   circleCls: 'bg-blue-100',   btnCls: 'bg-blue-600 hover:bg-blue-700' },
};

export default function ConfirmDialog({ dialog, onClose }) {
  const { t } = useTranslation();
  if (!dialog) return null;

  const type = dialog.type || 'info';
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const Icon = ICONS[type] || Info;
  const hasCancel = !!dialog.onConfirm;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`w-12 h-12 ${cfg.circleCls} rounded-2xl flex items-center justify-center mb-4`}>
          <Icon size={22} className={cfg.iconCls} />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-gray-900 mb-1">{dialog.title || t('common.alert', 'Alert')}</h2>

        {/* Message */}
        {dialog.message && (
          <p className="text-sm text-gray-500 mb-6">{dialog.message}</p>
        )}

        {/* Buttons */}
        {hasCancel ? (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={dialog.onConfirm}
              disabled={dialog.loading}
              className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${cfg.btnCls}`}
            >
              {dialog.loading ? t('common.loading', 'Loading…') : (dialog.confirmLabel || t('common.confirm', 'Confirm'))}
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className={`w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-colors ${cfg.btnCls}`}
          >
            {dialog.confirmLabel || t('common.ok', 'OK')}
          </button>
        )}
      </div>
    </div>
  );
}
