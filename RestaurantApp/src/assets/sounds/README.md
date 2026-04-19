# Notification sound assets

Two short MP3 cues used by the waitress and kitchen panels:

- `ding_ding.mp3` — soft two-tone chime played in the waitress panel when a
  new notification arrives.
- `kitchen_alarm.mp3` — louder alarm pattern played on the Kitchen Display
  when a fresh order appears in the queue.

Played via `react-native-sound` from `src/utils/sounds.js`.

## Android

Already wired automatically. The same files live under
`android/app/src/main/res/raw/` (filenames must stay lowercase, no spaces).
React-native-sound looks them up by filename. No code or Gradle changes
required — autolinking handles the native module.

## iOS

After running `npx pod-install` once for the new dependency, open the project
in Xcode and add the two files from this folder to the app target:

1. In Xcode, drag `ding_ding.mp3` and `kitchen_alarm.mp3` into the
   `RestaurantApp` group (not the project root).
2. In the dialog, tick **Copy items if needed** and **Add to target:
   RestaurantApp**.
3. Build and run — the files will be in the iOS bundle root, exactly where
   `Sound.MAIN_BUNDLE` looks for them.

## Regenerating the cues

The MP3s were synthesized with ffmpeg. To rebuild:

```bash
# ding_ding
ffmpeg -y -f lavfi -i "sine=frequency=1175:duration=0.18" \
       -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.08" \
       -f lavfi -i "sine=frequency=1568:duration=0.30" \
       -filter_complex "[0:a]afade=t=out:st=0.12:d=0.06[a];[1:a]anull[b];[2:a]afade=t=out:st=0.22:d=0.08[c];[a][b][c]concat=n=3:v=0:a=1,volume=0.85[out]" \
       -map "[out]" -ar 44100 -ac 1 -b:a 128k ding_ding.mp3

# kitchen_alarm (3 short 880Hz beeps + a 1320Hz tail)
ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.22" \
       -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.10" \
       -f lavfi -i "sine=frequency=880:duration=0.22" \
       -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.10" \
       -f lavfi -i "sine=frequency=880:duration=0.22" \
       -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.10" \
       -f lavfi -i "sine=frequency=1320:duration=0.45" \
       -filter_complex "[0:a]afade=t=out:st=0.18:d=0.04[a];[1:a]anull[b];[2:a]afade=t=out:st=0.18:d=0.04[c];[3:a]anull[d];[4:a]afade=t=out:st=0.18:d=0.04[e];[5:a]anull[f];[6:a]afade=t=out:st=0.38:d=0.07[g];[a][b][c][d][e][f][g]concat=n=7:v=0:a=1,volume=1.0[out]" \
       -map "[out]" -ar 44100 -ac 1 -b:a 128k kitchen_alarm.mp3
```

Make sure the regenerated files are copied into `android/app/src/main/res/raw/`
as well as this folder, then re-add the iOS copies to Xcode if their internal
contents changed.
