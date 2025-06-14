import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const RecipeDetailsDialog = ({ visible, recipe, onClose, onDelete, onCook, onUncook, onUpdate, onNext }) => {
  const theme = useTheme();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const commentInputRef = useRef(null);

  useEffect(() => {
    if (recipe) {
      setCommentText(recipe.comment || '');
    }
  }, [recipe]);

  useEffect(() => {
    if (!visible) {
      setHasClickedCook(false);
      setIsEditingComment(false);
      setNoMoreRecipes(false);
    }
  }, [visible]);

  if (!recipe) return null;

  const handleCommentSave = async () => {
    try {
      await onUpdate(recipe.name, { ...recipe, comment: commentText });
      setIsEditingComment(false);
    } catch (error) {
      console.error('Error saving comment:', error);
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
      <Dialog visible={visible} onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title style={[styles.title, { color: theme.colors.onSurface }]}>
          <MaterialCommunityIcons name="book-open-variant" size={24} color={theme.colors.onSurface} style={styles.titleIcon} />
          How about this recipe?
        </Dialog.Title>
        <Dialog.Content>
          <View style={styles.content}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
              <View style={styles.nameContainer}>
                <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{recipe.name}</Text>
                <Button
                  icon="delete"
                  onPress={() => onDelete(recipe.name)}
                  style={styles.deleteButton}
                  textColor={theme.colors.error}
                />
              </View>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Comment</Text>
              <View style={styles.commentContainer}>
                {isEditingComment ? (
                  <TextInput
                    ref={commentInputRef}
                    value={commentText}
                    onChangeText={setCommentText}
                    onBlur={handleCommentSave}
                    style={[styles.commentInput, { backgroundColor: theme.colors.surface }]}
                    placeholder="Add a comment..."
                    multiline
                    autoFocus
                  />
                ) : (
                  <Button
                    mode="text"
                    onPress={() => setIsEditingComment(true)}
                    style={styles.commentButton}
                    textColor={theme.colors.onSurface}
                  >
                    {commentText || "Click to add comment..."}
                  </Button>
                )}
              </View>
            </View>
          </View>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          {!hasClickedCook ? (
            <View style={styles.buttonContainer}>
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
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: '#fbf7f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIcon: {
    marginRight: 8,
  },
  content: {
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  label: {
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '500',
    paddingTop: 8,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recipeName: {
    flex: 1,
    fontSize: 16,
    marginRight: 8,
  },
  deleteButton: {
    margin: 0,
  },
  commentContainer: {
    flex: 1,
  },
  commentInput: {
    fontSize: 16,
  },
  commentButton: {
    alignItems: 'flex-start',
    padding: 0,
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