import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Linking } from 'react-native';
import { Card, CardHeader, CardContent, CardFooter } from './Card';
import { Button } from './Button';
import { Input } from './Input';

export const RecipeDetailsDialog = ({
  visible,
  recipe,
  onClose,
  onDelete,
  onCook,
  onUncook,
  onUpdate,
}) => {
  const [editedRecipe, setEditedRecipe] = React.useState(null);
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (recipe) {
      setEditedRecipe(recipe);
    }
  }, [recipe]);

  const handleSave = async () => {
    if (editedRecipe && recipe) {
      await onUpdate(recipe.name, editedRecipe);
      setIsEditing(false);
    }
  };

  const handleOpenUrl = async () => {
    if (editedRecipe?.url) {
      try {
        await Linking.openURL(editedRecipe.url);
      } catch (error) {
        console.error('Error opening URL:', error);
      }
    }
  };

  if (!recipe || !editedRecipe) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <ScrollView>
            <Card>
              <CardHeader>
                <Text style={styles.title}>Recipe Details</Text>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <>
                    <Input
                      label="Recipe Name"
                      value={editedRecipe.name}
                      onChangeText={(text) => setEditedRecipe({ ...editedRecipe, name: text })}
                      placeholder="Enter recipe name"
                    />
                    <Input
                      label="Recipe URL"
                      value={editedRecipe.url || ''}
                      onChangeText={(text) => setEditedRecipe({ ...editedRecipe, url: text })}
                      placeholder="Enter recipe URL (optional)"
                    />
                    <Input
                      label="Comments"
                      value={editedRecipe.comment || ''}
                      onChangeText={(text) => setEditedRecipe({ ...editedRecipe, comment: text })}
                      placeholder="Add any comments (optional)"
                      multiline
                      numberOfLines={3}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.recipeName}>{editedRecipe.name}</Text>
                    {editedRecipe.url && (
                      <Text style={styles.url} onPress={handleOpenUrl}>
                        {editedRecipe.url}
                      </Text>
                    )}
                    {editedRecipe.comment && (
                      <Text style={styles.comment}>{editedRecipe.comment}</Text>
                    )}
                    <Text style={styles.date}>
                      Added: {new Date(editedRecipe.createdAt).toLocaleDateString()}
                    </Text>
                  </>
                )}
              </CardContent>
              <CardFooter>
                {isEditing ? (
                  <>
                    <Button
                      variant="secondary"
                      onPress={() => {
                        setEditedRecipe(recipe);
                        setIsEditing(false);
                      }}
                      style={styles.button}
                    >
                      Cancel
                    </Button>
                    <Button
                      onPress={handleSave}
                      style={styles.button}
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onPress={() => setIsEditing(true)}
                      style={styles.button}
                    >
                      Edit
                    </Button>
                    {editedRecipe.cooked ? (
                      <Button
                        variant="secondary"
                        onPress={() => onUncook(editedRecipe.name)}
                        style={styles.button}
                      >
                        Mark as Uncooked
                      </Button>
                    ) : (
                      <Button
                        onPress={() => onCook(editedRecipe.name)}
                        style={styles.button}
                      >
                        Mark as Cooked
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onPress={() => onDelete(editedRecipe.name)}
                      style={styles.button}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          </ScrollView>
          <Button
            variant="secondary"
            onPress={onClose}
            style={styles.closeButton}
          >
            Close
          </Button>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  url: {
    fontSize: 14,
    color: '#2563eb',
    textDecorationLine: 'underline',
    marginBottom: 8,
  },
  comment: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
    color: '#6b7280',
  },
  button: {
    marginLeft: 8,
  },
  closeButton: {
    marginTop: 16,
  },
});