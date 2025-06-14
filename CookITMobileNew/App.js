import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView } from 'react-native';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { loadRecipes, addRecipe, deleteRecipe } from './src/utils/storage';

export default function App() {
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRecipe, setNewRecipe] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadInitialRecipes();
  }, []);

  const loadInitialRecipes = async () => {
    const loadedRecipes = await loadRecipes();
    setRecipes(loadedRecipes);
    setIsLoading(false);
  };

  const handleAddRecipe = async () => {
    if (!newRecipe.trim()) {
      setError('Recipe name is required');
      return;
    }

    const recipe = {
      name: newRecipe.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedRecipes = await addRecipe(recipe);
    setRecipes(updatedRecipes);
    setNewRecipe('');
    setShowAddModal(false);
    setError('');
  };

  const handleDeleteRecipe = async (recipeName) => {
    const updatedRecipes = await deleteRecipe(recipeName);
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
          <Card>
            <CardHeader>
              <Text style={styles.recipeName}>{item.name}</Text>
            </CardHeader>
            <CardContent>
              <Text style={styles.recipeDate}>
                Added: {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </CardContent>
            <CardFooter>
              <Button
                variant="ghost"
                onPress={() => handleDeleteRecipe(item.name)}
              >
                Delete
              </Button>
            </CardFooter>
          </Card>
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
              value={newRecipe}
              onChangeText={setNewRecipe}
              placeholder="Enter recipe name"
              error={error}
            />
            <View style={styles.modalButtons}>
              <Button
                variant="secondary"
                onPress={() => {
                  setShowAddModal(false);
                  setNewRecipe('');
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
  recipeDate: {
    fontSize: 14,
    color: '#6b7280',
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
