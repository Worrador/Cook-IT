import React from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Dialog, Portal, Text, Button, useTheme } from 'react-native-paper';

export const BuyCoffeeDialog = ({ visible, onClose }) => {
  const theme = useTheme();

  const handleBuyCoffee = () => {
    Linking.openURL('https://www.buymeacoffee.com/yourusername');
    onClose();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title style={{ color: theme.colors.onSurface }}>Support CookIT</Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.colors.onSurface }}>
            If you enjoy using CookIT, consider buying me a coffee to support the development of this app!
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            mode="contained"
            onPress={handleBuyCoffee}
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
          >
            Buy Me a Coffee
          </Button>
          <Button
            mode="outlined"
            onPress={onClose}
            style={[styles.button, { borderColor: theme.colors.primary }]}
            textColor={theme.colors.primary}
          >
            Maybe Later
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: '#f7f0e2',
  },
  button: {
    minWidth: 120,
  },
});