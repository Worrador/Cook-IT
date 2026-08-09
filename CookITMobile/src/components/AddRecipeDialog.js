import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Keyboard, Image, TouchableOpacity } from 'react-native';
import { Dialog, Text, TextInput, Button, SegmentedButtons, ActivityIndicator, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import recipeImageService from '../services/recipeImageService';

const AddRecipeDialog = ({ visible, onDismiss, onAddRecipe }) => {
  const theme = useTheme();
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [error, setError] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [sourceMode, setSourceMode] = useState('link');
  const [images, setImages] = useState([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  useEffect(() => {
    // Reset form when dialog is closed
    if (!visible) {
      setNewRecipe({ name: '', url: '', comment: '' });
      setError('');
      setSourceMode('link');
      setImages([]);
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

  // Discards any photos captured but never attached to a saved recipe -
  // otherwise cancelling out of the dialog would leave orphan files behind.
  const discardUnsavedImages = () => {
    images.forEach(image => {
      recipeImageService.deleteImage(image).catch(() => {});
    });
  };

  const handleCancel = () => {
    discardUnsavedImages();
    onDismiss();
  };

  const handleTakePhoto = async () => {
    try {
      setIsProcessingImage(true);
      const imageRef = await recipeImageService.captureFromCamera();
      if (imageRef) {
        setImages(prev => [...prev, imageRef]);
      }
    } catch (err) {
      console.warn('Failed to capture photo:', err?.message || err);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      setIsProcessingImage(true);
      const picked = await recipeImageService.pickFromLibrary();
      if (picked?.length) {
        setImages(prev => [...prev, ...picked]);
      }
    } catch (err) {
      console.warn('Failed to pick photos:', err?.message || err);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleRemoveImage = (id) => {
    const removed = images.find(image => image.id === id);
    setImages(prev => prev.filter(image => image.id !== id));
    if (removed) {
      recipeImageService.deleteImage(removed).catch(() => {});
    }
  };

  const handleAdd = () => {
    if (!newRecipe.name.trim()) {
      setError('Recipe name is required');
      return;
    }
    onAddRecipe({
      name: newRecipe.name.trim(),
      url: newRecipe.url.trim(),
      comment: newRecipe.comment.trim(),
      images,
    });
  };

  return (
    <Dialog
      visible={visible}
      onDismiss={handleCancel}
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

            {/* Source picker sits last: the recipe's name and comment are what the
                user always fills in, while the link/photo is optional. Paper's default
                selected-segment colour is MD3 purple, so the container colours are
                overridden here to the app's own palette. */}
            <SegmentedButtons
              value={sourceMode}
              onValueChange={setSourceMode}
              style={styles.sourceToggle}
              theme={{
                colors: {
                  secondaryContainer: theme.colors.background,
                  onSecondaryContainer: theme.colors.primary,
                  onSurface: theme.colors.primary,
                  outline: `${theme.colors.primary}55`,
                },
              }}
              buttons={[
                { value: 'link', label: 'Link', icon: 'link-variant' },
                { value: 'photo', label: 'Photo', icon: 'camera' },
              ]}
            />

            {sourceMode === 'link' ? (
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>URL</Text>
                <TextInput
                  value={newRecipe.url}
                  onChangeText={(text) => setNewRecipe({ ...newRecipe, url: text })}
                  style={[styles.input, { backgroundColor: '#fbf7f0' }]}
                  placeholder="Enter recipe URL (optional)"
                  placeholderTextColor={`${theme.colors.primary}66`}
                  keyboardType="url"
                  autoCapitalize="none"
                  mode="outlined"
                  outlineStyle={{ borderRadius: 12 }}
                />
              </View>
            ) : (
              <View style={styles.photoSection}>
                <View style={styles.photoButtonsRow}>
                  <Button
                    mode="outlined"
                    onPress={handleTakePhoto}
                    style={styles.photoButton}
                    textColor={theme.colors.primary}
                    icon="camera"
                    disabled={isProcessingImage}
                  >
                    Take photo
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={handlePickFromGallery}
                    style={styles.photoButton}
                    textColor={theme.colors.primary}
                    icon="image-multiple"
                    disabled={isProcessingImage}
                  >
                    Choose from gallery
                  </Button>
                </View>

                {isProcessingImage && (
                  <ActivityIndicator style={styles.photoLoading} color={theme.colors.primary} />
                )}

                {images.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailStrip}>
                    {images.map(image => (
                      <View key={image.id} style={styles.thumbnailWrapper}>
                        <Image source={{ uri: image.localFile }} style={styles.thumbnail} />
                        <TouchableOpacity
                          style={styles.removeThumbnailButton}
                          onPress={() => handleRemoveImage(image.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
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
              onPress={handleCancel}
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
  sourceToggle: {
    marginHorizontal: 4,
  },
  photoSection: {
    gap: 12,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flex: 1,
    borderRadius: 12,
  },
  photoLoading: {
    marginTop: 4,
  },
  thumbnailStrip: {
    flexGrow: 0,
  },
  thumbnailWrapper: {
    marginRight: 10,
    position: 'relative',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#f7f0e2',
  },
  removeThumbnailButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fbf7f0',
    borderRadius: 10,
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
