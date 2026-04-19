// src/utils/sounds.js
// ──────────────────────────────────────────────────────────────────────────────
// Thin wrapper around react-native-sound for our two notification cues:
//   • ding_ding   → soft two-tone chime played on the waitress panel when a
//                   new notification arrives.
//   • kitchen_alarm → louder alarm pattern played on the Kitchen Display
//                     whenever a fresh order hits the queue.
//
// Both files are bundled natively:
//   Android → android/app/src/main/res/raw/{ding_ding,kitchen_alarm}.mp3
//   iOS     → src/assets/sounds/{ding_ding,kitchen_alarm}.mp3 (add to Xcode
//             "Copy Bundle Resources" — see README in src/assets/sounds/).
//
// The helper loads lazily, swallows any init/playback error so that a missing
// native module or file never crashes the app, and guards against overlap via
// a simple in-flight flag.
// ──────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import Sound from 'react-native-sound';

// Audio should mix with the silent-switch override. In "playback" category on
// iOS the sound plays even if the phone is on silent — important for servers
// who often flip the mute switch.
try {
  Sound.setCategory('Playback', true);
} catch {
  // ignore — will still play via default category
}

// ── Internal registry ─────────────────────────────────────────────────────────
const cache = {};          // id → Sound instance
const inflight = {};       // id → boolean (currently playing)

function loadSound(id, filename) {
  return new Promise((resolve) => {
    if (cache[id]) {
      resolve(cache[id]);
      return;
    }
    // On Android we reference res/raw via lower-case name without extension.
    // react-native-sound accepts full filename on both platforms when the
    // file is bundled with the app; MAIN_BUNDLE is the safe common location.
    const instance = new Sound(filename, Sound.MAIN_BUNDLE, (err) => {
      if (err) {
        // Don't throw — just log once. App continues without audio.
        if (__DEV__) console.warn(`[sounds] failed to load ${filename}`, err);
        resolve(null);
        return;
      }
      instance.setVolume(1.0);
      cache[id] = instance;
      resolve(instance);
    });
  });
}

async function playOnce(id, filename) {
  if (inflight[id]) return;
  inflight[id] = true;
  try {
    const snd = await loadSound(id, filename);
    if (!snd) {
      inflight[id] = false;
      return;
    }
    snd.stop(() => {
      snd.play((ok) => {
        inflight[id] = false;
        if (!ok && __DEV__) console.warn(`[sounds] playback ${id} did not finish`);
      });
    });
  } catch (e) {
    inflight[id] = false;
    if (__DEV__) console.warn('[sounds] playOnce error', e);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Soft ding-ding chime for the waitress panel. Call on each new notification.
 */
export function playDingDing() {
  playOnce('ding', 'ding_ding.mp3');
}

/**
 * Louder repeating alarm for the kitchen display. Call on each new order
 * landing in the queue.
 */
export function playKitchenAlarm() {
  playOnce('alarm', 'kitchen_alarm.mp3');
}

/**
 * Release all cached Sound instances. Safe to call on logout or app
 * teardown — normally not needed since React Native reclaims on unmount.
 */
export function releaseAllSounds() {
  Object.keys(cache).forEach((k) => {
    try { cache[k].release(); } catch { /* noop */ }
    delete cache[k];
  });
}

// Helpful when debugging on a simulator
export const __soundPlatform = Platform.OS;
