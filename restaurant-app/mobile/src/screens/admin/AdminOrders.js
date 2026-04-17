import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  PanResponder, Animated, Dimensions, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { ordersAPI, tablesAPI, usersAPI, menuAPI } from '../../api/client';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH    = 160; // Edit btn (80) + Delete btn (80)

const STATUS_COLORS = {
  pending:         '#F39C12',
  sent_to_kitchen: '#8E44AD',
  preparing:       '#2980B9',
  ready:           '#27AE60',
  served:          '#95A5A6',
  paid:            '#2ECC71',
  cancelled:       '#E74C3C',
};

const NEXT_STATUS = {
  pending:         'sent_to_kitchen',
  sent_to_kitchen: 'preparing',
  preparing:       'ready',
  ready:           'served',
  served:          'paid',
};

const DELETE_REASONS  = ['Duplicate Entry', 'Wrong Table', 'Test Order', 'Other'];
const PAYMENT_METHODS = ['cash', 'card', 'online'];

const fmt   = (n)  => `${parseFloat(n || 0).toFixed(0)} so'm`;
const fmtSt = (s)  => (s || '').replace(/_/g, ' ');

// ─── Toast Container ──────────────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <View style={s.toastWrap} pointerEvents="none">
      {toasts.map(t => (
        <View key={t.id} style={[s.toast, s[`toast_${t.type}`]]}>
          <Text style={s.toastTxt}>{t.message}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Swipeable Card ───────────────────────────────────────────────────────────
function SwipeableCard({ order, onEdit, onDelete, onAdvance, onLongPress }) {
  const tx     = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const spring = (toValue) =>
    Animated.spring(tx, { toValue, useNativeDriver: true, tension: 120, friction: 11 }).start();

  const openCard  = () => { spring(-ACTION_WIDTH); isOpen.current = true; };
  const closeCard = () => { spring(0);             isOpen.current = false; };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        const nx   = base + g.dx;
        if (nx <= 0) tx.setValue(Math.max(nx, -ACTION_WIDTH));
      },
      onPanResponderRelease: (_, g) => {
        const base = isOpen.current ? -ACTION_WIDTH : 0;
        const nx   = base + g.dx;
        if (nx < -SWIPE_THRESHOLD) openCard();
        else closeCard();
      },
    })
  ).current;

  const nextSt      = NEXT_STATUS[order.status];
  const isCancelled = order.status === 'cancelled';

  return (
    <View style={s.cardWrap}>
      {/* Hidden action buttons */}
      <View style={s.cardActions}>
        {!isCancelled && (
          <TouchableOpacity
            style={[s.actionBtn, s.actionEdit]}
            onPress={() => { closeCard(); setTimeout(() => onEdit(order), 200); }}
          >
            <Text style={s.actionIcon}>✏️</Text>
            <Text style={s.actionLabel}>Edit</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.actionBtn, s.actionDelete]}
          onPress={() => { closeCard(); setTimeout(() => onDelete(order), 200); }}
        >
          <Text style={s.actionIcon}>🗑️</Text>
          <Text style={s.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Sliding card */}
      <Animated.View style={[s.card, { transform: [{ translateX: tx }] }]} {...pan.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.97}
          onPress={() => { if (isOpen.current) closeCard(); }}
          onLongPress={() => { if (isOpen.current) { closeCard(); } else { onLongPress(order); } }}
          delayLongPress={400}
        >
          <View style={s.cardHead}>
            <Text style={s.tableNum}>Table {order.table_number}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLORS[order.status] + '22', borderColor: STATUS_COLORS[order.status] }]}>
              <Text style={[s.badgeTxt, { color: STATUS_COLORS[order.status] }]}>{fmtSt(order.status)}</Text>
            </View>
          </View>

          <Text style={s.waitressTxt}>👤 {order.waitress_name}</Text>
          {!!order.guests && <Text style={s.guestsTxt}>👥 {order.guests} guests</Text>}

          <Text style={s.totalTxt}>{fmt(order.total_amount)}</Text>

          {order.items && order.items.length > 0 && (
            <Text style={s.itemsSummary} numberOfLines={1}>
              {order.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
            </Text>
          )}

          {nextSt && (
            <TouchableOpacity style={s.advBtn} onPress={() => onAdvance(order.id, nextSt)}>
              <Text style={s.advBtnTxt}>→ Mark as {fmtSt(nextSt)}</Text>
            </TouchableOpacity>
          )}

          <Text style={s.swipeHint}>← swipe to edit / delete</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Action Sheet Modal (long-press) ─────────────────────────────────────────
function ActionSheetModal({ visible, order, onClose, onEdit, onDelete, onAdvance }) {
  if (!order) return null;
  const nextSt      = NEXT_STATUS[order.status];
  const isCancelled = order.status === 'cancelled';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.overlay} />
        </TouchableWithoutFeedback>

        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Order – Table {order.table_number}</Text>
          <Text style={s.sheetSub}>{fmtSt(order.status)} · {fmt(order.total_amount)}</Text>

          {nextSt && (
            <TouchableOpacity style={s.sheetRow} onPress={() => { onClose(); onAdvance(order.id, nextSt); }}>
              <Text style={s.sheetRowIcon}>⬆️</Text>
              <Text style={s.sheetRowTxt}>Mark as {fmtSt(nextSt)}</Text>
            </TouchableOpacity>
          )}

          {!isCancelled && (
            <TouchableOpacity style={s.sheetRow} onPress={() => { onClose(); setTimeout(() => onEdit(order), 300); }}>
              <Text style={s.sheetRowIcon}>✏️</Text>
              <Text style={s.sheetRowTxt}>Edit Order</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.sheetRow} onPress={() => { onClose(); setTimeout(() => onDelete(order), 300); }}>
            <Text style={s.sheetRowIcon}>🗑️</Text>
            <Text style={[s.sheetRowTxt, { color: '#E74C3C' }]}>Delete Order</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.sheetRow, { borderBottomWidth: 0, marginTop: 4 }]} onPress={onClose}>
            <Text style={[s.sheetRowTxt, { color: '#888', flex: 1, textAlign: 'center' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ visible, order, onClose, onConfirm }) {
  const [reason,       setReason]       = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading,      setLoading]      = useState(false);

  const isPaid = order?.status === 'paid';

  useEffect(() => {
    if (visible) { setReason(''); setCustomReason(''); }
  }, [visible]);

  const canConfirm = !isPaid || (reason && (reason !== 'Other' || customReason.trim()));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    const finalReason = reason === 'Other' ? customReason.trim() : reason;
    await onConfirm(order, finalReason || undefined);
    setLoading(false);
  };

  if (!order) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.overlay} />
        </TouchableWithoutFeedback>

        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.deleteTitle}>Delete Order?</Text>

          <View style={s.deleteInfoBox}>
            {[
              ['Table',    String(order.table_number)],
              ['Waitress', order.waitress_name],
              ['Total',    fmt(order.total_amount)],
            ].map(([label, val]) => (
              <View key={label} style={s.deleteInfoRow}>
                <Text style={s.deleteInfoLbl}>{label}</Text>
                <Text style={[s.deleteInfoVal, label === 'Total' && { color: '#E74C3C', fontWeight: 'bold' }]}>{val}</Text>
              </View>
            ))}
            <View style={s.deleteInfoRow}>
              <Text style={s.deleteInfoLbl}>Status</Text>
              <View style={[s.badge, { backgroundColor: STATUS_COLORS[order.status] + '22', borderColor: STATUS_COLORS[order.status] }]}>
                <Text style={[s.badgeTxt, { color: STATUS_COLORS[order.status] }]}>{fmtSt(order.status)}</Text>
              </View>
            </View>
          </View>

          {isPaid && (
            <>
              <Text style={s.reasonLabel}>
                Reason for deletion <Text style={{ color: '#E74C3C' }}>*</Text>
              </Text>
              <View style={s.chipRow}>
                {DELETE_REASONS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.chip, reason === r && s.chipSel]}
                    onPress={() => setReason(r)}
                  >
                    <Text style={[s.chipTxt, reason === r && s.chipTxtSel]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reason === 'Other' && (
                <TextInput
                  style={s.reasonInput}
                  placeholder="Describe reason…"
                  value={customReason}
                  onChangeText={setCustomReason}
                  multiline
                  maxLength={200}
                />
              )}
            </>
          )}

          <View style={s.rowBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.deleteBtn, !canConfirm && s.disabled]}
              onPress={handleConfirm}
              disabled={!canConfirm || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.deleteBtnTxt}>Delete</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Current Order Modal (full-screen) ───────────────────────────────────
function EditCurrentModal({ visible, order, onClose, onSave }) {
  const [tables,     setTables]     = useState([]);
  const [staff,      setStaff]      = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [items,      setItems]      = useState([]);
  const [tableId,    setTableId]    = useState('');
  const [waitressId, setWaitressId] = useState('');
  const [guests,     setGuests]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [search,     setSearch]     = useState('');
  const [showTblPkr, setShowTblPkr] = useState(false);
  const [showWtrPkr, setShowWtrPkr] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [dataLoading,setDataLoading]= useState(false);

  const isKitchenBusy = order && ['preparing', 'ready'].includes(order.status);

  useEffect(() => {
    if (visible && order) {
      setItems((order.items || []).map(i => ({ ...i })));
      setTableId(order.table_id    || '');
      setWaitressId(order.waitress_id || '');
      setGuests(String(order.guests || ''));
      setNotes(order.notes || '');
      setSearch('');
      fetchData();
    }
  }, [visible, order]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const [tabRes, usrRes, mnuRes] = await Promise.all([
        tablesAPI.getAll(),
        usersAPI.getAll(),
        menuAPI.getItems(),
      ]);
      setTables(tabRes.data || []);
      setStaff((usrRes.data || []).filter(u => ['waitress', 'admin', 'owner'].includes(u.role)));
      setMenuItems(mnuRes.data || []);
    } catch { }
    setDataLoading(false);
  };

  const total = items.reduce((sum, i) => sum + parseFloat(i.price || 0) * (i.quantity || 1), 0);

  const changeQty = (idx, delta) =>
    setItems(prev => {
      const next = [...prev];
      const newQ = (next[idx].quantity || 1) + delta;
      if (newQ <= 0) next.splice(idx, 1);
      else next[idx] = { ...next[idx], quantity: newQ };
      return next;
    });

  const addItem = (m) => {
    setItems(prev => {
      const ei = prev.findIndex(i => (i.menu_item_id || i.id) === m.id);
      if (ei >= 0) {
        const next = [...prev];
        next[ei] = { ...next[ei], quantity: (next[ei].quantity || 1) + 1 };
        return next;
      }
      return [...prev, { menu_item_id: m.id, name: m.name, price: m.price, quantity: 1 }];
    });
    setSearch('');
  };

  const filteredMenu = search.length > 1
    ? menuItems.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  const selTable    = tables.find(t => t.id === tableId);
  const selWaitress = staff.find(w => w.id === waitressId);

  const handleSave = async () => {
    if (items.length === 0) return;
    setLoading(true);
    await onSave(order.id, {
      table_id:    tableId,
      waitress_id: waitressId,
      guests:      parseInt(guests) || undefined,
      notes,
      items,
    });
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

          {/* Header */}
          <View style={s.editHead}>
            <TouchableOpacity style={s.editHeadBtn} onPress={onClose}>
              <Text style={s.editHeadCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.editHeadTitle}>Edit Order</Text>
            <TouchableOpacity
              style={[s.editHeadBtn, (loading || items.length === 0) && s.disabled]}
              onPress={handleSave}
              disabled={loading || items.length === 0}
            >
              {loading
                ? <ActivityIndicator color="#2980B9" size="small" />
                : <Text style={s.editHeadSave}>Save</Text>}
            </TouchableOpacity>
          </View>

          {isKitchenBusy && (
            <View style={s.kitchenWarn}>
              <Text style={s.kitchenWarnTxt}>⚠️ This order is in the kitchen. Changes may cause confusion.</Text>
            </View>
          )}

          {dataLoading && <ActivityIndicator color="#2980B9" style={{ marginTop: 20 }} />}

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

            {/* Table */}
            <View style={s.editSec}>
              <Text style={s.editLbl}>Table</Text>
              <TouchableOpacity style={s.pickerRow} onPress={() => setShowTblPkr(true)}>
                <Text style={s.pickerRowTxt}>{selTable ? `Table ${selTable.number}` : 'Select table…'}</Text>
                <Text style={{ color: '#aaa' }}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Waitress */}
            <View style={s.editSec}>
              <Text style={s.editLbl}>Waitress</Text>
              <TouchableOpacity style={s.pickerRow} onPress={() => setShowWtrPkr(true)}>
                <Text style={s.pickerRowTxt}>{selWaitress ? selWaitress.name : 'Select waitress…'}</Text>
                <Text style={{ color: '#aaa' }}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Guests */}
            <View style={s.editSec}>
              <Text style={s.editLbl}>Guests</Text>
              <TextInput
                style={s.input}
                value={guests}
                onChangeText={setGuests}
                keyboardType="number-pad"
                placeholder="Number of guests"
                maxLength={3}
              />
            </View>

            {/* Items */}
            <View style={s.editSec}>
              <Text style={s.editLbl}>Order Items</Text>

              {items.map((item, idx) => (
                <View key={idx} style={s.itemRow}>
                  <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.itemPrice}>{fmt((item.price || 0) * item.quantity)}</Text>
                  <View style={s.qtyRow}>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => changeQty(idx, -1)}>
                      <Text style={s.qtyBtnTxt}>{item.quantity === 1 ? '🗑' : '−'}</Text>
                    </TouchableOpacity>
                    <Text style={s.qtyVal}>{item.quantity}</Text>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => changeQty(idx, 1)}>
                      <Text style={s.qtyBtnTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Menu search */}
              <TextInput
                style={[s.input, { marginTop: 12 }]}
                value={search}
                onChangeText={setSearch}
                placeholder="🔍 Search menu to add items…"
              />
              {filteredMenu.length > 0 && (
                <View style={s.menuDropdown}>
                  {filteredMenu.map(m => (
                    <TouchableOpacity key={m.id} style={s.menuDropdownItem} onPress={() => addItem(m)}>
                      <Text style={s.menuDropdownName}>{m.name}</Text>
                      <Text style={s.menuDropdownPrice}>{fmt(m.price)} +</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Notes */}
            <View style={s.editSec}>
              <Text style={s.editLbl}>Notes</Text>
              <TextInput
                style={[s.input, { minHeight: 80 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Order notes…"
                multiline
                maxLength={500}
              />
            </View>

            {/* Total */}
            <View style={s.totalBar}>
              <Text style={s.totalBarLbl}>Total</Text>
              <Text style={s.totalBarVal}>{fmt(total)}</Text>
            </View>

            <View style={{ height: 50 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Table Picker */}
        <Modal visible={showTblPkr} transparent animationType="slide" onRequestClose={() => setShowTblPkr(false)}>
          <View style={s.modalRoot}>
            <TouchableWithoutFeedback onPress={() => setShowTblPkr(false)}>
              <View style={s.overlay} />
            </TouchableWithoutFeedback>
            <View style={s.pickerSheet}>
              <Text style={s.pickerSheetTitle}>Select Table</Text>
              <ScrollView>
                {tables.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.pickerItem, tableId === t.id && s.pickerItemSel]}
                    onPress={() => { setTableId(t.id); setShowTblPkr(false); }}
                  >
                    <Text style={[s.pickerItemTxt, tableId === t.id && s.pickerItemTxtSel]}>Table {t.number}</Text>
                    {tableId === t.id && <Text style={{ color: '#2980B9' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Waitress Picker */}
        <Modal visible={showWtrPkr} transparent animationType="slide" onRequestClose={() => setShowWtrPkr(false)}>
          <View style={s.modalRoot}>
            <TouchableWithoutFeedback onPress={() => setShowWtrPkr(false)}>
              <View style={s.overlay} />
            </TouchableWithoutFeedback>
            <View style={s.pickerSheet}>
              <Text style={s.pickerSheetTitle}>Select Waitress</Text>
              <ScrollView>
                {staff.map(w => (
                  <TouchableOpacity
                    key={w.id}
                    style={[s.pickerItem, waitressId === w.id && s.pickerItemSel]}
                    onPress={() => { setWaitressId(w.id); setShowWtrPkr(false); }}
                  >
                    <Text style={[s.pickerItemTxt, waitressId === w.id && s.pickerItemTxtSel]}>{w.name}</Text>
                    {waitressId === w.id && <Text style={{ color: '#2980B9' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Edit Paid Order Modal (bottom sheet) ─────────────────────────────────────
function EditPaidModal({ visible, order, onClose, onSave }) {
  const [tables,     setTables]     = useState([]);
  const [staff,      setStaff]      = useState([]);
  const [payMethod,  setPayMethod]  = useState('cash');
  const [waitressId, setWaitressId] = useState('');
  const [tableId,    setTableId]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [showTblPkr, setShowTblPkr] = useState(false);
  const [showWtrPkr, setShowWtrPkr] = useState(false);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    if (visible && order) {
      setPayMethod(order.payment_method || 'cash');
      setWaitressId(order.waitress_id   || '');
      setTableId(order.table_id         || '');
      setNotes(order.notes              || '');
      fetchData();
    }
  }, [visible, order]);

  const fetchData = async () => {
    try {
      const [tabRes, usrRes] = await Promise.all([tablesAPI.getAll(), usersAPI.getAll()]);
      setTables(tabRes.data || []);
      setStaff((usrRes.data || []).filter(u => ['waitress', 'admin', 'owner'].includes(u.role)));
    } catch { }
  };

  const selTable    = tables.find(t => t.id === tableId);
  const selWaitress = staff.find(w => w.id === waitressId);

  const handleSave = async () => {
    setLoading(true);
    await onSave(order.id, { payment_method: payMethod, waitress_id: waitressId, table_id: tableId, notes });
    setLoading(false);
  };

  if (!order) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
        >
          <ScrollView
            style={s.paidSheet}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={s.handle} />
            <Text style={s.paidTitle}>Edit Paid Order – Table {order.table_number}</Text>

            {/* Read-only items */}
            {order.items && order.items.length > 0 && (
              <View style={s.paidItemsBox}>
                {order.items.map((item, idx) => (
                  <View key={idx} style={s.paidItemRow}>
                    <Text style={s.paidItemName}>{item.quantity}× {item.name}</Text>
                    <Text style={s.paidItemPrice}>{fmt((item.price || 0) * item.quantity)}</Text>
                  </View>
                ))}
                <View style={[s.paidItemRow, s.paidItemTotal]}>
                  <Text style={{ fontWeight: 'bold', color: '#333' }}>Total</Text>
                  <Text style={{ fontWeight: 'bold', color: '#333' }}>{fmt(order.total_amount)}</Text>
                </View>
              </View>
            )}

            {/* Payment method */}
            <Text style={s.editLbl}>Payment Method</Text>
            <View style={s.payRow}>
              {PAYMENT_METHODS.map(pm => (
                <TouchableOpacity
                  key={pm}
                  style={[s.payChip, payMethod === pm && s.payChipSel]}
                  onPress={() => setPayMethod(pm)}
                >
                  <Text style={[s.payChipTxt, payMethod === pm && s.payChipTxtSel]}>
                    {pm.charAt(0).toUpperCase() + pm.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Waitress */}
            <Text style={s.editLbl}>Waitress</Text>
            <TouchableOpacity style={s.pickerRow} onPress={() => setShowWtrPkr(true)}>
              <Text style={s.pickerRowTxt}>{selWaitress ? selWaitress.name : 'Select…'}</Text>
              <Text style={{ color: '#aaa' }}>▼</Text>
            </TouchableOpacity>

            {/* Table */}
            <Text style={[s.editLbl, { marginTop: 14 }]}>Table</Text>
            <TouchableOpacity style={s.pickerRow} onPress={() => setShowTblPkr(true)}>
              <Text style={s.pickerRowTxt}>{selTable ? `Table ${selTable.number}` : 'Select…'}</Text>
              <Text style={{ color: '#aaa' }}>▼</Text>
            </TouchableOpacity>

            {/* Notes */}
            <Text style={[s.editLbl, { marginTop: 14 }]}>Internal Notes</Text>
            <TextInput
              style={[s.input, { minHeight: 70 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Internal notes…"
              multiline
              maxLength={300}
            />

            <View style={[s.rowBtns, { marginTop: 16, marginBottom: 30 }]}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, loading && s.disabled]} onPress={handleSave} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveBtnTxt}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Table Picker */}
        <Modal visible={showTblPkr} transparent animationType="slide" onRequestClose={() => setShowTblPkr(false)}>
          <View style={s.modalRoot}>
            <TouchableWithoutFeedback onPress={() => setShowTblPkr(false)}>
              <View style={s.overlay} />
            </TouchableWithoutFeedback>
            <View style={s.pickerSheet}>
              <Text style={s.pickerSheetTitle}>Select Table</Text>
              <ScrollView>
                {tables.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.pickerItem, tableId === t.id && s.pickerItemSel]}
                    onPress={() => { setTableId(t.id); setShowTblPkr(false); }}
                  >
                    <Text style={[s.pickerItemTxt, tableId === t.id && s.pickerItemTxtSel]}>Table {t.number}</Text>
                    {tableId === t.id && <Text style={{ color: '#2980B9' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Waitress Picker */}
        <Modal visible={showWtrPkr} transparent animationType="slide" onRequestClose={() => setShowWtrPkr(false)}>
          <View style={s.modalRoot}>
            <TouchableWithoutFeedback onPress={() => setShowWtrPkr(false)}>
              <View style={s.overlay} />
            </TouchableWithoutFeedback>
            <View style={s.pickerSheet}>
              <Text style={s.pickerSheetTitle}>Select Waitress</Text>
              <ScrollView>
                {staff.map(w => (
                  <TouchableOpacity
                    key={w.id}
                    style={[s.pickerItem, waitressId === w.id && s.pickerItemSel]}
                    onPress={() => { setWaitressId(w.id); setShowWtrPkr(false); }}
                  >
                    <Text style={[s.pickerItemTxt, waitressId === w.id && s.pickerItemTxtSel]}>{w.name}</Text>
                    {waitressId === w.id && <Text style={{ color: '#2980B9' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminOrders() {
  const [orders,      setOrders]      = useState([]);
  const [refreshing,  setRefreshing]  = useState(false);
  const [filter,      setFilter]      = useState('active');
  const [toasts,      setToasts]      = useState([]);
  const timerRefs = useRef({});

  const [selOrder,       setSelOrder]       = useState(null);
  const [showActionSht,  setShowActionSht]  = useState(false);
  const [showDeleteConf, setShowDeleteConf] = useState(false);
  const [showEditCur,    setShowEditCur]    = useState(false);
  const [showEditPaid,   setShowEditPaid]   = useState(false);

  // ── toast helper ──
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    timerRefs.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timerRefs.current[id];
    }, 3000);
  }, []);

  useEffect(() => () => Object.values(timerRefs.current).forEach(clearTimeout), []);

  // ── load ──
  const load = useCallback(async () => {
    try {
      const res = await ordersAPI.getAll();
      const all = res.data || [];
      let filtered;
      if (filter === 'active')    filtered = all.filter(o => !['paid', 'cancelled'].includes(o.status));
      else if (filter === 'paid') filtered = all.filter(o => o.status === 'paid');
      else                        filtered = all.filter(o => o.status === 'cancelled');
      setOrders(filtered);
    } catch {
      toast('Failed to load orders', 'error');
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // ── status advance ──
  const advance = async (id, status) => {
    try {
      await ordersAPI.updateStatus(id, status);
      toast(`Marked as ${fmtSt(status)}`);
      load();
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  // ── edit ──
  const handleEdit = (order) => {
    setSelOrder(order);
    if (order.status === 'paid') setShowEditPaid(true);
    else setShowEditCur(true);
  };

  // ── delete flow ──
  const handleDeletePress = (order) => { setSelOrder(order); setShowDeleteConf(true); };

  const handleDeleteConfirm = async (order, reason) => {
    try {
      await ordersAPI.deleteOrder(order.id, reason ? { reason } : undefined);
      setShowDeleteConf(false);
      setSelOrder(null);
      toast('Order deleted');
      load();
    } catch {
      toast('Failed to delete order', 'error');
    }
  };

  // ── long press ──
  const handleLongPress = (order) => { setSelOrder(order); setShowActionSht(true); };

  // ── save edits ──
  const saveCurrentEdit = async (id, data) => {
    try {
      await ordersAPI.update(id, data);
      setShowEditCur(false);
      setSelOrder(null);
      toast('Order updated');
      load();
    } catch {
      toast('Failed to update order', 'error');
    }
  };

  const savePaidEdit = async (id, data) => {
    try {
      await ordersAPI.update(id, data);
      setShowEditPaid(false);
      setSelOrder(null);
      toast('Order updated');
      load();
    } catch {
      toast('Failed to update order', 'error');
    }
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTxt}>📋 Orders</Text>
      </View>

      {/* Filter tabs */}
      <View style={s.filters}>
        {[
          { key: 'active',    label: 'Active'    },
          { key: 'paid',      label: 'Paid'      },
          { key: 'cancelled', label: 'Cancelled' },
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterTxt, filter === f.key && s.filterTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={orders}
        keyExtractor={o => String(o.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 50 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No {filter} orders</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SwipeableCard
            order={item}
            onEdit={handleEdit}
            onDelete={handleDeletePress}
            onAdvance={advance}
            onLongPress={handleLongPress}
          />
        )}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} />

      {/* Action Sheet */}
      <ActionSheetModal
        visible={showActionSht}
        order={selOrder}
        onClose={() => setShowActionSht(false)}
        onEdit={handleEdit}
        onDelete={handleDeletePress}
        onAdvance={advance}
      />

      {/* Delete Confirm */}
      <DeleteConfirmModal
        visible={showDeleteConf}
        order={selOrder}
        onClose={() => { setShowDeleteConf(false); setSelOrder(null); }}
        onConfirm={handleDeleteConfirm}
      />

      {/* Edit Current */}
      <EditCurrentModal
        visible={showEditCur}
        order={selOrder}
        onClose={() => { setShowEditCur(false); setSelOrder(null); }}
        onSave={saveCurrentEdit}
      />

      {/* Edit Paid */}
      <EditPaidModal
        visible={showEditPaid}
        order={selOrder}
        onClose={() => { setShowEditPaid(false); setSelOrder(null); }}
        onSave={savePaidEdit}
      />
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F4F6F8' },

  // Header / filters
  header:          { backgroundColor: '#2980B9', padding: 20, paddingTop: 50 },
  headerTxt:       { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  filters:         { flexDirection: 'row', backgroundColor: '#fff', elevation: 1 },
  filterBtn:       { flex: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  filterBtnActive: { borderBottomWidth: 2, borderBottomColor: '#2980B9' },
  filterTxt:       { color: '#888', fontWeight: '600', fontSize: 13 },
  filterTxtActive: { color: '#2980B9' },

  // Card
  cardWrap:    { marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  cardActions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  actionBtn:   { width: 80, justifyContent: 'center', alignItems: 'center' },
  actionEdit:  { backgroundColor: '#2980B9' },
  actionDelete:{ backgroundColor: '#E74C3C' },
  actionIcon:  { fontSize: 22 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 2 },
  cardHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tableNum:    { fontSize: 18, fontWeight: 'bold', color: '#333' },
  badge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeTxt:    { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  waitressTxt: { color: '#888', fontSize: 13, marginBottom: 2 },
  guestsTxt:   { color: '#aaa', fontSize: 12, marginBottom: 2 },
  totalTxt:    { fontWeight: 'bold', fontSize: 16, color: '#333', marginBottom: 6 },
  itemsSummary:{ color: '#bbb', fontSize: 12, marginBottom: 8 },
  advBtn:      { backgroundColor: '#EBF5FB', padding: 10, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  advBtnTxt:   { color: '#2980B9', fontWeight: '600', fontSize: 13 },
  swipeHint:   { color: '#ddd', fontSize: 10, marginTop: 6, textAlign: 'right' },

  // Shared modal
  modalRoot: { flex: 1 },
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  handle:    { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheet:     {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 36,
  },

  // Action sheet
  sheetTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sheetSub:   { fontSize: 13, color: '#888', marginBottom: 16, textTransform: 'capitalize' },
  sheetRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', minHeight: 52 },
  sheetRowIcon: { fontSize: 20, marginRight: 14 },
  sheetRowTxt:  { fontSize: 15, color: '#333', fontWeight: '500' },

  // Delete modal
  deleteTitle:    { fontSize: 18, fontWeight: 'bold', color: '#E74C3C', textAlign: 'center', marginBottom: 16 },
  deleteInfoBox:  { backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14, marginBottom: 16 },
  deleteInfoRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deleteInfoLbl:  { color: '#888', fontSize: 13 },
  deleteInfoVal:  { color: '#333', fontSize: 14, fontWeight: '600' },
  reasonLabel:    { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip:           { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f9f9f9', marginRight: 8, marginBottom: 8, minHeight: 36 },
  chipSel:        { borderColor: '#E74C3C', backgroundColor: '#FFF0F0' },
  chipTxt:        { fontSize: 13, color: '#555' },
  chipTxtSel:     { color: '#E74C3C', fontWeight: '600' },
  reasonInput:    { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, marginBottom: 12 },

  // Shared buttons
  rowBtns:    { flexDirection: 'row', marginTop: 12 },
  cancelBtn:  { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', minHeight: 50, justifyContent: 'center', marginRight: 8 },
  cancelBtnTxt: { color: '#666', fontWeight: '600', fontSize: 15 },
  deleteBtn:  { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#E74C3C', alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  deleteBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  saveBtn:    { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2980B9', alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  disabled:   { opacity: 0.45 },

  // Edit current
  editHead:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  editHeadBtn:    { minWidth: 64, minHeight: 44, justifyContent: 'center', padding: 8 },
  editHeadCancel: { fontSize: 15, color: '#888' },
  editHeadTitle:  { fontSize: 17, fontWeight: 'bold', color: '#333' },
  editHeadSave:   { fontSize: 15, color: '#2980B9', fontWeight: 'bold', textAlign: 'right' },
  kitchenWarn:    { backgroundColor: '#FFF3CD', padding: 12 },
  kitchenWarnTxt: { color: '#856404', fontSize: 13 },
  editSec:        { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  editLbl:        { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  pickerRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F6F8', borderRadius: 10, padding: 14, minHeight: 48 },
  pickerRowTxt:   { fontSize: 15, color: '#333', flex: 1 },
  input:          { backgroundColor: '#F4F6F8', borderRadius: 10, padding: 14, fontSize: 15, color: '#333', textAlignVertical: 'top' },
  itemRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemName:       { flex: 1, fontSize: 14, color: '#333' },
  itemPrice:      { fontSize: 13, color: '#999', marginRight: 10, minWidth: 80, textAlign: 'right' },
  qtyRow:         { flexDirection: 'row', alignItems: 'center' },
  qtyBtn:         { width: 36, height: 36, borderRadius: 8, backgroundColor: '#EBF5FB', justifyContent: 'center', alignItems: 'center' },
  qtyBtnTxt:      { fontSize: 16, color: '#2980B9', fontWeight: 'bold' },
  qtyVal:         { fontSize: 16, fontWeight: 'bold', color: '#333', marginHorizontal: 10, minWidth: 20, textAlign: 'center' },
  menuDropdown:   { backgroundColor: '#fff', borderRadius: 10, elevation: 6, borderWidth: 1, borderColor: '#eee', marginTop: 4 },
  menuDropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f4f4f4', minHeight: 50 },
  menuDropdownName: { fontSize: 14, color: '#333', flex: 1 },
  menuDropdownPrice:{ fontSize: 13, color: '#2980B9', fontWeight: '600' },
  totalBar:       { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#EBF5FB' },
  totalBarLbl:    { fontSize: 16, fontWeight: 'bold', color: '#333' },
  totalBarVal:    { fontSize: 18, fontWeight: 'bold', color: '#2980B9' },

  // Picker sheet
  pickerSheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_HEIGHT * 0.5, padding: 16, paddingBottom: 30 },
  pickerSheetTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  pickerItem:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', minHeight: 50 },
  pickerItemSel:    { backgroundColor: '#EBF5FB' },
  pickerItemTxt:    { fontSize: 15, color: '#333', flex: 1 },
  pickerItemTxtSel: { color: '#2980B9', fontWeight: 'bold' },

  // Edit paid sheet
  paidSheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: SCREEN_HEIGHT * 0.88 },
  paidTitle:      { fontSize: 17, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 16 },
  paidItemsBox:   { backgroundColor: '#F4F6F8', borderRadius: 10, padding: 12, marginBottom: 16 },
  paidItemRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  paidItemTotal:  { borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 6, paddingTop: 6 },
  paidItemName:   { fontSize: 13, color: '#555', flex: 1 },
  paidItemPrice:  { fontSize: 13, color: '#333', fontWeight: '600' },
  payRow:         { flexDirection: 'row', marginBottom: 14 },
  payChip:        { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', minHeight: 44, justifyContent: 'center', marginRight: 8 },
  payChipSel:     { borderColor: '#2980B9', backgroundColor: '#EBF5FB' },
  payChipTxt:     { fontSize: 14, color: '#555', fontWeight: '500' },
  payChipTxtSel:  { color: '#2980B9', fontWeight: 'bold' },

  // Toast
  toastWrap:     { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 9999 },
  toast:         { borderRadius: 10, padding: 14, marginBottom: 8, elevation: 10 },
  toast_success: { backgroundColor: '#27AE60' },
  toast_error:   { backgroundColor: '#E74C3C' },
  toast_warning: { backgroundColor: '#F39C12' },
  toastTxt:      { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Empty state
  empty:    { alignItems: 'center', marginTop: 70 },
  emptyTxt: { color: '#bbb', fontSize: 16 },
});
