import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const RecipeDetailsDialog = ({ visible, recipe, onClose, onDelete, onCook, onUncook, onUpdate, onNext }) => {
  const theme = useTheme();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);
  const commentInputRef = useRef(null);

  const handleCommentSave = async () => {
    try {
      await onUpdate(recipe.name, { ...recipe, comment: commentText });
      setIsEditingComment(false);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
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
      <Dialog visible={visible} onDismiss={handleDialogDismiss} style={styles.dialog}>
        <Dialog.Title style={[styles.title, { color: theme.colors.onSurface }]}>
          <View style={styles.titleContent}>
            <MaterialCommunityIcons name="book-open-variant" size={24} color={theme.colors.onSurface} />
            <Text style={{ marginLeft: 16, fontSize: 20, fontWeight: '600' }}>How about this recipe?</Text>
          </View>
        </Dialog.Title>
        <Dialog.Content>
          <TouchableOpacity activeOpacity={1} onPress={handleContentPress}>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollContent}>
                  <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{recipe.name}</Text>
                </ScrollView>
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
                      onBlur={handleCommentSave}
                      style={[styles.commentInput, { backgroundColor: theme.colors.surface }]}
                      placeholder="Add any comments"
                      placeholderTextColor={`${theme.colors.primary}66`}
                      multiline
                      numberOfLines={isCommentExpanded ? undefined : 3}
                      autoFocus
                      mode="outlined"
                      outlineStyle={{ borderRadius: 12 }}
                      contentStyle={{ textAlignVertical: 'center' }}
                      underlineColor="transparent"
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setIsEditingComment(true)}
                      style={styles.commentViewContainer}
                    >
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollContent}>
                        <TextInput
                          value={commentText}
                          style={[styles.commentInput, { backgroundColor: 'transparent' }]}
                          placeholder="Add any comments"
                          placeholderTextColor={`${theme.colors.primary}66`}
                          multiline
                          numberOfLines={isCommentExpanded ? undefined : 3}
                          mode="flat"
                          contentStyle={{ textAlignVertical: 'center' }}
                          editable={false}
                          underlineColor="transparent"
                        />
                      </ScrollView>
                      <TouchableOpacity
                        onPress={() => setIsCommentExpanded(!isCommentExpanded)}
                        style={styles.expandButton}
                      >
                        <MaterialCommunityIcons
                          name={isCommentExpanded ? "chevron-up" : "chevron-down"}
                          size={24}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </TouchableOpacity>
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
    width: '90%',
    maxWidth: 400,
    margin: 0,
    alignSelf: 'center',
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
    alignItems: 'center',
    gap: 16,
    minHeight: 48,
  },
  label: {
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '500',
    alignSelf: 'center',
  },
  scrollContent: {
    flex: 1,
    minWidth: 0,
  },
  recipeName: {
    fontSize: 16,
    paddingLeft: 15,
    minWidth: 100,
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
    alignItems: 'center',
    minWidth: 0,
  },
  commentViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  commentInput: {
    fontSize: 16,
    minWidth: 200,
    flex: 1,
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