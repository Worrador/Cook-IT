import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Keyboard, Linking } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const RecipeDetailsDialog = ({ visible, recipe, isSuggestionFlow, onClose, onDelete, onCook, onUncook, onUpdate, onNext, onTogglePin, isPinned, pinnedRecipes, setPinnedRecipes }) => {
  const theme = useTheme();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [nameText, setNameText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [shouldShowExpandButton, setShouldShowExpandButton] = useState(false);
  const commentInputRef = useRef(null);
  const commentTextRef = useRef(null);
  const nameInputRef = useRef(null);

  // Keyboard listeners for dialog positioning
  useEffect(() => {
    const keyboardDidShow = (event) => {
      // Only apply offset if comment input is focused
      if (isCommentFocused) {
        const keyboardHeight = event.endCoordinates.height;
        // Use 30% of keyboard height, max 150px
        setKeyboardOffset(-Math.min(keyboardHeight * 0.5, 180));
      }
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
  }, [isCommentFocused]);

  const handleCommentSave = async () => {
    if (!recipe) {
      console.warn('Cannot save comment: recipe is null');
      return;
    }

    try {
      await onUpdate(recipe.name, { ...recipe, comment: commentText });
      setIsEditingComment(false);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const handleNameSave = async () => {
    if (!recipe) {
      console.warn('Cannot save name: recipe is null');
      return;
    }

    try {
      // Update the recipe with the new name
      await onUpdate(recipe.name, { ...recipe, name: nameText });

      // If this recipe was pinned, we need to update the pinned recipes array
      // to reflect the new name
      if (isPinned && pinnedRecipes && setPinnedRecipes) {
        // Remove the old name and add the new name to pinned recipes
        const updatedPinnedRecipes = pinnedRecipes
          .filter(name => name !== recipe.name) // Remove old name
          .concat(nameText); // Add new name
        setPinnedRecipes(updatedPinnedRecipes);
      }

      setIsEditingName(false);
    } catch (error) {
      console.error('Error saving name:', error);
    }
  };

  const toggleCommentExpansion = () => {
    setIsCommentExpanded(!isCommentExpanded);
  };

  useEffect(() => {
    if (recipe) {
      setCommentText(recipe.comment || '');
      setNameText(recipe.name || '');
    }
  }, [recipe]);

  // Check if text needs expansion button
  useEffect(() => {
    if (!commentText) {
      setShouldShowExpandButton(false);
    }
  }, [commentText]);

  useEffect(() => {
    if (!visible) {
      if (isEditingComment && recipe) {
        handleCommentSave();
      }
      if (isEditingName && recipe) {
        handleNameSave();
      }
      setHasClickedCook(false);
      setIsEditingComment(false);
      setIsEditingName(false);
      setNoMoreRecipes(false);
      setIsCommentExpanded(false);
    }
  }, [visible, recipe]);

  if (!recipe) return null;

  const handleDialogDismiss = () => {
    if (isEditingComment && recipe) {
      handleCommentSave();
    }
    if (isEditingName && recipe) {
      handleNameSave();
    }
    onClose();
  };

  const handleContentPress = () => {
    if (isEditingComment && recipe) {
      handleCommentSave();
    }
    if (isEditingName && recipe) {
      handleNameSave();
    }
  };

  const handleChangeMind = () => {
    if (!recipe) return;
    setHasClickedCook(false);
    onUncook(recipe.name);
  };

  const handleCook = () => {
    if (!recipe) return;
    setHasClickedCook(true);
    onCook(recipe.name);
  };

  const handleOpenURL = async () => {
    if (!recipe || !recipe.url) return;

    try {
      const supported = await Linking.canOpenURL(recipe.url);
      if (supported) {
        await Linking.openURL(recipe.url);
      } else {
        console.error('Cannot open URL:', recipe.url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const handleNext = async () => {
    setIsEditingComment(false);
    setHasClickedCook(false);
    setIsCommentExpanded(false);
    try {
      const nextRecipe = await onNext();
      if (nextRecipe && nextRecipe.empty) {
        setNoMoreRecipes(true);
      }
    } catch (error) {
      console.error('Error getting next recipe:', error);
    }
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDialogDismiss}
        style={[
          styles.dialog,
          { transform: [{ translateY: keyboardOffset }] }
        ]}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons name="book-open-variant" size={28} color={theme.colors.primary} style={styles.headerIcon} />
          <Text style={[styles.title, { color: theme.colors.primary }]}>How about this recipe?</Text>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
                <View style={styles.nameContainer}>
                  {isEditingName ? (
                    <View style={styles.nameEditContainer}>
                      <TextInput
                        ref={nameInputRef}
                        value={nameText}
                        onChangeText={setNameText}
                        onBlur={() => handleNameSave()}
                        style={styles.nameInput}
                        placeholder="Enter recipe name"
                        placeholderTextColor={`${theme.colors.primary}66`}
                        autoFocus
                        mode="outlined"
                      />
                      <TouchableOpacity
                        onPress={handleNameSave}
                        style={styles.expandButton}
                      >
                        <MaterialCommunityIcons
                          name="content-save"
                          size={20}
                          width={20}
                          paddingTop={4}
                          paddingLeft={4}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.nameViewContainer}>
                      <TouchableOpacity
                        style={styles.nameTextContainer}
                        onLongPress={() => setIsEditingName(true)}
                      >
                        <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{nameText}</Text>
                      </TouchableOpacity>
                      <Button
                        icon="delete"
                        onPress={() => onDelete(recipe.name)}
                        style={styles.deleteButton}
                        textColor={theme.colors.error}
                        iconSize={28}
                      />
                    </View>
                  )}
                </View>
              </View>
              <View style={[styles.row, { marginTop: 1 }]}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Comment</Text>
                <View style={styles.commentContainer}>
                  {isEditingComment ? (
                    <View style={styles.commentEditContainer}>
                      <TextInput
                        ref={commentInputRef}
                        value={commentText}
                        onChangeText={setCommentText}
                        onBlur={() => {
                          setIsCommentFocused(false);
                          handleCommentSave();
                        }}
                        onFocus={() => setIsCommentFocused(true)}
                        style={styles.commentInput}
                        placeholder="Add any comments"
                        placeholderTextColor={`${theme.colors.primary}66`}
                        multiline
                        autoFocus
                        mode="outlined"
                      />
                      <TouchableOpacity
                        onPress={handleCommentSave}
                        style={styles.expandButton}
                      >
                        <MaterialCommunityIcons
                          name="content-save"
                          size={20}
                          width={20}
                          paddingTop={4}
                          paddingLeft={4}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.commentViewContainer}>
                      <TouchableOpacity
                        style={[styles.commentTextContainer, {
                          maxHeight: isCommentExpanded ? 200 : 48,
                          backgroundColor: 'transparent'
                        }]}
                        onPress={() => setIsEditingComment(true)}
                      >
                        <Text
                          ref={commentTextRef}
                          style={[styles.commentText, { color: commentText ? theme.colors.onSurface : theme.colors.onSurface + '66' }]}
                          numberOfLines={isCommentExpanded ? undefined : 2}
                          onTextLayout={(event) => {
                            const { lines } = event.nativeEvent;
                            if (lines.length > 2) {
                              setShouldShowExpandButton(true);
                            } else {
                              setShouldShowExpandButton(false);
                            }
                          }}
                        >
                          {commentText || "Add any comments"}
                        </Text>
                      </TouchableOpacity>
                      {commentText && shouldShowExpandButton && (
                        <TouchableOpacity
                          onPress={toggleCommentExpansion}
                          style={styles.expandButton}
                        >
                          <MaterialCommunityIcons
                            name={isCommentExpanded ? "chevron-up" : "chevron-down"}
                            size={28}
                            width={20}
                            paddingTop={4}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
              {recipe && recipe.url && (
                <View style={[styles.row, { marginTop: 1 }]}>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>URL</Text>
                  <View style={styles.urlContainer}>
                    <TouchableOpacity
                      style={styles.urlTextContainer}
                      onPress={handleOpenURL}
                    >
                      <Text style={[styles.urlText, { color: theme.colors.primary }]} numberOfLines={2}>
                        {recipe.url}
                      </Text>
                      <MaterialCommunityIcons
                        name="open-in-new"
                        size={16}
                        color={theme.colors.primary}
                        style={styles.urlIcon}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </Dialog.Content>
          <Dialog.Actions style={styles.actions}>
            {!hasClickedCook ? (
              <View style={styles.buttonContainer}>
                {isSuggestionFlow && (
                  <Button
                    mode="outlined"
                    onPress={handleNext}
                    style={[styles.actionButton, { borderColor: theme.colors.primary }]}
                    textColor={theme.colors.primary}
                    icon="arrow-right"
                    disabled={noMoreRecipes}
                  >
                    {noMoreRecipes ? "No more recipes" : "Next"}
                  </Button>
                )}
                {onTogglePin && !isSuggestionFlow && (
                  <Button
                    mode="outlined"
                    onPress={() => onTogglePin(recipe.name)}
                    style={[styles.actionButton, { borderColor: theme.colors.tertiary }]}
                    textColor={theme.colors.tertiary}
                    icon={isPinned ? "pin-off" : "pin"}
                  >
                    {isPinned ? "Unpin this recipe" : "Pin this recipe"}
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={handleCook}
                  style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                  icon="chef-hat"
                >
                  I will Cook IT!
                </Button>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                {onTogglePin && (
                  <Button
                    mode="outlined"
                    onPress={() => onTogglePin(recipe.name)}
                    style={[styles.actionButton, { borderColor: theme.colors.tertiary }]}
                    textColor={theme.colors.tertiary}
                    icon={isPinned ? "pin-off" : "pin"}
                  >
                    {isPinned ? "Unpin this recipe" : "Pin this recipe"}
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={handleChangeMind}
                  style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                  icon="refresh"
                >
                  Changed my mind
                </Button>
              </View>
            )}
          </Dialog.Actions>
        </ScrollView>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: '#fbf7f0',
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  dialogContent: {
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerIcon: {
    marginRight: 8,
  },
  content: {
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    minHeight: 48,
  },
  label: {
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '500',
    alignSelf: 'flex-start',
    paddingTop: 12,
  },
  recipeName: {
    fontSize: 16,
    paddingLeft: 15,
    flex: 1,
    paddingTop: 12,
  },
  deleteButton: {
    margin: 0,
    minWidth: 0,
    width: 20,
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  commentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameTextContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  nameInput: {
    fontSize: 16,
    flex: 1,
    backgroundColor: '#f7f0e2',
  },
  commentViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  commentEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  commentTextContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 48,
  },
  commentText: {
    fontSize: 16,
    lineHeight: 20,
  },
  commentInput: {
    fontSize: 16,
    flex: 1,
    backgroundColor: '#f7f0e2',
  },
  expandButton: {
    padding: 8,
    marginLeft: 0,
    alignSelf: 'center',
  },
  actions: {
    padding: 0,
    gap: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  actionButton: {
    width: '100%',
  },
  urlContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    backgroundColor: '#f7f0e2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  urlTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  urlText: {
    fontSize: 14,
    lineHeight: 18,
    flex: 1,
  },
  urlIcon: {
    marginLeft: 8,
  },
});