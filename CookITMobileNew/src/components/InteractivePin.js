import React, { useState } from 'react';
import { TouchableOpacity, View, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const InteractivePin = ({
  isPinned,
  onToggle,
  size = 28, // Increased from 24 to make pin bigger
  style,
  disabled = false
}) => {
  const [scaleAnim] = useState(new Animated.Value(1));
  const [isPressed, setIsPressed] = useState(false);

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

    onToggle();
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
              { scale: scaleAnim },
              { rotate: '25deg' }, // Realistic pin angle
            ],
          },
        ]}
      >
        {/* Pin body - removed shadow */}
        <MaterialCommunityIcons
          name="pin"
          size={size}
          color={isPinned ? '#D86A3A' : '#8B7355'} // Orange when pinned, muted brown when not
          style={[
            styles.pin,
            {
              opacity: isPinned ? 1 : 0.6,
              textShadowColor: 'rgba(0,0,0,0.3)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 2,
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
    top: -8, // Move slightly above the card edge
    left: '50%', // Center horizontally
    transform: [{ translateX: -14 }], // Adjusted for larger pin size (28/2 = 14)
    zIndex: 10,
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