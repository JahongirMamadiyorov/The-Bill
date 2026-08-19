// ══════════════════════════════════════════════════════════════════════════════
// useSheetSwipe — swipe-down-to-dismiss for bottom sheets
// ══════════════════════════════════════════════════════════════════════════════
// Every bottom sheet in this app is a plain <Modal> with a hand-rolled sheet View.
// RN gives them nothing: no swipe, and (until this was fixed) no Android back
// handling either. This hook adds the swipe half.
//
// The pan handlers are meant for the sheet's TOP BAR (drag handle + title row),
// NOT the whole sheet — every sheet here has a ScrollView body, and a responder on
// the container would fight it for the gesture. Restricting the drag zone to the
// top bar is the standard Android sheet behaviour and cannot regress scrolling.
//
// Usage:
//   const swipe = useSheetSwipe(onClose);
//   <Animated.View style={[styles.sheet, swipe.style]}>
//     <View {...swipe.panHandlers}>
//       <View style={styles.handle} />
//       <View style={styles.header}>…</View>
//     </View>
//     <ScrollView>…</ScrollView>
//   </Animated.View>
//
// Reset note: the sheet's translate is returned to 0 before onClose() fires, so a
// Modal that stays mounted (visible={false}) reopens at rest instead of off-screen.
import { useRef, useCallback, useEffect } from 'react';
import { Animated, PanResponder, Dimensions } from 'react-native';

const SCREEN_H = Dimensions.get('window').height;

export default function useSheetSwipe(onClose, opts = {}) {
  const {
    distanceThreshold = 80,   // px dragged before a release dismisses
    velocityThreshold = 0.55, // or a fast enough flick
  } = opts;

  const translateY = useRef(new Animated.Value(0)).current;

  // Keep the latest onClose without rebuilding the responder every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const springBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18,
    }).start();
  }, [translateY]);

  const responder = useRef(
    PanResponder.create({
      // Never claim on touch-down — a tap on the title row must still work.
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Claim only a deliberate DOWNWARD drag, so a horizontal swipe or a stray
      // finger movement during a tap is ignored.
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 5 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        // Downward only — dragging up must not lift the sheet off its anchor.
        translateY.setValue(g.dy > 0 ? g.dy : 0);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > distanceThreshold || g.vy > velocityThreshold) {
          Animated.timing(translateY, {
            toValue: SCREEN_H, duration: 180, useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);       // reset BEFORE closing, see note above
            if (onCloseRef.current) onCloseRef.current();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18,
          }).start();
        }
      },
      // Something else (e.g. the OS) took the gesture — put the sheet back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18,
        }).start();
      },
    })
  ).current;

  return {
    panHandlers: responder.panHandlers,
    style: { transform: [{ translateY }] },
    reset: springBack,
  };
}
