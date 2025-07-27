import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Keyboard } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const RecipeDetailsDialog = ({ visible, recipe, isSuggestionFlow, onClose, onDelete, onCook, onUncook, onUpdate, onNext }) => {
  const theme = useTheme();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const commentInputRef = useRef(null);

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
    try {
      await onUpdate(recipe.name, { ...recipe, comment: commentText });
      setIsEditingComment(false);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const toggleCommentExpansion = () => {
    setIsCommentExpanded(!isCommentExpanded);
  };

  useEffect(() => {
    if (recipe) {
      setCommentText(recipe.comment || '');
    }
  }, [recipe]);

  useEffect(() => {
    if (!visible) {
      if (isEditingComment) {
        handleCommentSave();
      }
      setHasClickedCook(false);
      setIsEditingComment(false);
      setNoMoreRecipes(false);
      setIsCommentExpanded(false);
    }
  }, [visible]);

  if (!recipe) return null;

  const handleDialogDismiss = () => {
    if (isEditingComment) {
      handleCommentSave();
    }
    onClose();
  };

  const handleContentPress = () => {
    if (isEditingComment) {
      handleCommentSave();
    }
  };

  const handleChangeMind = () => {
    setHasClickedCook(false);
    onUncook(recipe.name);
  };

  const handleCook = () => {
    setHasClickedCook(true);
    onCook(recipe.name);
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
        <Dialog.Title style={[styles.title, { color: theme.colors.onSurface }]}>
          <View style={styles.titleContent}>
            <MaterialCommunityIcons name="book-open-variant" size={24} color={theme.colors.onSurface} />
            <Text style={{ marginLeft: 16, fontSize: 20, fontWeight: '600' }}>How about this recipe?</Text>
          </View>
        </Dialog.Title>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
                <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{recipe.name}</Text>
                <Button
                  icon="delete"
                  onPress={() => onDelete(recipe.name)}
                  style={styles.deleteButton}
                  textColor={theme.colors.error}
                  iconSize={28}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Comment</Text>
                <View style={styles.commentContainer}>
                  {isEditingComment ? (
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
                          style={[styles.commentText, { color: theme.colors.onSurface }]}
                          numberOfLines={isCommentExpanded ? undefined : 2}
                        >
                          {commentText || "Add any comments"}
                        </Text>
                      </TouchableOpacity>
                      {commentText && commentText.length > 50 && (
                        <TouchableOpacity
                          onPress={toggleCommentExpansion}
                          style={styles.expandButton}
                        >
                          <MaterialCommunityIcons
                            name={isCommentExpanded ? "chevron-up" : "chevron-down"}
                            size={24}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
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
              <>
                <Button
                  mode="contained"
                  onPress={handleChangeMind}
                  style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                  icon="refresh"
                >
                  Change my mind
                </Button>
              </>
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
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    paddingLeft: 20,
  },
  titleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
  },
  deleteButton: {
    margin: 0,
    padding: 0,
    minWidth: 0,
    width: 40,
  },
  commentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  commentViewContainer: {
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
    marginLeft: 8,
    alignSelf: 'center',
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