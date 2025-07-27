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
    const keyboardDidShow = () => {
      // Using a fixed value is often more reliable for centered dialogs
      // to prevent them from being pushed too far up.
      setKeyboardOffset(-150);
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
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="plus-circle" size={28} color={theme.colors.onSurface} />
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            Add New Recipe
          </Text>
        </View>
        <Dialog.Content>
          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
              <TextInput
                value={newRecipe.name}
                onChangeText={(text) => setNewRecipe({ ...newRecipe, name: text })}
                style={[styles.input, { backgroundColor: theme.colors.background }]}
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
                style={[styles.input, { backgroundColor: theme.colors.background }]}
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
                style={[styles.input, { backgroundColor: theme.colors.background, textAlignVertical: 'center' }]}
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
                  ? theme.colors.primary
                  : theme.colors.background,
                opacity: (newRecipe.name) ? 1 : 0.7,
                borderRadius: 12
              }]}
              textColor={(newRecipe.name) ? theme.colors.surface : theme.colors.onSurface}
              disabled={!newRecipe.name}
              icon="plus"
            >
              Add Recipe
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    gap: 24,
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
    padding: 16,
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