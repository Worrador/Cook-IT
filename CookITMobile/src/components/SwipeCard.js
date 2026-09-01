// Draggable vote card - the Tinder gesture.
//
// On a phone, tapping buttons to vote feels wrong; the whole appeal of this
// interaction is the physical throw. So the card follows your finger, tilts as
// it goes, shows a LIKE/NOPE stamp once you've committed, and flies off when
// released past the threshold. Released short of it, it springs back.
//
// The buttons are kept as well rather than replaced: they're the accessible path
// (a drag is hard with one hand, or with a motor impairment), and on the web
// build they're the primary control since dragging with a mouse is worse than
// clicking. Both routes call the same onSwipe.
import React from 'react';
import { Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Far enough that an accidental nudge doesn't cast a vote, close enough that a
// deliberate flick does. Roughly a quarter of the screen.
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
// A fast flick should count even if it didn't travel the full distance.
const VELOCITY_THRESHOLD = 800;

export default function SwipeCard({ children, onSwipe, disabled }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const finish = (approved) => {
    // Reset for the next card before telling the parent, so the incoming card
    // doesn't briefly render at the old offset.
    translateX.value = 0;
    translateY.value = 0;
    onSwipe(approved);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate(event => {
      translateX.value = event.translationX;
      // Damped vertical movement - the card should feel hinged, not free.
      translateY.value = event.translationY * 0.25;
    })
    .onEnd(event => {
      const committed =
        Math.abs(event.translationX) > SWIPE_THRESHOLD ||
        Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

      if (committed) {
        const approved = event.translationX > 0;
        // Fly the card off in the direction it was thrown, then report.
        translateX.value = withTiming(
          Math.sign(event.translationX) * SCREEN_WIDTH * 1.5,
          { duration: 180 },
          () => runOnJS(finish)(approved)
        );
      } else {
        translateX.value = withSpring(0, { damping: 18 });
        translateY.value = withSpring(0, { damping: 18 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      // Tilt proportional to horizontal travel - the cue that sells the throw.
      { rotate: `${interpolate(
        translateX.value,
        [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        [-12, 0, 12],
        Extrapolation.CLAMP
      )}deg` },
    ],
  }));

  // Stamps fade in as you drag, so you can see which way you're voting before
  // you let go.
  const yesStamp = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const noStamp = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        {children}
        <Animated.View style={[styles.stamp, styles.stampYes, yesStamp]} pointerEvents="none">
          <Text style={[styles.stampText, { color: '#2f9e44' }]}>YES</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampNo, noStamp]} pointerEvents="none">
          <Text style={[styles.stampText, { color: '#d63031' }]}>NOPE</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// Exported so the parent can show the right hint text per platform.
export const SUPPORTS_DRAG = Platform.OS !== 'web';

const styles = StyleSheet.create({
  card: { width: '100%' },
  stamp: {
    position: 'absolute', top: 14, borderWidth: 4, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 4, alignItems: 'center', justifyContent: 'center',
  },
  stampText: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  stampYes: { left: 14, borderColor: '#2f9e44', transform: [{ rotate: '-14deg' }] },
  stampNo: { right: 14, borderColor: '#d63031', transform: [{ rotate: '14deg' }] },
});
