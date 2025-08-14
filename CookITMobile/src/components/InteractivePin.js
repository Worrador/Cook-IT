import React, { useState } from 'react';
import { TouchableOpacity, View, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const InteractivePin = ({
  isPinned,
  onToggle,
  size = 32, // Increased from 28 to make pin even bigger
  style,
  disabled = false,
  triggerBounce = false, // New prop to control bounce animation
}) => {
  const [scaleAnim] = useState(new Animated.Value(1));
  const [bounceAnim] = useState(new Animated.Value(1)); // New animation for bounce effect
  const [isPressed, setIsPressed] = useState(false);

  // Bounce animation to signal clickability
  const playBounceAnimation = () => {
    // Scale up to 125% then back to normal
    Animated.sequence([
      Animated.timing(bounceAnim, {
        toValue: 1.25,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bounceAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Trigger bounce when triggerBounce prop changes to true
  React.useEffect(() => {
    if (triggerBounce) {
      const timer = setTimeout(() => {
        playBounceAnimation();
      }, 100); // Small delay after recipe appears

      return () => clearTimeout(timer);
    }
  }, [triggerBounce]);

  const handlePressIn = () => {
    setIsPressed(true);
    // Scale up slightly when pressed
    Animated.spring(scaleAnim, {
      toValue: 1.15,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    // Scale back to normal
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePress = async () => {
    if (disabled) return;

    // Haptic feedback
    try {
      if (isPinned) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (error) {
      // Haptics might not be available on all devices
      console.log('Haptics not available:', error);
    }

    try {
      onToggle();
    } catch (error) {
      console.error('Error in pin toggle:', error);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.container, style]}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          styles.pinContainer,
          {
            transform: [
              { scale: Animated.multiply(scaleAnim, bounceAnim) }, // Combine press and bounce animations
              { rotate: '25deg' }, // Realistic pin angle
            ],
          },
        ]}
      >
        {/* Pin body - removed shadow */}
        <MaterialCommunityIcons
          name="pin"
          size={size}
          color={isPinned ? '#F2BC42' : '#8B7355'} // Yellow when pinned (like the old banner), muted brown when not
          style={[
            styles.pin,
            {
              opacity: isPinned ? 1 : 0.6,
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 0, height: -2 },
              textShadowRadius: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
            },
          ]}
        />

        {/* Pressed state indicator */}
        {isPressed && (
          <View style={[styles.pressedIndicator, { width: size + 8, height: size + 8 }]} />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -18, // Move pins even higher above the card edge to extend beyond cork borders
    left: '50%', // Center horizontally
    transform: [{ translateX: -16 }], // Adjusted for larger pin size (32/2 = 16)
    zIndex: 9999, // Ensure pin appears above all other layers including scrollview border
  },
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    // Additional styling handled via props
  },
  pressedIndicator: {
    position: 'absolute',
    backgroundColor: 'rgba(216, 106, 58, 0.2)', // Orange glow
    borderRadius: 20,
    top: -4,
    left: -4,
  },
});

export default InteractivePin;