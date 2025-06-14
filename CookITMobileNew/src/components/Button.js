import React from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

export const Button = ({
  children,
  onPress,
  style,
  variant = 'contained',
  icon,
  ...props
}) => {
  const getMode = () => {
    switch (variant) {
      case 'outlined':
        return 'outlined';
      case 'ghost':
        return 'text';
      case 'destructive':
        return 'contained';
      default:
        return 'contained';
    }
  };

  const getButtonColor = () => {
    if (variant === 'destructive') {
      return '#ef4444';
    }
    return undefined;
  };

  return (
    <PaperButton
      mode={getMode()}
      onPress={onPress}
      style={[styles.button, style]}
      icon={icon}
      buttonColor={getButtonColor()}
      textColor={variant === 'destructive' ? 'white' : undefined}
      {...props}
    >
      {children}
    </PaperButton>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
});