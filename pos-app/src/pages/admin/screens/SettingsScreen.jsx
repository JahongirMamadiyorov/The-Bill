import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import {
  Store, DollarSign, Percent, Receipt, Check, AlertCircle, AlertTriangle, X, UtensilsCrossed,
} from 'lucide-react';
import { settingsAPI } from '../../../api/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from website/src/pages/admin/AdminRestaurantSettings.jsx
// (~994 lines) — restaurant profile (name/address/phone/logo), currency, tax
// rate/enabled, service charge rate/enabled, receipt header/footer text +
// what shows on the customer receipt, and what shows on the kitchen order
// slip. Same design, same data, same computations ("no design/functional
// changes" rule for this whole Admin build), with the following adaptations:
//
// 1. Imports adjusted for pos-app's file layout (screens/ is one level
//    deeper than website's pages/admin/) — `useTranslation` path adjusted;
//    `settingsAPI` (client.js) was already ported and verified for the
//    foundation task (#20) — `get`/`update` match exactly. `menuAPI` is
//    DROPPED entirely: the source only imports it to feed the (now-excluded,
//    see #2 below) Printers panel's kitchen-station picker
//    (`menuAPI.getStations`/`getItems` inside `PrintersPanel`'s
//    `loadStations`) — confirmed by grep, zero other call sites — so there's
//    nothing left in this port that needs it.
//
// 2. PRINTING — the entire "Printers" section excluded, not just print-
//    trigger code, per the standing rule that this screen "almost certainly
//    has printer IP/port settings fields" and they "must be EXCLUDED/
//    stubbed, not just the print-trigger logic." Found and removed as dead
//    code (matching the Orders screen's precedent of deleting excluded print
//    code outright rather than disabling it in place):
//      - `PrinterCard` (name/IP/port fields + a "not configured" status
//        badge + kitchen-station assignment toggles per printer)
//      - `PrinterSetupGuide` (5-step "how to connect a network printer"
//        walkthrough, compatible-printer list, troubleshooting box)
//      - `AddFormPanel` (shared add-printer draft form, name/IP/port +
//        station picker for kitchen printers)
//      - `PrintersPanel` itself (receipt-printer list/add, kitchen-printer
//        list/add, the `loadStations` merge-3-sources logic that only fed
//        the kitchen-printer station picker)
//      - the `printers` entry in `SECTIONS` / the sidebar nav, so the tab
//        itself no longer appears (same as removing a print button — the
//        underlying capability isn't offered here, not shown greyed out)
//    Icons that were only used by this removed UI (`Printer`, `Wifi`,
//    `Network`, `MonitorCheck`, `ChevronDown`, `ChevronUp`, `Plus`,
//    `Trash2`) are dropped from the import list — nothing else in the file
//    renders them (checked by grep before removing each).
//
//    IMPORTANT — data-preservation fix, not a source behavior: `form.
//    receiptPrinters`/`form.kitchenPrinters` are still loaded from
//    `settingsAPI.get()` and kept in state UNCHANGED (never rendered/edited
//    anywhere in this port), then sent back as-is inside `settingsAPI.
//    update(form)` on every save. This is deliberate, not an oversight —
//    without it, saving any other setting here (e.g. tax rate) would send
//    `receiptPrinters`/`kitchenPrinters` as empty arrays and silently wipe
//    out real printer IP/port configuration entered via the website. The
//    website itself never hits this risk since its own Printers panel always
//    round-trips the user's current edits; this port needed the explicit
//    "carry it through untouched" step since it never renders that panel at
//    all.
//
// 3. RECEIPT/KITCHEN "TEMPLATE" TOGGLES — kept, NOT excluded, and this is a
//    deliberate distinction from #2 above, not an inconsistency. `Receipt
//    TemplatePanel` (receipt header/footer text + show-logo/tax/service-
//    charge/footer/order-number/table-name toggles) and `KitchenTemplate
//    Panel` (kitchen ticket show-order-type/table/order-number/customer-
//    name/qty-unit/item-price/notes/timestamp toggles) are pure `restaurant_
//    settings` data fields with zero print-execution code attached here (no
//    `print()` call, no `printAPI`, no printer hookup of any kind in this
//    file) — they just configure content that the website/print-agent read
//    elsewhere. The task brief explicitly scopes "receipt header/footer
//    text" as in-scope for this port, distinct from "printer settings
//    (EXCLUDE)" — these panels are the receipt-content half, not the
//    printer-hardware half, and stay fully functional.
//
// 4. LOGO UPLOAD — the known `settingsAPI.uploadLogo` stub (throws "image
//    upload is not yet supported in the Admin panel," see client.js's own
//    header comment — pos-app's IPC layer is JSON-only, no multipart/
//    FormData path exists yet) handled with the same disabled-control
//    pattern MenuScreen.jsx already established for the identical `menuAPI.
//    uploadImage` gap: instead of wiring a file picker to a handler that
//    would always throw on first use, `LogoUpload` now renders a disabled,
//    dashed-border control (amber `AlertTriangle` + label + tooltip)
//    whenever a real upload/replace action would be needed. Reused the
//    existing `admin.menu.uploadNotSupportedLabel`/`uploadNotSupportedHint`
//    i18n keys verbatim rather than adding a duplicate settings-scoped pair
//    — the message ("Photo upload not available yet" / "use the website
//    Admin panel for now") applies unchanged here. The existing-logo preview
//    and its "Remove" button are pure local state (no upload API involved)
//    and stay fully functional, same as Menu's photo remove button. Source's
//    `handleFile`/`uploading`/`uploadError` state and the hidden `<input
//    type="file">` were dropped as unreachable dead code behind a disabled
//    control.
//
// 5. `window.prompt`/`window.confirm`/`window.alert` — grepped the whole
//    source file for all three (plus bare `confirm(`/`alert(`/`prompt(`) —
//    zero matches. Nothing needed the ConfirmDialog/local-modal replacement
//    pattern used on Inventory/Staff.
//
// 6. No `navigate` prop needed — this screen never calls react-router
//    navigation anywhere in the source (confirmed by grep), same situation
//    as Menu/Inventory/Loans/Staff.
//
// 7. Data source — REST throughout, not local PowerSync, matching the
//    explicit recommendation already on record (STATUS.md task #21): all 3
//    backing tables (`restaurant_settings`, `custom_stations`, `menu_items`)
//    are in the local PowerSync sync scope, but this is a single infrequent-
//    read settings page and writes must stay REST regardless — no real win
//    from moving the read, so it wasn't attempted here.
//
// Component renamed AdminRestaurantSettings → AdminSettingsScreen on export,
// matching the AdminMenuScreen/AdminOrdersScreen/AdminLoansScreen/
// AdminStaffScreen naming convention from earlier screens.
//
// ── 2026-07-28: re-verified (task #31, ninth/last screen), left on REST ────
// Re-checked item 7 above against the real backend route
// (restaurant-app/backend/src/routes/settings.js) rather than trusting the
// existing comment unread: `GET /api/settings` is `SELECT * FROM
// restaurant_settings WHERE restaurant_id = $1` — a single plain select, no
// joins, confirmed. But the route does one more thing a local read cannot
// faithfully replicate: if the row is missing (`result.rows.length === 0`)
// it INSERTs a fresh default row and returns THAT instead of nothing. A
// local-only `psGet` is a pure SELECT — it cannot create the missing row, so
// on the (rare, likely never-hit-in-practice-by-now) restaurant with no
// `restaurant_settings` row yet, a local read would return `undefined` and
// this screen would break, where REST self-heals. Combined with this being
// a genuinely single, one-time-per-visit read (`useEffect(() => { load() },
// [load])`, no polling interval anywhere in this file, confirmed by grep) —
// there is no speed win worth trading away that self-healing behavior for.
// Left entirely on REST, no code changes in this file. `restaurant_settings`
// (already in the local PowerSync schema) stays unused by this screen for
// exactly this reason, same conclusion as the pre-existing item 7 above,
// now independently re-confirmed rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Field label wrapper ───────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>}
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────────────────────
function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-colors bg-white"
    />
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, desc }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <Toggle checked={!!checked} onChange={onChange} />
    </div>
  );
}

// ── Logo upload — disabled-control pattern, see header comment #4 ────────────
function LogoUpload({ value, onChange, t }) {
  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-start gap-4">
          <div className="w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src={value}
              alt="logo"
              className="w-full h-full object-contain p-2"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-100 cursor-not-allowed"
              title={t('admin.menu.uploadNotSupportedHint')}
            >
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 font-medium">{t('admin.menu.uploadNotSupportedLabel')}</span>
            </div>
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-red-100 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <X size={14} />
              {t('settings.info.removeLogo')}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 w-full h-28 rounded-xl border-2 border-dashed border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
          title={t('admin.menu.uploadNotSupportedHint')}
        >
          <AlertTriangle size={22} className="text-amber-500" />
          <span className="text-sm font-medium text-gray-500">{t('admin.menu.uploadNotSupportedLabel')}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section panels
// ─────────────────────────────────────────────────────────────────────────────

function RestaurantInfoPanel({ form, set, t }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t('settings.sections.restaurantInfo')} />
        <div className="px-5 py-4 flex flex-col gap-4">
          <Field label={t('settings.info.name')}>
            <TextInput value={form.restaurantName} onChange={set('restaurantName')} placeholder={t('settings.info.namePlaceholder')} />
          </Field>
          <Field label={t('settings.info.address')}>
            <TextInput value={form.address} onChange={set('address')} placeholder={t('settings.info.addressPlaceholder')} />
          </Field>
          <Field label={t('settings.info.phone')}>
            <TextInput value={form.phone} onChange={set('phone')} placeholder={t('settings.info.phonePlaceholder')} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.info.uploadLogo')} desc={t('settings.info.uploadLogoHint')} />
        <div className="px-5 py-4">
          <LogoUpload value={form.logoUrl} onChange={set('logoUrl')} t={t} />
        </div>
      </Card>
    </div>
  );
}

function FinancialPanel({ form, set, t }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t('settings.financial.currencySymbol')} />
        <div className="px-5 py-4">
          <Field label={t('settings.financial.currencySymbol')}>
            <TextInput value={form.currencySymbol} onChange={set('currencySymbol')} placeholder={t('settings.financial.currencyPlaceholder')} />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">{t('settings.financial.taxEnabled')}</p>
          <Toggle checked={form.taxEnabled} onChange={set('taxEnabled')} />
        </div>
        {form.taxEnabled && (
          <div className="border-t border-gray-100 px-5 py-4">
            <Field label={t('settings.financial.taxRate')}>
              <div className="relative">
                <TextInput value={form.taxRate} onChange={v => set('taxRate')(Number(v))} type="number" placeholder="0" />
                <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">{t('settings.financial.serviceChargeEnabled')}</p>
          <Toggle checked={form.serviceChargeEnabled} onChange={set('serviceChargeEnabled')} />
        </div>
        {form.serviceChargeEnabled && (
          <div className="border-t border-gray-100 px-5 py-4">
            <Field label={t('settings.financial.serviceChargeRate')}>
              <div className="relative">
                <TextInput value={form.serviceChargeRate} onChange={v => set('serviceChargeRate')(Number(v))} type="number" placeholder="0" />
                <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </Field>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReceiptTemplatePanel({ form, set, t }) {
  return (
    <div className="flex flex-col gap-5">

      {/* Header text — moved here from Printers */}
      <Card>
        <CardHeader title={t('settings.receipt.headerText')} />
        <div className="px-5 py-4">
          <Field>
            <TextInput value={form.receiptHeader} onChange={set('receiptHeader')} placeholder={t('settings.receipt.headerPlaceholder')} />
          </Field>
        </div>
      </Card>

      {/* Toggle options */}
      <Card>
        <CardHeader title={t('settings.sections.receiptTemplate')} desc={t('settings.receipt.title')} />
        <ToggleRow label={t('settings.receipt.showLogo')}          checked={form.receiptShowLogo}          onChange={set('receiptShowLogo')} />
        <ToggleRow label={t('settings.receipt.showOrderNumber')}   checked={form.receiptShowOrderNumber}   onChange={set('receiptShowOrderNumber')} />
        <ToggleRow label={t('settings.receipt.showTableName')}     checked={form.receiptShowTableName}     onChange={set('receiptShowTableName')} />
        <ToggleRow label={t('settings.receipt.showTax')}           checked={form.receiptShowTax}           onChange={set('receiptShowTax')} />
        <ToggleRow label={t('settings.receipt.showServiceCharge')} checked={form.receiptShowServiceCharge} onChange={set('receiptShowServiceCharge')} />
        <ToggleRow label={t('settings.receipt.showFooter')}        checked={form.receiptShowFooter}        onChange={set('receiptShowFooter')} />
      </Card>

      {form.receiptShowFooter && (
        <Card>
          <CardHeader title={t('settings.receipt.footerText')} />
          <div className="px-5 py-4">
            <Field>
              <TextInput value={form.receiptFooter} onChange={set('receiptFooter')} placeholder={t('settings.receipt.footerPlaceholder')} />
            </Field>
          </div>
        </Card>
      )}

    </div>
  );
}

function KitchenTemplatePanel({ form, set, t }) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t('settings.sections.kitchenTemplate')} desc={t('settings.kitchen.title')} />
        <ToggleRow label={t('settings.kitchen.showOrderType')}    checked={form.kitchenShowOrderType}    onChange={set('kitchenShowOrderType')} />
        <ToggleRow label={t('settings.kitchen.showTableName')}    checked={form.kitchenShowTableName}    onChange={set('kitchenShowTableName')} />
        <ToggleRow label={t('settings.kitchen.showOrderNumber')}  checked={form.kitchenShowOrderNumber}  onChange={set('kitchenShowOrderNumber')} />
        <ToggleRow label={t('settings.kitchen.showCustomerName')} checked={form.kitchenShowCustomerName} onChange={set('kitchenShowCustomerName')} />
        <ToggleRow label={t('settings.kitchen.showQtyUnit')}      checked={form.kitchenShowQtyUnit}      onChange={set('kitchenShowQtyUnit')} />
        <ToggleRow label={t('settings.kitchen.showItemPrice')}    checked={form.kitchenShowItemPrice}    onChange={set('kitchenShowItemPrice')} />
        <ToggleRow label={t('settings.kitchen.showNotes')}        checked={form.kitchenShowNotes}        onChange={set('kitchenShowNotes')} />
        <ToggleRow label={t('settings.kitchen.showTimestamp')}    checked={form.kitchenShowTimestamp}    onChange={set('kitchenShowTimestamp')} />
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTIONS — "printers" entry deliberately dropped, see header comment #2.
const SECTIONS = [
  { key: 'info',     icon: Store,           labelKey: 'settings.sections.restaurantInfo',  Panel: RestaurantInfoPanel },
  { key: 'finance',  icon: DollarSign,      labelKey: 'settings.sections.financial',       Panel: FinancialPanel },
  { key: 'receipt',  icon: Receipt,         labelKey: 'settings.sections.receiptTemplate', Panel: ReceiptTemplatePanel },
  { key: 'kitchen',  icon: UtensilsCrossed, labelKey: 'settings.sections.kitchenTemplate', Panel: KitchenTemplatePanel },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminSettingsScreen() {
  const { t } = useTranslation();

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [activeKey, setActiveKey] = useState('info');

  const [form, setForm] = useState({
    restaurantName: '',
    address: '',
    phone: '',
    logoUrl: '',
    currencySymbol: "so'm",
    receiptHeader: '',
    receiptFooter: '',
    taxRate: 0,
    taxEnabled: false,
    serviceChargeRate: 0,
    serviceChargeEnabled: false,
    // Kept in state and round-tripped unchanged on save even though this
    // port renders no UI for them — see header comment #2's "data-
    // preservation fix" note.
    receiptPrinters: [],
    kitchenPrinters: [],
    receiptShowLogo: true,
    receiptShowTax: true,
    receiptShowServiceCharge: true,
    receiptShowFooter: true,
    receiptShowOrderNumber: true,
    receiptShowTableName: true,
    kitchenShowOrderType: true,
    kitchenShowTableName: true,
    kitchenShowOrderNumber: true,
    kitchenShowCustomerName: true,
    kitchenShowQtyUnit: true,
    kitchenShowItemPrice: false,
    kitchenShowNotes: true,
    kitchenShowTimestamp: true,
  });

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const data = await settingsAPI.get();
      setForm(prev => ({
        ...prev,
        ...data,
        receiptPrinters: Array.isArray(data.receiptPrinters) ? data.receiptPrinters : [],
        kitchenPrinters: Array.isArray(data.kitchenPrinters) ? data.kitchenPrinters : [],
      }));
    } catch {
      showToast('err', t('settings.loadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.update(form);
      showToast('ok', t('settings.saved'));
    } catch {
      showToast('err', t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const activeSection = SECTIONS.find(s => s.key === activeKey) || SECTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t(activeSection.labelKey)}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('settings.saving')}</>
            : <><Check size={15} />{t('common.saveChanges')}</>
          }
        </button>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white transition-all ${
          toast.type === 'ok' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'ok' ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — section nav */}
        <div className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="px-4 pt-5 pb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">
              {t('settings.title')}
            </p>
          </div>
          <nav className="px-3 pb-4 flex flex-col gap-0.5">
            {SECTIONS.map(({ key, icon: Icon, labelKey }) => {
              const active = key === activeKey;
              return (
                <button
                  key={key}
                  onClick={() => setActiveKey(key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon size={17} className={`flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="flex-1 truncate">{t(labelKey)}</span>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT — content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl px-8 py-7">

            <activeSection.Panel form={form} set={set} t={t} />

            <div className="mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('settings.saving')}</>
                  : <><Check size={15} />{t('common.saveChanges')}</>
                }
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
