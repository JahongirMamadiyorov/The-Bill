// ── usePrinter — shared hook for receipt printing ────────────────────────────
// Stores the printer IP/port in localStorage (per-terminal).
// Exposes:
//   printerIp, printerPort  — current settings
//   setPrinterIp / Port     — update settings
//   printReceipt(data)      — send to printer via backend TCP, or fall back
//                             to browser window.print() if no IP configured
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { printAPI } from '../api/client';

const LS_IP   = 'receipt_printer_ip';
const LS_PORT = 'receipt_printer_port';

// ── Shared CSS injected once for browser-fallback print ──────────────────────
const STYLE_ID = '__receipt_style__';
const DIV_ID   = '__receipt_div__';

function ensurePrintStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @media print {
      body > *:not(#${DIV_ID}) { display: none !important; }
      #${DIV_ID} { display: block !important; }
      @page { size: 80mm auto; margin: 0; }
    }
    #${DIV_ID} {
      display: none;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #000;
      width: 72mm;
      margin: 0 auto;
      padding: 3mm 0;
    }
    #${DIV_ID} .center    { text-align: center; }
    #${DIV_ID} .rest-name { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
    #${DIV_ID} .dashed    { border-top: 1px dashed #555; margin: 5px 0; }
    #${DIV_ID} .row       { display: flex; justify-content: space-between; margin: 1.5px 0; word-break: break-word; }
    #${DIV_ID} .row-label { flex: 1; padding-right: 4px; }
    #${DIV_ID} .total-row { font-size: 13px; font-weight: bold; margin-top: 2px; }
    #${DIV_ID} .gray      { color: #444; font-size: 10px; }
    #${DIV_ID} .footer    { margin-top: 10px; font-size: 10px; color: #444; }
  `;
  document.head.appendChild(s);
}

function browserPrint(innerHtml) {
  ensurePrintStyles();
  let div = document.getElementById(DIV_ID);
  if (!div) {
    div = document.createElement('div');
    div.id = DIV_ID;
    document.body.appendChild(div);
  }
  div.innerHTML = innerHtml;
  const cleanup = () => {
    div.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePrinter() {
  const [printerIp,   setPrinterIpState]   = useState(() => localStorage.getItem(LS_IP)   || '');
  const [printerPort, setPrinterPortState] = useState(() => localStorage.getItem(LS_PORT) || '9100');
  const [printing,    setPrinting]         = useState(false);
  const [printError,  setPrintError]       = useState('');

  const setPrinterIp = useCallback((ip) => {
    const v = ip.trim();
    localStorage.setItem(LS_IP, v);
    setPrinterIpState(v);
  }, []);

  const setPrinterPort = useCallback((port) => {
    const v = String(port || 9100);
    localStorage.setItem(LS_PORT, v);
    setPrinterPortState(v);
  }, []);

  // receiptData shape:
  // { restaurantName, orderNum, tableName, dateTime,
  //   items: [{ name, qty, total }],
  //   subtotal, taxRate, tax, serviceRate, service,
  //   discountReason, discount,
  //   total, method, change, footer,
  //   // for browser fallback only:
  //   browserHtml: '<div>...</div>' }
  const printReceipt = useCallback(async (receiptData) => {
    setPrinting(true);
    setPrintError('');

    if (printerIp) {
      // ── Direct TCP print ──────────────────────────────────────────────────
      try {
        await printAPI.receipt(printerIp, Number(printerPort) || 9100, receiptData);
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || 'Printer error';
        setPrintError(msg);
        // Fall back to browser print so cashier is never stuck
        if (receiptData.browserHtml) browserPrint(receiptData.browserHtml);
      }
    } else {
      // ── Browser print fallback ────────────────────────────────────────────
      if (receiptData.browserHtml) browserPrint(receiptData.browserHtml);
    }

    setPrinting(false);
  }, [printerIp, printerPort]);

  return {
    printerIp,
    printerPort,
    setPrinterIp,
    setPrinterPort,
    printReceipt,
    printing,
    printError,
    clearPrintError: () => setPrintError(''),
  };
}
