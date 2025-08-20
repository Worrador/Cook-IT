import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Keyboard, Platform } from 'react-native';
import { Dialog, Text, TextInput, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const AddRecipeDialog = ({ visible, onDismiss, onAddRecipe }) => {
  const theme = useTheme();
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [error, setError] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    // Reset form when dialog is closed
    if (!visible) {
      setNewRecipe({ name: '', url: '', comment: '' });
      setError('');
    }
  }, [visible]);

  useEffect(() => {
    const keyboardDidShow = (event) => {
      // Using a fixed value is often more reliable for centered dialogs
      // to prevent them from being pushed too far up.
      const keyboardHeight = event.endCoordinates.height;
      setKeyboardOffset(-Math.min(keyboardHeight * 0.6, 200));
    };

    const keyboardDidHide = () => {
      setKeyboardOffset(0);
    };

    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', keyboardDidShow);
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', keyboardDidHide);

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleAdd = () => {
    if (!newRecipe.name.trim()) {
      setError('Recipe name is required');
      return;
    }
    onAddRecipe({
      name: newRecipe.name.trim(),
      url: newRecipe.url.trim(),
      comment: newRecipe.comment.trim(),
    });
  };

  return (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      style={[
        styles.dialog,
        { backgroundColor: '#fbf7f0' },
        { transform: [{ translateY: keyboardOffset }] },
      ]}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <MaterialCommunityIcons name="plus-circle" size={28} color={theme.colors.primary} style={styles.headerIcon} />
          <Text style={[styles.title, { color: theme.colors.primary }]}>Add New Recipe</Text>
        </View>
        <Dialog.Content>
          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
              <TextInput
                value={newRecipe.name}
                onChangeText={(text) => setNewRecipe({ ...newRecipe, name: text })}
                style={[styles.input, { backgroundColor: '#fbf7f0' }]}
                placeholder="Enter recipe name"
                placeholderTextColor={`${theme.colors.primary}66`}
                error={!!error}
                mode="outlined"
                outlineStyle={{ borderRadius: 12 }}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>URL</Text>
              <TextInput
                value={newRecipe.url}
                onChangeText={(text) => setNewRecipe({ ...newRecipe, url: text })}
                style={[styles.input, { backgroundColor: '#fbf7f0' }]}
                placeholder="Enter recipe URL"
                placeholderTextColor={`${theme.colors.primary}66`}
                keyboardType="url"
                autoCapitalize="none"
                mode="outlined"
                outlineStyle={{ borderRadius: 12 }}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Comment</Text>
              <TextInput
                value={newRecipe.comment}
                onChangeText={(text) => setNewRecipe({ ...newRecipe, comment: text })}
                style={[styles.input, { backgroundColor: '#fbf7f0', textAlignVertical: 'center' }]}
                placeholder="Add any comments"
                placeholderTextColor={`${theme.colors.primary}66`}
                multiline={!!newRecipe.comment}
                numberOfLines={5}
                mode="outlined"
                outlineStyle={{ borderRadius: 12 }}
              />
            </View>
          </View>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={handleAdd}
              style={[styles.actionButton, {
                backgroundColor: (newRecipe.name)
                  ? theme.colors.secondary // Orange color when enabled
                  : '#f3d1c2', // Grayed out version of orange when disabled
                borderRadius: 12
              }]}
              textColor={theme.colors.surface}
              disabled={!newRecipe.name}
              icon="plus"
            >
              Add Recipe
            </Button>
            <Button
              mode="contained"
              onPress={onDismiss}
              style={[styles.actionButton, {
                backgroundColor: theme.colors.primary, // Brown color for cancel button
                borderRadius: 12
              }]}
              textColor={theme.colors.surface}
              icon="close"
            >
              Cancel
            </Button>
          </View>
        </Dialog.Actions>
      </ScrollView>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  dialog: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerIcon: {
    marginRight: 8,
  },
  content: {
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  label: {
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  actions: {
    padding: 8,
    gap: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  actionButton: {
    width: '100%',
  },
});

export default AddRecipeDialog;