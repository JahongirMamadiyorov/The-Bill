// Custom PowerSync worker entry point — replaces @powersync/node's own default worker
// (lib/db/DefaultWorker.js). See main.js's resolvePowerSyncExtensionPath()/getPowerSync()
// comment for the full explanation: the library's default worker can't correctly locate its
// own native sync extension (.dll/.so/.dylib) once this app is packaged inside app.asar, so
// main.js computes the correct real on-disk path itself and hands it to this file as plain
// data via `workerData` (a JS function can't cross the worker_threads boundary).
//
// Must be a real .mjs file (not .js) so Node treats it as ESM regardless of pos-app's own
// package.json (which has no "type": "module", to keep main.js/preload.js as plain CommonJS) —
// @powersync/node is itself a pure-ESM package and `startPowerSyncWorker` can only be
// imported that way.
//
// This file must stay in package.json's `files` allowlist (same bug class as the
// powersync/printEngine "Cannot find module" crashes fixed earlier — see STATUS.md).
import { startPowerSyncWorker } from '@powersync/node/worker.js';
import { workerData } from 'node:worker_threads';

startPowerSyncWorker({ extensionPath: () => workerData.extensionPath });
