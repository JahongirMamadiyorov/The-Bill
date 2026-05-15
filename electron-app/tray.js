'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let _tray        = null;
let _statusItem  = null;
let _callbacks   = {};

/**
 * Create the system tray icon and context menu.
 *
 * @param {object} opts
 * @param {string}   opts.iconPath     - Path to icon file
 * @param {Function} opts.onOpen       - Called when user clicks "Open"
 * @param {Function} opts.onQuit       - Called when user clicks "Quit"
 * @param {Function} opts.onCheckUpdate - Called when user clicks "Check for Updates"
 * @returns {Tray}
 */
function createTray({ iconPath, onOpen, onQuit, onCheckUpdate }) {
  _callbacks = { onOpen, onQuit, onCheckUpdate };

  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // macOS: use a 16x16 template image for menu bar
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 16, height: 16 });
      icon.setTemplateImage(true);
    }
  } catch (_) {
    icon = nativeImage.createEmpty();
  }

  _tray = new Tray(icon);
  _tray.setToolTip('The Bill — Kitchen Print Agent');

  buildMenu('Disconnected');

  // Windows: double-click opens window
  if (process.platform === 'win32') {
    _tray.on('double-click', () => onOpen && onOpen());
  }

  return _tray;
}

/**
 * Rebuild the context menu (needed to update dynamic items).
 * @param {string} statusLabel
 */
function buildMenu(statusLabel) {
  if (!_tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label:   'The Bill',
      enabled: false,
    },
    { type: 'separator' },
    {
      label:   `Status: ${statusLabel}`,
      enabled: false,
      id:      'status',
    },
    {
      label: 'Open',
      click: () => _callbacks.onOpen && _callbacks.onOpen(),
    },
    {
      label: 'Check for Updates',
      click: () => _callbacks.onCheckUpdate && _callbacks.onCheckUpdate(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => _callbacks.onQuit && _callbacks.onQuit(),
    },
  ]);

  _tray.setContextMenu(menu);
}

/**
 * Update the tray status label dynamically.
 * @param {'connected'|'disconnected'} status
 */
function updateTrayStatus(status) {
  const label = status === 'connected' ? 'Connected' : 'Disconnected';
  buildMenu(label);
}

module.exports = { createTray, updateTrayStatus };
