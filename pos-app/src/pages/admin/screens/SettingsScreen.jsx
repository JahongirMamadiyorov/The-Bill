import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../context/LanguageContext.jsx';
import {
  Store, DollarSign, Percent, Receipt, Check, AlertCircle, AlertTriangle, X, UtensilsCrossed,
  Printer, Wifi, Network, MonitorCheck, ChevronDown, ChevronUp, Plus, Trash2,
} from 'lucide-react';
import { settingsAPI } from '../../../api/client.js';
import { camelizeRows } from '../../../lib/case.js';

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
//
// ── 2026-07-29: Printers tab RESTORED — supersedes items 1-2 above, which
// are kept for history, not deleted (per RULES.md §0). Printing was out of
// scope when this file was first ported; a full kitchen-ticket print engine
// (`pos-app/printEngine.js`, task #41-45) now exists, and the ONE remaining
// gap was that this screen had no UI at all to enter/edit a printer's IP —
// the only way to configure `kitchen_printers`/`receipt_printers` was the
// old website's Settings page. Restored faithfully from the website source
// (`website/src/pages/admin/AdminRestaurantSettings.jsx`, ~994 lines) — same
// fields, same layout, same behavior: `PrinterCard` (name/IP/port + a
// connection-status badge + kitchen-station toggle buttons for kitchen
// printers only), `AddFormPanel` (shared draft-entry form for adding a new
// receipt or kitchen printer, must stay a top-level component or React
// remounts it every keystroke and the input loses focus), `PrinterSetupGuide`
// (collapsible 5-step walkthrough + compatible-printer list + troubleshooting
// box), and `PrintersPanel` itself (receipt-printer list/add-form, then a
// divider, then kitchen-printer list/add-form, stacked vertically — matching
// the source's actual layout, not a redesigned side-by-side). The `printers`
// entry is back in `SECTIONS` in its original position (between `finance`
// and `receipt`, matching the source file's own `SECTIONS` order exactly).
// Icons restored: `Printer`, `Wifi`, `Network`, `MonitorCheck`, `ChevronDown`,
// `ChevronUp`, `Plus`, `Trash2` — all eight are actually used by the
// restored code (Printer: panel header icons + empty-state icons + setup
// guide step 3; Wifi/Network/MonitorCheck: setup guide steps 1/2/5;
// ChevronDown/ChevronUp: setup guide's own expand/collapse chevron;
// Plus/Trash2: add-printer and remove-printer buttons) — verified by grep
// before adding each, not blindly restored as a block.
//
// The `receiptPrinters`/`kitchenPrinters` state fields and the "carry
// through unchanged on save" fix documented above are no longer just a
// data-preservation shim — they are now the real, live save path for this
// panel. `PrintersPanel` reads/writes them through the EXACT SAME
// `form`/`set`/`handleSave` mechanism every other tab on this screen already
// uses (`set('kitchenPrinters')([...])`, then the same single
// `settingsAPI.update(form)` call on Save) — no parallel/second save path
// was introduced.
//
// ONE deliberate improvement over the original, matching this project's own
// established precedent (task #31): the source's `loadStations` fetches
// available kitchen stations via REST (`menuAPI.getStations()` + `menuAPI.
// getItems()`). Per task #31's standing pattern (see `MenuScreen.jsx`'s own
// already-converted `fetchStations`/`fetchItems`), this port fetches the
// same 3 sources locally via PowerSync instead: (1) the same hardcoded
// `PRESET_STATION_NAMES` list (no fetch needed), (2) `SELECT DISTINCT
// kitchen_station FROM menu_items WHERE kitchen_station IS NOT NULL AND
// kitchen_station <> ''` (replaces `menuAPI.getItems()` — only the distinct
// non-empty station names were ever read off each item, same as the
// source's own `.map(i => i.kitchenStation).filter(Boolean)`), and (3)
// `SELECT name FROM custom_stations ORDER BY created_at` (replaces `menuAPI.
// getStations()` — identical query to `MenuScreen.jsx`'s own `fetchStations`,
// reused verbatim rather than re-derived). The case-insensitive
// first-occurrence-wins merge logic across all 3 sources is otherwise
// byte-for-byte identical to the source. This is safe because both
// `menu_items` and `custom_stations` are fully-synced PowerSync tables
// (confirmed, not assumed — same tables `MenuScreen.jsx` already reads
// locally) and this is a pure read with no server-side business logic
// attached (unlike the outer `GET/PUT /api/settings` round-trip itself,
// which per item 7's "2026-07-28" addendum above correctly stays on REST
// for its self-healing auto-INSERT behavior — that conclusion is UNCHANGED,
// this deviation only replaces the ONE inner call feeding the station
// picker, nothing about the settings read/write itself). `menuAPI` is NOT
// re-imported — its only remaining potential use (`getStations`/`getItems`)
// is fully replaced by the local reads above, confirmed by grep there is no
// other call site that would need it.
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

// ── Shared printer card (receipt or kitchen) — restored 2026-07-29, ported
// verbatim from website/src/pages/admin/AdminRestaurantSettings.jsx ─────────
function PrinterCard({ printer, namePlaceholder, stations, showStations, onUpdate, onRemove, t }) {
  const { id, name, ip, port } = printer;
  const printerStations = printer.stations || [];

  const toggleStation = (stationName) => {
    const next = printerStations.includes(stationName)
      ? printerStations.filter(s => s !== stationName)
      : [...printerStations, stationName];
    onUpdate(id, 'stations', next);
  };

  return (
    <Card>
      <div className="px-5 py-4 flex flex-col gap-4">

        {/* Name + remove */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Field label={t('settings.printers.printerName')}>
              <TextInput
                value={name}
                onChange={v => onUpdate(id, 'name', v)}
                placeholder={namePlaceholder}
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => onRemove(id)}
            title={t('settings.printers.removePrinter')}
            className="mt-5 flex items-center justify-center w-9 h-9 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* IP + port */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label={t('settings.printers.ip')}>
              <TextInput value={ip} onChange={v => onUpdate(id, 'ip', v)} placeholder={t('settings.printers.ipPlaceholder')} />
            </Field>
          </div>
          <Field label={t('settings.printers.port')}>
            <TextInput value={port} onChange={v => onUpdate(id, 'port', Number(v))} type="number" placeholder="9100" />
          </Field>
        </div>

        {/* Status badge */}
        {ip ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-xs font-medium">
            <Check size={13} className="flex-shrink-0" />
            {ip}:{port || 9100}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">
            <AlertCircle size={13} className="flex-shrink-0" />
            {t('settings.printers.notConfigured')}
          </div>
        )}

        {/* Stations — only for kitchen printers */}
        {showStations && (
          <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
              {t('settings.printers.assignedStations')}
            </p>
            {stations.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {stations.map(s => {
                    const active = printerStations.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleStation(s.name)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                {printerStations.length === 0 && (
                  <p className="text-xs text-gray-400">{t('settings.printers.noStations')}</p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-400">{t('settings.printers.noStations')}</p>
                <p className="text-xs text-blue-500">{t('settings.printers.noStationsHint')}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </Card>
  );
}

// ── Printer setup guide — restored 2026-07-29, ported verbatim ──────────────
function PrinterSetupGuide({ t }) {
  const [open, setOpen] = useState(false);

  const steps = [
    { icon: Wifi,         titleKey: 'settings.printers.step1Title', descKey: 'settings.printers.step1Desc' },
    { icon: Network,      titleKey: 'settings.printers.step2Title', descKey: 'settings.printers.step2Desc' },
    { icon: Printer,      titleKey: 'settings.printers.step3Title', descKey: 'settings.printers.step3Desc' },
    { icon: UtensilsCrossed, titleKey: 'settings.printers.step4Title', descKey: 'settings.printers.step4Desc' },
    { icon: MonitorCheck, titleKey: 'settings.printers.step5Title', descKey: 'settings.printers.step5Desc' },
  ];

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-blue-50/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Printer size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-blue-800">{t('settings.printers.howToConnect')}</span>
        </div>
        {open
          ? <ChevronUp size={15} className="text-blue-500 flex-shrink-0" />
          : <ChevronDown size={15} className="text-blue-500 flex-shrink-0" />}
      </button>

      {/* Expandable content */}
      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-blue-200">

          {/* Steps */}
          <div className="flex flex-col gap-3 pt-4">
            {steps.map(({ icon: Icon, titleKey, descKey }, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && <div className="w-px flex-1 bg-blue-200 min-h-3" />}
                </div>
                <div className="pb-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon size={13} className="text-blue-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">{t(titleKey)}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Compatible printers */}
          <div className="rounded-xl bg-white border border-blue-100 px-4 py-3 flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-gray-700">Compatible printers</p>
            <p className="text-xs text-gray-500 leading-relaxed">{t('settings.printers.compatiblePrinters')}</p>
          </div>

          {/* Troubleshooting */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-2.5">
            <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">{t('settings.printers.troubleshooting')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Same preset station names the Menu page uses ──────────────────────────────
const PRESET_STATION_NAMES = ['Salad', 'Grill', 'Bar', 'Pastry', 'Cold', 'Hot'];

// ── Empty add-form state helpers ──────────────────────────────────────────────
const EMPTY_RECEIPT_FORM = { name: '', ip: '', port: '9100' };
const emptyKitchenForm = () => ({ name: '', ip: '', port: '9100', stations: [] });

// ── Add-form panel — MUST be a top-level component (not defined inside
//    PrintersPanel) otherwise React re-mounts it on every keystroke and
//    the input loses focus after each character. Restored 2026-07-29,
//    ported verbatim. ────────────────────────────────────────────────────────
function AddFormPanel({
  draft, setDraft, namePlaceholder, onConfirm, onCancel,
  showStationPicker, stations, stationsLoading, stationError, onRetryStations,
  toggleDraftStation, t,
}) {
  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <div className="px-5 py-4 flex flex-col gap-4">
        <Field label={t('settings.printers.printerName')}>
          <TextInput
            value={draft.name}
            onChange={v => setDraft(d => ({ ...d, name: v }))}
            placeholder={namePlaceholder}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label={t('settings.printers.ip')}>
              <TextInput
                value={draft.ip}
                onChange={v => setDraft(d => ({ ...d, ip: v }))}
                placeholder={t('settings.printers.ipPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('settings.printers.port')}>
            <TextInput
              value={draft.port}
              onChange={v => setDraft(d => ({ ...d, port: v }))}
              type="number"
              placeholder="9100"
            />
          </Field>
        </div>

        {/* Station assignment — kitchen printers only */}
        {showStationPicker && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('settings.printers.assignedStations')}
            </p>
            {stationsLoading && (
              <p className="text-xs text-gray-400">{t('common.loading')}</p>
            )}
            {stationError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} />{stationError}
                <button type="button" onClick={onRetryStations} className="underline ml-1">{t('common.retry')}</button>
              </p>
            )}
            {!stationsLoading && !stationError && stations.length === 0 && (
              <p className="text-xs text-gray-400">{t('settings.printers.noStationsHint')}</p>
            )}
            {stations.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {stations.map(s => {
                    const active = draft.stations.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleDraftStation(s.name)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400">{t('settings.printers.noStationsConfigured')}</p>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} />
            {t('settings.printers.confirmAddPrinter')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Printers panel — restored 2026-07-29. Layout ported verbatim (receipt
// printers list/add-form, a divider, then kitchen printers list/add-form,
// stacked vertically). The ONE change from the source: `loadStations` reads
// its 3 merge sources from local PowerSync instead of REST — see this
// file's header comment addendum for the full reasoning. ───────────────────
function PrintersPanel({ form, set, t }) {
  const [stations,        setStations]        = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationError,    setStationError]    = useState(null);

  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptDraft,    setReceiptDraft]    = useState(EMPTY_RECEIPT_FORM);
  const [showKitchenForm, setShowKitchenForm] = useState(false);
  const [kitchenDraft,    setKitchenDraft]    = useState(emptyKitchenForm());

  // ── Load stations — local PowerSync read, merges 3 sources to match
  // AdminMenu.jsx / MenuScreen.jsx's own already-converted `fetchStations`:
  // (1) built-in preset names, (2) distinct non-empty `kitchen_station`
  // values already used by a menu item, (3) `custom_stations` rows. Same
  // case-insensitive, first-occurrence-wins merge order as the website.
  const loadStations = useCallback(async () => {
    setStationsLoading(true);
    setStationError(null);
    try {
      const [customRows, itemRows] = await Promise.all([
        window.electronAPI.psGetAll(`SELECT name FROM custom_stations ORDER BY created_at`),
        window.electronAPI.psGetAll(
          `SELECT DISTINCT kitchen_station FROM menu_items WHERE kitchen_station IS NOT NULL AND kitchen_station <> ''`
        ),
      ]);
      const customData = camelizeRows(customRows);
      const itemsData = camelizeRows(itemRows);

      const seen   = new Set();
      const merged = [];

      for (const name of PRESET_STATION_NAMES) {
        const key = name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); merged.push({ name }); }
      }

      const itemStations = itemsData
        .map(i => (i.kitchenStation || '').trim()).filter(Boolean);
      for (const name of itemStations) {
        const key = name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); merged.push({ name }); }
      }

      const dbStations = customData
        .map(s => (s.name || '').trim()).filter(Boolean);
      for (const name of dbStations) {
        const key = name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); merged.push({ name }); }
      }

      setStations(merged);
    } catch (err) {
      console.error('loadStations error:', err);
      setStationError(t('settings.printers.stationsLoadFailed'));
    } finally {
      setStationsLoading(false);
    }
  }, [t]);
  useEffect(() => { loadStations(); }, [loadStations]);

  // ── Receipt printer helpers ──
  const confirmAddReceiptPrinter = () => {
    const p = { id: Date.now().toString(), name: receiptDraft.name, ip: receiptDraft.ip, port: Number(receiptDraft.port) || 9100 };
    set('receiptPrinters')([...(form.receiptPrinters || []), p]);
    setReceiptDraft(EMPTY_RECEIPT_FORM);
    setShowReceiptForm(false);
  };
  const updateReceiptPrinter = (id, field, value) =>
    set('receiptPrinters')((form.receiptPrinters || []).map(p => p.id === id ? { ...p, [field]: value } : p));
  const removeReceiptPrinter = (id) =>
    set('receiptPrinters')((form.receiptPrinters || []).filter(p => p.id !== id));

  // ── Kitchen printer helpers ──
  const confirmAddKitchenPrinter = () => {
    const p = { id: Date.now().toString(), name: kitchenDraft.name, ip: kitchenDraft.ip, port: Number(kitchenDraft.port) || 9100, stations: kitchenDraft.stations };
    set('kitchenPrinters')([...(form.kitchenPrinters || []), p]);
    setKitchenDraft(emptyKitchenForm());
    setShowKitchenForm(false);
  };
  const updateKitchenPrinter = (id, field, value) =>
    set('kitchenPrinters')((form.kitchenPrinters || []).map(p => p.id === id ? { ...p, [field]: value } : p));
  const removeKitchenPrinter = (id) =>
    set('kitchenPrinters')((form.kitchenPrinters || []).filter(p => p.id !== id));

  const toggleDraftStation = (name) => {
    setKitchenDraft(prev => ({
      ...prev,
      stations: prev.stations.includes(name)
        ? prev.stations.filter(s => s !== name)
        : [...prev.stations, name],
    }));
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ── Setup guide ──────────────────────────────────────────────── */}
      <PrinterSetupGuide t={t} />

      {/* ── Receipt Printers ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">{t('settings.printers.receiptPrinters')}</p>
          {!showReceiptForm && (
            <button
              type="button"
              onClick={() => setShowReceiptForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
            >
              <Plus size={13} />
              {t('settings.printers.addReceiptPrinter')}
            </button>
          )}
        </div>

        {showReceiptForm && (
          <AddFormPanel
            draft={receiptDraft}
            setDraft={setReceiptDraft}
            namePlaceholder={t('settings.printers.receiptPrinterNamePlaceholder')}
            onConfirm={confirmAddReceiptPrinter}
            onCancel={() => { setShowReceiptForm(false); setReceiptDraft(EMPTY_RECEIPT_FORM); }}
            showStationPicker={false}
            stations={[]}
            stationsLoading={false}
            stationError={null}
            onRetryStations={loadStations}
            toggleDraftStation={toggleDraftStation}
            t={t}
          />
        )}

        {(form.receiptPrinters || []).length === 0 && !showReceiptForm && (
          <div className="flex flex-col items-center justify-center py-7 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 gap-1.5">
            <Printer size={22} className="opacity-40" />
            <p className="text-xs font-medium">{t('settings.printers.emptyReceiptPrinters')}</p>
          </div>
        )}

        {(form.receiptPrinters || []).map(printer => (
          <PrinterCard
            key={printer.id}
            printer={printer}
            namePlaceholder={t('settings.printers.receiptPrinterNamePlaceholder')}
            stations={[]}
            showStations={false}
            onUpdate={updateReceiptPrinter}
            onRemove={removeReceiptPrinter}
            t={t}
          />
        ))}
      </div>

      <div className="border-t border-gray-200" />

      {/* ── Kitchen Printers ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">{t('settings.printers.kitchenPrinters')}</p>
          {!showKitchenForm && (
            <button
              type="button"
              onClick={() => setShowKitchenForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
            >
              <Plus size={13} />
              {t('settings.printers.addKitchenPrinter')}
            </button>
          )}
        </div>

        {/* Hint about where stations come from */}
        {!stationsLoading && stations.length > 0 && (
          <p className="text-xs text-gray-400">{t('settings.printers.stationsFromMenu')}</p>
        )}

        {showKitchenForm && (
          <AddFormPanel
            draft={kitchenDraft}
            setDraft={setKitchenDraft}
            namePlaceholder={t('settings.printers.kitchenPrinterNamePlaceholder')}
            onConfirm={confirmAddKitchenPrinter}
            onCancel={() => { setShowKitchenForm(false); setKitchenDraft(emptyKitchenForm()); }}
            showStationPicker={true}
            stations={stations}
            stationsLoading={stationsLoading}
            stationError={stationError}
            onRetryStations={loadStations}
            toggleDraftStation={toggleDraftStation}
            t={t}
          />
        )}

        {(form.kitchenPrinters || []).length === 0 && !showKitchenForm && (
          <div className="flex flex-col items-center justify-center py-7 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 gap-1.5">
            <Printer size={22} className="opacity-40" />
            <p className="text-xs font-medium">{t('settings.printers.emptyKitchenPrinters')}</p>
          </div>
        )}

        {(form.kitchenPrinters || []).map(printer => (
          <PrinterCard
            key={printer.id}
            printer={printer}
            namePlaceholder={t('settings.printers.kitchenPrinterNamePlaceholder')}
            stations={stations}
            showStations={true}
            onUpdate={updateKitchenPrinter}
            onRemove={removeKitchenPrinter}
            t={t}
          />
        ))}
      </div>

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
        <ToggleRow
          label={t('settings.receipt.autoPrint')}
          desc={t('settings.receipt.autoPrintDesc')}
          checked={form.receiptAutoPrint}
          onChange={set('receiptAutoPrint')}
        />
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
// SECTIONS — "printers" entry restored 2026-07-29 in its original position
// (between finance and receipt), matching the source file's own order.
const SECTIONS = [
  { key: 'info',     icon: Store,           labelKey: 'settings.sections.restaurantInfo',  Panel: RestaurantInfoPanel },
  { key: 'finance',  icon: DollarSign,      labelKey: 'settings.sections.financial',       Panel: FinancialPanel },
  { key: 'printers', icon: Printer,         labelKey: 'settings.sections.printers',        Panel: PrintersPanel },
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
    // Restored 2026-07-29 — now a real, editable field via PrintersPanel
    // (see header comment's "2026-07-29" addendum). Still initialized empty
    // here; `load()` below overwrites with whatever settingsAPI.get() returns.
    receiptPrinters: [],
    kitchenPrinters: [],
    receiptShowLogo: true,
    receiptShowTax: true,
    receiptShowServiceCharge: true,
    receiptShowFooter: true,
    receiptShowOrderNumber: true,
    receiptShowTableName: true,
    // Auto-print the customer receipt when payment is confirmed (2026-08-02).
    // Needs no extra load/save wiring: load() spreads the camelised API data and
    // handleSave() sends the whole form back through client.js's snakeizeKeys,
    // so this round-trips as receipt_auto_print on its own.
    receiptAutoPrint: true,
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
