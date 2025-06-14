import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { RecipeDetailsDialog } from './src/components/RecipeDetailsDialog';
import { HelpDialog } from './src/components/HelpDialog';
import {
  loadRecipes,
  addRecipe,
  deleteRecipe,
  updateRecipe,
  getCookedRecipes,
  setCookedStatus,
  getTutorialCount,
  incrementTutorialCount,
} from './src/utils/storage';

export default function App() {
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [error, setError] = useState('');
  const [showRecipeDetails, setShowRecipeDetails] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [cookedRecipes, setCookedRecipes] = useState({});

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [loadedRecipes, loadedCookedRecipes, tutorialCount] = await Promise.all([
        loadRecipes(),
        getCookedRecipes(),
        getTutorialCount(),
      ]);

      setRecipes(loadedRecipes);
      setCookedRecipes(loadedCookedRecipes);
      setIsLoading(false);

      // Show help if tutorial count is less than 5
      if (tutorialCount < 5) {
        setShowHelp(true);
        await incrementTutorialCount();
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setIsLoading(false);
    }
  };

  const handleAddRecipe = async () => {
    if (!newRecipe.name.trim()) {
      setError('Recipe name is required');
      return;
    }

    const recipe = {
      name: newRecipe.name.trim(),
      url: newRecipe.url.trim(),
      comment: newRecipe.comment.trim(),
    };

    const updatedRecipes = await addRecipe(recipe);
    setRecipes(updatedRecipes);
    setNewRecipe({ name: '', url: '', comment: '' });
    setShowAddModal(false);
    setError('');
  };

  const handleDeleteRecipe = async (recipeName) => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedRecipes = await deleteRecipe(recipeName);
            setRecipes(updatedRecipes);
            setShowRecipeDetails(false);
          },
        },
      ],
    );
  };

  const handleCook = async (recipeName) => {
    const updatedCookedRecipes = await setCookedStatus(recipeName, true);
    setCookedRecipes(updatedCookedRecipes);
  };

  const handleUncook = async (recipeName) => {
    const updatedCookedRecipes = await setCookedStatus(recipeName, false);
    setCookedRecipes(updatedCookedRecipes);
  };

  const handleUpdateRecipe = async (oldName, updatedRecipe) => {
    const updatedRecipes = await updateRecipe(oldName, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CookIT</Text>
        <Text style={styles.subtitle}>Your Recipe Manager</Text>
        <Button
          variant="ghost"
          onPress={() => setShowHelp(true)}
          style={styles.helpButton}
        >
          Help
        </Button>
      </View>

      <Button
        onPress={() => setShowAddModal(true)}
        style={styles.addButton}
      >
        Add Recipe
      </Button>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => {
              setSelectedRecipe(item);
              setShowRecipeDetails(true);
            }}
          >
            <Card>
              <CardHeader>
                <Text style={styles.recipeName}>{item.name}</Text>
                {cookedRecipes[item.name] && (
                  <Text style={styles.cookedBadge}>Cooked</Text>
                )}
              </CardHeader>
              <CardContent>
                {item.comment && (
                  <Text style={styles.recipeComment} numberOfLines={2}>
                    {item.comment}
                  </Text>
                )}
                <Text style={styles.recipeDate}>
                  Added: {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </CardContent>
            </Card>
          </TouchableOpacity>
        )}
        style={styles.list}
      />

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Recipe</Text>
            <Input
              label="Recipe Name"
              value={newRecipe.name}
              onChangeText={(text) => setNewRecipe({ ...newRecipe, name: text })}
              placeholder="Enter recipe name"
              error={error}
            />
            <Input
              label="Recipe URL"
              value={newRecipe.url}
              onChangeText={(text) => setNewRecipe({ ...newRecipe, url: text })}
              placeholder="Enter recipe URL (optional)"
            />
            <Input
              label="Comments"
              value={newRecipe.comment}
              onChangeText={(text) => setNewRecipe({ ...newRecipe, comment: text })}
              placeholder="Add any comments (optional)"
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtons}>
              <Button
                variant="secondary"
                onPress={() => {
                  setShowAddModal(false);
                  setNewRecipe({ name: '', url: '', comment: '' });
                  setError('');
                }}
                style={styles.modalButton}
              >
                Cancel
              </Button>
              <Button
                onPress={handleAddRecipe}
                style={styles.modalButton}
              >
                Add
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <RecipeDetailsDialog
        visible={showRecipeDetails && selectedRecipe !== null}
        recipe={selectedRecipe}
        onClose={() => {
          setShowRecipeDetails(false);
          setSelectedRecipe(null);
        }}
        onDelete={handleDeleteRecipe}
        onCook={handleCook}
        onUncook={handleUncook}
        onUpdate={handleUpdateRecipe}
      />

      <HelpDialog
        visible={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  helpButton: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  addButton: {
    margin: 16,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  recipeComment: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  recipeDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  cookedBadge: {
    fontSize: 12,
    color: '#059669',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  modalButton: {
    marginLeft: 8,
  },
});
