// ─────────────────────────────────────────────────────────────────────────────
// Minimal i18n for the POS terminal (pos-app/src/pages/pos/*). The UZ/EN
// toggle already existed in PosShell.jsx (`lang` state, persisted to
// localStorage) but nothing actually read it — every screen just hardcoded
// English strings. This file is the fix: a translation dictionary keyed by
// the EXACT English source string (not invented semantic keys), so wiring a
// screen up is "wrap the literal in t(...)" rather than a big refactor.
//
// Usage:
//   import { t, tt, tableLabel } from '../../lib/i18n.js';
//   t('Menu', lang)                              → 'Menyu' when lang==='UZ'
//   tt(lang, '{n} seats', "{n} o'rin", { n: 4 })  → template with a variable
//   tableLabel(table, lang)                       → table.name || 'Stol {n}'
//
// `lang` is always the raw value from PosShell's `lang` state — 'UZ' or
// 'EN'. Anything other than the literal 'UZ' is treated as English (i.e.
// English is the fallback, not a special case), so a missing/undefined lang
// prop degrades safely to English instead of throwing.
// ─────────────────────────────────────────────────────────────────────────────

const UZ = {
  // ── Login screen (Login.jsx) — the one screen that runs before any role is
  // known, so it can't use either the Admin panel's context-based i18n
  // (LanguageContext.jsx) or rely on PosShell's `lang` state existing yet.
  // Uses this same dictionary/`t()` directly instead, with its own local
  // `lang` state seeded from whichever of 'pos.lang'/'lang' localStorage keys
  // already has a value (see Login.jsx), so returning users see the language
  // they last used rather than always restarting at the default.
  'Restaurant Management System — POS': 'Restoran boshqaruv tizimi — POS',
  'Email, Phone, or Username': 'Email, telefon yoki foydalanuvchi nomi',
  'Password': 'Parol',
  'Sign In': 'Kirish',
  'Signing in…': 'Kirilmoqda…',
  'Enter your email/phone/username and password.': 'Email/telefon/foydalanuvchi nomi va parolni kiriting.',
  'Login failed.': 'Kirish amalga oshmadi.',
  'Show password': 'Parolni ko‘rsatish',
  'Hide password': 'Parolni yashirish',

  // ── Session resume confirmation (App.jsx SessionResume) — shown once per
  // app launch when a saved session is restored from disk, before any screen
  // renders. Same "runs before any role/shell exists" situation as Login.
  'A saved session was found on this device': 'Ushbu qurilmada saqlangan sessiya topildi',
  'Continue as': 'Davom etish:',
  'Not you? Log out': 'Bu siz emasmisiz? Chiqish',

  // ── Shell / nav (PosShell.jsx) ──────────────────────────────────────────
  'Menu': 'Menyu',
  'Orders': 'Buyurtmalar',
  'Tables': 'Stollar',
  'History': 'Tarix',
  'Receivables': 'Nasiya',
  'Profile': 'Profil',
  'Search menu...': 'Menyudan qidirish...',
  'Search orders...': 'Buyurtmalardan qidirish...',
  'Search tables...': 'Stollardan qidirish...',
  'Search history...': 'Tarixdan qidirish...',
  'Search receivables...': 'Nasiyadan qidirish...',
  'My Profile': 'Mening profilim',
  'Restaurant management system': 'Restoran boshqaruv tizimi',
  'Collapse': "Yig'ish",
  'Expand': 'Yoyish',
  'Logout': 'Chiqish',
  'Language': 'Til',
  'Online': 'Onlayn',
  'Syncing…': 'Sinxronlanmoqda…',
  'Offline': 'Oflayn',

  // ── Connection details panel (PosShell.jsx, topbar badge → click) ──────────
  // Added 2026-07-31 so a machine that says "Oflayn" can say WHICH of the three
  // checks failed — the badge alone made remote machines undiagnosable.
  'Click for connection details': 'Ulanish tafsilotlari uchun bosing',
  'Connection details': 'Ulanish tafsilotlari',
  'PowerSync connected': 'PowerSync ulangan',
  'Local data synced': 'Mahalliy maʼlumot sinxronlangan',
  'Backend reachable': 'Server bilan aloqa bor',
  'Backend': 'Server',
  'Last synced': 'Oxirgi sinxronlash',
  'Last checked': 'Oxirgi tekshiruv',
  'Never': 'Hech qachon',
  'Re-check now': 'Qayta tekshirish',
  'Copy details': 'Nusxa olish',
  'Copied': 'Nusxalandi',
  'Recent events': 'Soʻnggi hodisalar',

  // ── Receipt printing (added 2026-08-02) ───────────────────────────────────
  'Receipt printer did not respond': 'Chek printeri javob bermadi',
  'Receipt sent to printer': 'Chek printerga yuborildi',
  'No receipt printer set up yet — add one in Settings → Printers':
    'Chek printeri hali sozlanmagan — Sozlamalar → Printerlar boʻlimidan qoʻshing',
  'Print Receipt': 'Chek chiqarish',
  'Print a receipt for this item': 'Bu taom uchun chek chiqarish',
  // Found untranslated by the 2026-08-09 full audit — these render English on an
  // Uzbek screen, and three of them appear exactly when something has gone wrong.
  'Some kitchen printers did not respond — check the ticket manually':
    "Ba'zi oshxona printerlari javob bermadi — chekni qo'lda tekshiring",
  // Per-terminal kitchen auto-print switch (pos/ProfileScreen.jsx)
  'This terminal': 'Ushbu terminal',
  'Print kitchen tickets for orders from phones': 'Telefondan kelgan buyurtmalarni oshxonaga chiqarish',
  'Turn this on for ONE terminal only. Waitress phones cannot reach the kitchen printer directly, so this computer prints their orders.':
    'Buni FAQAT BITTA terminalda yoqing. Ofitsiant telefoni oshxona printeriga toʻgʻridan-toʻgʻri ulana olmaydi, shuning uchun ularning buyurtmalarini shu kompyuter chiqaradi.',
  // Printed on the physical receipt itself (see lib/receipt.js buildLabels) —
  // the slip a customer is handed must not be half-English.
  'Tax': 'Soliq',
  'Service': 'Xizmat haqi',
  'Change': 'Qaytim',
  'Method': "To'lov turi",
  'Split': "Bo'lib to'lash",
  'Bank Transfer': "Bank o'tkazmasi",
  // ('Close' is NOT re-added here — it already exists further down in this same
  //  dictionary; a duplicate key would silently win/lose depending on order.)
  'Cashier': 'Kassir',
  'Staff': 'Xodim',
  'coming in a later build step': 'keyingi bosqichda qo’shiladi',

  // ── Common / shared across screens ──────────────────────────────────────
  'All': 'Barchasi',
  'Table': 'Stol',
  'Select…': 'Tanlang…',
  'Back': 'Orqaga',
  'Cancel': 'Bekor qilish',
  'Confirm': 'Tasdiqlash',
  'Done': 'Tayyor',
  'Close': 'Yopish',
  'Remove': "O'chirish",
  'Print': 'Chop etish',
  'Edit': 'Tahrirlash',
  'Discard': "Bekor qilish",
  'Total': 'Jami',
  'Sub Total': 'Oraliq summa',
  'Subtotal': 'Oraliq summa',
  'Status': 'Holat',
  'Phone': 'Telefon',
  'Customer': 'Mijoz',
  'Waiter': 'Ofitsiant',
  'Notes': 'Izoh',
  'Dine In': 'Ichkarida',
  'Takeout': "Olib ketish",
  'Delivery': 'Yetkazib berish',
  'Available': "Bo'sh",
  'Occupied': 'Band',
  'Reserved': 'Bron qilingan',
  'Needs Bill': 'Hisob kerak',
  'tap a table to assign it': 'stolni belgilash uchun bosing',
  'Back to menu': 'Menyuga qaytish',
  'No table': "Stol yo'q",
  'Change Table': "Stolni o'zgartirish",
  'Payment failed': "To'lov amalga oshmadi",
  'Payment complete': "To'lov yakunlandi",
  'An order needs at least one item': 'Buyurtmada kamida bitta mahsulot bo’lishi kerak',
  'Dine-in orders need a table': 'Ichkarida buyurtmalar uchun stol kerak',
  'Failed to save changes': "O'zgarishlarni saqlab bo'lmadi",
  'Order updated': 'Buyurtma yangilandi',
  'Order type': 'Buyurtma turi',
  'just now': 'hozirgina',

  // ── Status pill labels (tokens.js statusPill's cap() output) ────────────
  'Free': "Bo'sh",
  'Served': 'Berildi',
  'Completed': 'Yakunlandi',
  'Paid': "To'landi",
  'Current': 'Joriy',
  'Present': 'Hozir',
  'Active Shift': 'Faol smena',
  'Overdue': "Muddati o'tgan",
  'Refunded': 'Qaytarildi',
  'Late': 'Kechikkan',
  'Preparing': 'Tayyorlanmoqda',
  'Due Soon': "Muddati yaqin",
  'Active': 'Faol',
  'Pending': 'Kutilmoqda',
  'Sent To Kitchen': 'Oshxonaga yuborildi',
  'Cleaning': 'Tozalanmoqda',
  'Bill Requested': "Hisob so'ralgan",
  'Ready': 'Tayyor',
  'Ready To Serve': 'Berishga tayyor',
  'Cancelled': 'Bekor qilindi',
  'Off': 'Ishda emas',
  'Absent': "Yo'q",

  // ── MenuScreen ────────────────────────────────────────────────────────────
  'Choose a table': 'Stol tanlang',
  'Category': 'Kategoriya',
  'No items found': 'Hech narsa topilmadi',
  'ADD': "QO'SHISH",
  'Order Details': 'Buyurtma tafsilotlari',
  'Customer name…': 'Mijoz ismi…',
  'Phone number…': 'Telefon raqami…',
  'Delivery address…': 'Yetkazib berish manzili…',
  'Already In This Order': 'Ushbu buyurtmada allaqachon bor',
  'Adding Now': 'Hozir qo’shilmoqda',
  'No new items yet': "Hali yangi mahsulot yo'q",
  'Cart is empty': "Savat bo'sh",
  'Add items from the menu': "Menyudan mahsulot qo'shing",
  'Already In Order': 'Buyurtmada mavjud',
  'New Order Total': 'Yangi buyurtma summasi',
  'not charged': 'undirilmaydi',
  'Please select a table for this dine-in order': 'Ushbu buyurtma uchun stol tanlang',
  'Receipt printing comes with the History step': 'Chek chop etish "Tarix" bo’limida qo’shiladi',
  'Failed to load menu data': "Menyu ma'lumotlarini yuklab bo'lmadi",
  'Order sent to kitchen': 'Buyurtma oshxonaga yuborildi',
  'Failed to add items to the order': "Buyurtmaga mahsulot qo'shib bo'lmadi",
  'Failed to send order': "Buyurtmani yuborib bo'lmadi",
  'Fire': 'Yuborish',
  'Add to Order': "Buyurtmaga qo'shish",

  // ── AmountPickerModal ─────────────────────────────────────────────────────
  'Add amount': "Qo'shimcha miqdor",
  'Enter amount': 'Miqdorni kiriting',
  'Amount to add': 'Qo’shiladigan miqdor',
  'Amount': 'Miqdor',
  'Or price': 'Yoki narx',
  'per': 'uchun',

  // ── PaymentModal ──────────────────────────────────────────────────────────
  'Cash': 'Naqd',
  'Card': 'Karta',
  'QR Code': 'QR kod',
  'Loan': 'Nasiya',
  'Process Payment': "To'lovni amalga oshirish",
  'Confirm Payment': "To'lovni tasdiqlash",
  'Order items': 'Buyurtma mahsulotlari',
  'Discount': 'Chegirma',
  'Payment method': "To'lov usuli",
  'Amount received': 'Qabul qilingan summa',
  'Change to give back': "Qaytariladigan qaytim",
  'Apply discount (optional)': "Chegirma qo'llash (ixtiyoriy)",
  'Split bill (optional)': 'Hisobni bo’lish (ixtiyoriy)',
  'Add payment notes…': "To'lov izohini kiriting…",
  'Payment Confirmed': "To'lov tasdiqlandi",
  'Mark every split part as paid before confirming': 'Tasdiqlashdan oldin har bir qismni "to‘landi" deb belgilang',
  "Loan split parts need the borrower's name and a due date": 'Nasiya qismlari uchun qarzdor ismi va muddati kerak',
  "Loan payments need the borrower's name and a due date": 'Nasiya uchun qarzdor ismi va muddati kerak',
  'Order will be marked paid. Debt is tracked in Receivables until the customer returns.':
    'Buyurtma to‘langan deb belgilanadi. Qarz mijoz qaytguncha "Nasiya" bo‘limida kuzatiladi.',
  'Customer name *': 'Mijoz ismi *',
  'Failed to create order': "Buyurtma yaratib bo'lmadi",
  'Payment failed — order was created but not paid, check Orders':
    "To'lov amalga oshmadi — buyurtma yaratildi, lekin to'lanmadi, Buyurtmalar bo'limini tekshiring",

  // ── OrdersScreen ──────────────────────────────────────────────────────────
  'All Orders': 'Barcha buyurtmalar',
  'No active orders': "Faol buyurtmalar yo'q",
  'Select an order': 'Buyurtmani tanlang',
  'Tap an order card to see its details': "Tafsilotlarni ko'rish uchun buyurtma kartasini bosing",
  'tap ADD to put an item on the order': "mahsulotni buyurtmaga qo'shish uchun QO'SHISH tugmasini bosing",
  'Tax & Fees': 'Soliq va yig’imlar',
  'Failed to load orders': "Buyurtmalarni yuklab bo'lmadi",

  // ── TablesScreen ──────────────────────────────────────────────────────────
  'Select a table': 'Stol tanlang',
  'Tap a table card to see its order': "Buyurtmani ko'rish uchun stol kartasini bosing",
  'Start an order on Menu': 'Menyuda buyurtma boshlang',
  'No tables': "Stollar yo'q",
  'Receipt printing comes with a future step': "Chek chop etish keyingi bosqichda qo'shiladi",

  // ── HistoryScreen ─────────────────────────────────────────────────────────
  "Today's Sales": 'Bugungi savdo',
  'Orders Completed': 'Yakunlangan buyurtmalar',
  'Avg Ticket': "O'rtacha chek",
  'Refunds': 'Qaytarilganlar',
  'Today': 'Bugun',
  'Yesterday': 'Kecha',
  'This Week': 'Shu hafta',
  'This Month': 'Shu oy',
  'Last Month': "O'tgan oy",
  'Custom': 'Boshqa',
  'Date & Time': 'Sana va vaqt',
  'Items': 'Mahsulotlar',
  'Payment': "To'lov",
  'No orders in this range': "Ushbu oraliqda buyurtmalar yo'q",
  'Refund reason': 'Qaytarish sababi',
  'Customer Complaint': 'Mijoz shikoyati',
  'Wrong Order': "Noto'g'ri buyurtma",
  'Duplicate Payment': 'Takroriy to‘lov',
  'Other': 'Boshqa',
  'Process Refund': 'Qaytarishni amalga oshirish',
  'Payment Method': "To'lov usuli",
  'Summary': 'Xulosa',
  'Service & Tax': 'Xizmat va soliq',
  'Total Paid': "To'langan summa",
  'Custom Range': 'Maxsus oraliq',
  'From': 'Dan',
  'To': 'Gacha',
  'Apply': "Qo'llash",
  'Failed to load history — is the backend reachable?': "Tarixni yuklab bo'lmadi — server ulanishini tekshiring",
  'Failed to load history': "Tarixni yuklab bo'lmadi",
  'Order refunded': 'Buyurtma qaytarildi',
  'Refund failed': 'Qaytarish amalga oshmadi',

  // ── ReceivablesScreen ─────────────────────────────────────────────────────
  'Total Outstanding': 'Umumiy qarz',
  'Customers with Balance': 'Qarzdor mijozlar',
  'Owed': 'Qarz',
  'Last Charge': 'Oxirgi xarid',
  'Due': 'Muddati',
  'No receivables in this filter': "Ushbu filtrda nasiya yo'q",
  'Record Payment': "To'lovni qayd etish",
  'Remind all overdue': "Barcha muddati o'tganlarni eslatish",
  'Loan Details': 'Nasiya tafsilotlari',
  'Paid On': "To'langan sana",
  'Due Date': 'Muddati',
  'Taken On': 'Olingan sana',
  'Order #': 'Buyurtma №',
  'Mark Paid': "To'langan deb belgilash",
  'Collect Loan Payment': 'Nasiya to‘lovini qabul qilish',
  'Total to collect': "Yig'iladigan summa",
  'Failed to load receivables — is the backend reachable?': "Nasiyani yuklab bo'lmadi — server ulanishini tekshiring",
  'Failed to load receivables': "Nasiyani yuklab bo'lmadi",
  'Failed to record payment': "To'lovni qayd etib bo'lmadi",
  'Payment recorded — loan marked paid': "To'lov qayd etildi — nasiya to'langan deb belgilandi",
  'Overdue reminders sent to admins/owners': 'Eslatmalar administratorlarga yuborildi',
  'Failed to send reminders': "Eslatmalarni yuborib bo'lmadi",
  'Failed to send reminder': "Eslatmani yuborib bo'lmadi",

  // ── ProfileScreen ─────────────────────────────────────────────────────────
  'On Shift': 'Ishda',
  'Off Shift': 'Ishda emas',
  'Shift Info': "Smena ma'lumoti",
  'Clocked In': 'Kelgan vaqti',
  'Shift Length': 'Smena davomiyligi',
  'Break': 'Tanaffus',
  'Clock Out': 'Ishdan chiqish',
  'Not clocked in yet today.': 'Bugun hali ishga kelmagansiz.',
  'Clock In': 'Ishga kelish',
  'Personal Details': "Shaxsiy ma'lumotlar",
  'Email': 'Email',
  'Hire Date': "Ishga qabul qilingan sana",
  'Orders Handled Today': 'Bugun bajarilgan buyurtmalar',
  'Sales Today': 'Bugungi savdo',
  'Avg Serve Time': "O'rtacha xizmat vaqti",
  'Failed to clock in': "Ishga kelishni qayd etib bo'lmadi",
  'Clocked in': 'Ishga kelindi',
  'Failed to clock out': "Ishdan chiqishni qayd etib bo'lmadi",
  'Clocked out': 'Ishdan chiqildi',
  "Can't reach server — shift status unknown": "Serverga ulanib bo'lmadi — smena holati noma'lum",
  'Retry': "Qayta urinish",
  "Couldn't refresh — showing last known status": "Yangilab bo'lmadi — oxirgi ma'lum holat ko'rsatilmoqda",
};

// Plain lookup: returns the Uzbek string if lang is 'UZ' and a translation
// exists, otherwise returns the original English string unchanged (silent,
// safe fallback — a missing dictionary entry never throws or shows "undefined").
export function t(str, lang) {
  if (lang !== 'UZ' || str == null) return str;
  return UZ[str] ?? str;
}

// Template variant for strings with a variable part ({n}, {time}, {amount}...).
// Pass the English template, the Uzbek template, and a vars object — both
// templates use the same {name} placeholders, substituted after picking the
// language. Keeping both templates as plain strings (not split across t())
// lets word order differ between languages, which a simple key-based lookup
// on the pre-composed string can't do.
export function tt(lang, enTemplate, uzTemplate, vars = {}) {
  const template = lang === 'UZ' ? uzTemplate : enTemplate;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// Shared "Table {n}" fallback used whenever a table has no custom `name` set
// — several screens build this same fallback inline (`Table ${n}`); centralized
// here so it's translated consistently everywhere instead of missed in one spot.
export function tableFallbackLabel(tableNumber, lang) {
  return tt(lang, 'Table {n}', 'Stol {n}', { n: tableNumber });
}
export function tableLabel(tb, lang) {
  return tb?.name || tableFallbackLabel(tb?.tableNumber, lang);
}
