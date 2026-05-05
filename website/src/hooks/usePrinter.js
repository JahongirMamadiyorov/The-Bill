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
    /* Receipt-only print. Hides the entire app and prints just the
       receipt card on a compact 80mm-wide auto-height page so a single
       short receipt does not balloon into multiple A4 sheets. */
    @media print {
      @page { size: 80mm auto; margin: 3mm 0; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body * { visibility: hidden !important; }
      #${DIV_ID}, #${DIV_ID} * { visibility: visible !important; }
      #${DIV_ID} {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        right: 0 !important;
        display: block !important;
        page-break-inside: avoid;
      }
    }
    #${DIV_ID} {
      display: none;
      font-family: 'Courier New', 'Menlo', monospace;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
      color: #000;
      width: 76mm;
      margin: 0 auto;
      padding: 3mm 2mm;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }
    #${DIV_ID} .center    { text-align: center; }
    #${DIV_ID} .rest-name { font-size: 22px; font-weight: 900; margin-bottom: 4px; letter-spacing: 0.5px; color: #000; }
    #${DIV_ID} .dashed    { border-top: 2px dashed #000; margin: 6px 0; }
    #${DIV_ID} .row       { display: flex; justify-content: space-between; align-items: baseline; margin: 3px 0; word-break: break-word; font-weight: 700; color: #000; }
    #${DIV_ID} .row-label { flex: 1; padding-right: 6px; }
    #${DIV_ID} .total-row { font-size: 20px; font-weight: 900; margin: 4px 0; color: #000; }
    #${DIV_ID} .gray      { color: #000; font-size: 15px; font-weight: 800; margin: 2px 0; }
    #${DIV_ID} .green     { color: #000; font-weight: 700; }
    #${DIV_ID} .footer    { margin-top: 10px; font-size: 15px; color: #000; font-weight: 800; }
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
