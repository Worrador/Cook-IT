import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView, Alert, Linking, StatusBar } from 'react-native';
import { Text, Surface, useTheme, IconButton, FAB, Portal, Dialog, Button as PaperButton, Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { RecipeDetailsDialog } from './src/components/RecipeDetailsDialog';
import { HelpDialog } from './src/components/HelpDialog';
import { BuyCoffeeDialog } from './src/components/BuyCoffeeDialog';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  loadRecipes,
  addRecipe,
  deleteRecipe,
  updateRecipe,
  getCookedRecipes,
  setCookedStatus,
  getTutorialCount,
  incrementTutorialCount,
  getPinnedRecipes,
  togglePinnedRecipe,
} from './src/utils/storage';

// Custom theme configuration
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    // Main colors from original app
    primary: '#6B4F37', // Brown from headerItems
    secondary: '#E06D3D', // Orange from cardButtonBg
    tertiary: '#F2BC42', // Yellow from addNewRecipeBtnDisabled
    background: '#FBE7A0', // Light yellow from cardBackground
    surface: '#f7f0e2', // Light beige from commentBackground
    error: '#d63031', // Red from error toast
    // Additional colors
    accent: '#2C3E50', // Dark blue from cardQuitBtn
    text: '#1F2937', // Dark gray from bg-dark
    onSurface: '#6B4F37', // Brown for text on light backgrounds
  },
};

const AppContent = () => {
  const theme = useTheme();
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ name: '', url: '', comment: '' });
  const [error, setError] = useState('');
  const [showRecipeDetails, setShowRecipeDetails] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [cookedRecipes, setCookedRecipes] = useState({});
  const [showBuyCoffee, setShowBuyCoffee] = useState(false);
  const [pinnedRecipes, setPinnedRecipes] = useState([]);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);

  useEffect(() => {
    // Hide status bar when component mounts
    StatusBar.setHidden(true);

    // Show status bar when component unmounts
    return () => {
      StatusBar.setHidden(false);
    };
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [loadedRecipes, loadedCookedRecipes, tutorialCount, loadedPinnedRecipes] = await Promise.all([
        loadRecipes(),
        getCookedRecipes(),
        getTutorialCount(),
        getPinnedRecipes(),
      ]);

      setRecipes(loadedRecipes);
      setCookedRecipes(loadedCookedRecipes);
      setPinnedRecipes(loadedPinnedRecipes);
      setIsLoading(false);

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

  const handleChooseRecipe = () => {
    if (recipes.length === 0) {
      Alert.alert('No Recipes', 'Please add some recipes first!');
      return;
    }
    const randomIndex = Math.floor(Math.random() * recipes.length);
    setSelectedRecipe(recipes[randomIndex]);
    setShowRecipeDetails(true);
  };

  const handleQuit = () => {
    Alert.alert(
      'Quit App',
      'Are you sure you want to quit?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Quit',
          style: 'destructive',
          onPress: () => {
            // On mobile, we can't actually quit the app, but we can minimize it
            // You might want to add any cleanup logic here
          },
        },
      ],
    );
  };

  const handleTogglePinned = async (recipeName) => {
    const updatedPinnedRecipes = await togglePinnedRecipe(recipeName);
    setPinnedRecipes(updatedPinnedRecipes);
  };

  const filteredRecipes = showPinnedOnly
    ? recipes.filter(recipe => pinnedRecipes.includes(recipe.name))
    : recipes;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialCommunityIcons name="chef-hat" size={48} color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your recipes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar backgroundColor={theme.colors.primary} />
      <Surface style={[styles.header, { backgroundColor: theme.colors.primary }]} elevation={4}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="chef-hat" size={32} color={theme.colors.tertiary} />
            <View>
              <Text style={[styles.title, { color: theme.colors.tertiary }]}>CookIT</Text>
              <Text style={[styles.subtitle, { color: theme.colors.surface }]}>Your Recipe Manager</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <IconButton
              icon="help-circle"
              size={24}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowHelp(true)}
            />
            <IconButton
              icon="coffee"
              size={24}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowBuyCoffee(true)}
            />
          </View>
        </View>
      </Surface>

      <View style={styles.mainButtons}>
        <Surface style={[styles.buttonCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Button
            onPress={handleChooseRecipe}
            style={[styles.mainButton, { backgroundColor: theme.colors.secondary }]}
            icon="shuffle"
          >
            Choose Recipe
          </Button>
          <Button
            onPress={() => setShowAddModal(true)}
            style={[styles.mainButton, { backgroundColor: theme.colors.primary }]}
            icon="plus"
          >
            Add Recipe
          </Button>
          <Button
            onPress={() => setShowPinnedOnly(!showPinnedOnly)}
            style={[
              styles.mainButton,
              showPinnedOnly ? { backgroundColor: theme.colors.tertiary } : { backgroundColor: theme.colors.primary }
            ]}
            icon={showPinnedOnly ? "pin-off" : "pin"}
          >
            {showPinnedOnly ? 'Show All' : 'Pinned Recipes'}
          </Button>
          <Button
            onPress={handleQuit}
            style={[styles.mainButton, { backgroundColor: theme.colors.accent }]}
            variant="destructive"
            icon="exit-to-app"
          >
            Quit
          </Button>
        </Surface>
      </View>

      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => {
              setSelectedRecipe(item);
              setShowRecipeDetails(true);
            }}
          >
            <Surface style={[styles.recipeCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
              <View style={styles.recipeHeader}>
                <View style={styles.recipeTitleContainer}>
                  <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                  <View style={styles.recipeBadges}>
                    {cookedRecipes[item.name] && (
                      <View style={[styles.badge, { backgroundColor: theme.colors.secondary }]}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="white" />
                        <Text style={styles.badgeText}>Cooked</Text>
                      </View>
                    )}
                    {pinnedRecipes.includes(item.name) && (
                      <View style={[styles.badge, { backgroundColor: theme.colors.tertiary }]}>
                        <MaterialCommunityIcons name="pin" size={16} color={theme.colors.onSurface} />
                        <Text style={[styles.badgeText, { color: theme.colors.onSurface }]}>Pinned</Text>
                      </View>
                    )}
                  </View>
                </View>
                {item.comment && (
                  <Text style={[styles.recipeComment, { color: theme.colors.onSurface }]} numberOfLines={2}>
                    {item.comment}
                  </Text>
                )}
                <Text style={[styles.recipeDate, { color: theme.colors.onSurface }]}>
                  Added: {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </Surface>
          </TouchableOpacity>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      <Portal>
        <Modal
          visible={showAddModal}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalContainer}>
            <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} elevation={4}>
              <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Add New Recipe</Text>
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
                <PaperButton
                  mode="contained"
                  onPress={handleAddRecipe}
                  style={[styles.modalButton, { backgroundColor: theme.colors.primary }]}
                >
                  Add
                </PaperButton>
                <PaperButton
                  mode="outlined"
                  onPress={() => {
                    setShowAddModal(false);
                    setNewRecipe({ name: '', url: '', comment: '' });
                    setError('');
                  }}
                  style={[styles.modalButton, { borderColor: theme.colors.primary }]}
                  textColor={theme.colors.primary}
                >
                  Cancel
                </PaperButton>
              </View>
            </Surface>
          </View>
        </Modal>
      </Portal>

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

      <BuyCoffeeDialog
        visible={showBuyCoffee}
        onClose={() => setShowBuyCoffee(false)}
      />
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <AppContent />
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B4F37',
  },
  header: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  mainButtons: {
    padding: 16,
  },
  buttonCard: {
    borderRadius: 12,
    padding: 16,
  },
  mainButton: {
    marginBottom: 12,
    borderRadius: 8,
  },
  recipeCard: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  recipeHeader: {
    padding: 16,
  },
  recipeTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  recipeBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    color: 'white',
  },
  recipeComment: {
    fontSize: 14,
    marginBottom: 8,
  },
  recipeDate: {
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(107, 79, 55, 0.5)', // Brown with opacity
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
  modalButton: {
    minWidth: 100,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
});
