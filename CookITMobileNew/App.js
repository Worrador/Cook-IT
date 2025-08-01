import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView, Alert, Linking, StatusBar, AppState, BackHandler, Dimensions, KeyboardAvoidingView, Platform, ImageBackground, ScrollView, LayoutAnimation, Animated } from 'react-native';
import { Text, Surface, useTheme, IconButton, FAB, Portal, Dialog, Button as PaperButton, Provider as PaperProvider, MD3LightTheme, TextInput } from 'react-native-paper';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { RecipeDetailsDialog } from './src/components/RecipeDetailsDialog';
import HelpDialog from './src/components/HelpDialog';
import BuyCoffeeDialog from './src/components/BuyCoffeeDialog';
import AddRecipeDialog from './src/components/AddRecipeDialog';
import InteractivePin from './src/components/InteractivePin';
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
  cleanupStaleReferences,
} from './src/utils/storage';
import { BlurView } from 'expo-blur';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Custom theme configuration
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    // Main colors from original app - vibrant version with more muted background
    primary: '#5A4230', // Slightly darker brown from headerItems
    secondary: '#D86A3A', // Slightly muted orange from cardButtonBg
    tertiary: '#F2BC42', // Original vibrant yellow from addNewRecipeBtnDisabled
    background: '#F0DCA0', // More muted light yellow
    surface: '#f7f0e2', // Original beige from commentBackground
    error: '#d63031', // Keeping error red as is
    // Additional colors
    accent: '#2C3E50', // Dark blue from cardQuitBtn - keeping this as it's perfect
    text: '#1F2937', // Dark gray from bg-dark - keeping this as it's perfect
    onSurface: '#5A4230', // Slightly darker brown for text on light backgrounds
  },
};

const AppContent = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const dialogMaxHeight = windowHeight - insets.top - insets.bottom - 48; // 48 for vertical margin

  // State for dynamic height calculations
  const [headerHeight, setHeaderHeight] = useState(0);
  const [buttonAreaHeight, setButtonAreaHeight] = useState(0);

  // Calculate dynamic centering offset
  const availableSpace = windowHeight - insets.top - insets.bottom - headerHeight;
  const centerOffset = headerHeight > 0 && buttonAreaHeight > 0
    ? (availableSpace - buttonAreaHeight) / 4
    : 0; // Fallback to 0 until we have measurements

  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecipeDetails, setShowRecipeDetails] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [cookedRecipes, setCookedRecipes] = useState({});
  const [showBuyCoffee, setShowBuyCoffee] = useState(false);
  const [pinnedRecipes, setPinnedRecipes] = useState([]);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  const [suggestedRecipes, setSuggestedRecipes] = useState(new Set());
  const [isAnyDialogOpen, setIsAnyDialogOpen] = useState(false);
  const [isSuggestionFlow, setIsSuggestionFlow] = useState(false);
  const [bouncingPins, setBouncingPins] = useState(new Set()); // Track which pins should bounce
  const [showScrollBorder, setShowScrollBorder] = useState(false); // Track if scroll border should show

  // Animation values
  const corkSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const buttonPositionAnim = useRef(new Animated.Value(0)).current; // 0 = center, 1 = top
  const recipeAnimations = useRef(new Map()).current; // Map to store individual recipe animations

  // Function to get or create animation for a recipe
  const getRecipeAnimation = (recipeName) => {
    if (!recipeAnimations.has(recipeName)) {
      recipeAnimations.set(recipeName, new Animated.Value(0));
    }
    return recipeAnimations.get(recipeName);
  };

  useEffect(() => {
    // Hide status bar when component mounts
    StatusBar.setHidden(true);

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        StatusBar.setHidden(true);
      }
      setAppState(nextAppState);
    });

    // Show status bar when component unmounts
    return () => {
      StatusBar.setHidden(false);
      subscription.remove();
    };
  }, [appState]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    setIsAnyDialogOpen(showAddModal || showRecipeDetails || showHelp || showBuyCoffee);
  }, [showAddModal, showRecipeDetails, showHelp, showBuyCoffee]);

  // Animation effect for cork background
  useEffect(() => {
    const duration = 600; // Animation duration in milliseconds

    if (showPinnedOnly) {
      // Show cork background - slide up from bottom (pinned recipes enabled)
      Animated.parallel([
        Animated.timing(corkSlideAnim, {
          toValue: 1,
          duration: duration,
          useNativeDriver: false,
        }),
        Animated.timing(buttonPositionAnim, {
          toValue: 1,
          duration: duration,
          useNativeDriver: false,
        }),
      ]).start(() => {
        // After cork is visible, animate recipes in with stagger
        const pinnedRecipeNames = recipes
          .filter(recipe => pinnedRecipes.includes(recipe.name))
          .map(recipe => recipe.name);

        const recipeAnimationPromises = pinnedRecipeNames.map((recipeName, index) => {
          const recipeAnim = getRecipeAnimation(recipeName);
          const animation = Animated.timing(recipeAnim, {
            toValue: 1,
            duration: 400,
            delay: index * 100, // 100ms delay between each recipe
            useNativeDriver: false,
          });

          // Add bounce trigger after each recipe animation completes
          animation.start(() => {
            setBouncingPins(prev => new Set([...prev, recipeName]));
            // Reset bounce state after animation completes
            setTimeout(() => {
              setBouncingPins(prev => {
                const newSet = new Set(prev);
                newSet.delete(recipeName);
                return newSet;
              });
            }, 500); // Reset after bounce animation duration
          });

          return animation;
        });

        // Don't use Animated.parallel since we want individual completion callbacks
        // The delays will handle the staggering
      });
    } else {
      // Hide cork background - slide down and center buttons (pinned recipes disabled)
      // First, animate all recipes out simultaneously (no delay)
      const pinnedRecipeNames = recipes
        .filter(recipe => pinnedRecipes.includes(recipe.name))
        .map(recipe => recipe.name);

      // Clear bouncing pins when hiding
      setBouncingPins(new Set());

      const recipeAnimationPromises = pinnedRecipeNames.map((recipeName) => {
        const recipeAnim = getRecipeAnimation(recipeName);
        return Animated.timing(recipeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        });
      });

      Animated.parallel([
        ...recipeAnimationPromises,
        Animated.timing(corkSlideAnim, {
          toValue: 0,
          duration: duration,
          useNativeDriver: false,
        }),
        Animated.timing(buttonPositionAnim, {
          toValue: 0,
          duration: duration,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showPinnedOnly, recipes, pinnedRecipes]);

  useEffect(() => {
    const backAction = () => {
      if (showBuyCoffee) {
        setShowBuyCoffee(false);
        return true;
      }
      if (showHelp) {
        setShowHelp(false);
        return true;
      }
      if (showRecipeDetails) {
        setShowRecipeDetails(false);
        setSelectedRecipe(null);
        return true;
      }
      if (showAddModal) {
        setShowAddModal(false);
        return true;
      }
      // If no modals are open, return false to allow default behavior (e.g., exit app)
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    // Cleanup the event listener when the component unmounts
    return () => backHandler.remove();
  }, [showBuyCoffee, showHelp, showRecipeDetails, showAddModal]); // Dependencies array

  const loadInitialData = async () => {
    try {
      const [loadedRecipes, loadedCookedRecipes, tutorialCount, loadedPinnedRecipes] = await Promise.all([
        loadRecipes(),
        getCookedRecipes(),
        getTutorialCount(),
        getPinnedRecipes(),
      ]);

      // Clean up any stale references before setting state
      const cleanupResult = await cleanupStaleReferences();

      setRecipes(loadedRecipes);
      // Use cleaned data if cleanup was successful
      if (cleanupResult) {
        setCookedRecipes(cleanupResult.cookedRecipes);
        setPinnedRecipes(cleanupResult.pinnedRecipes);
      } else {
        setCookedRecipes(loadedCookedRecipes);
        setPinnedRecipes(loadedPinnedRecipes);
      }
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

  const handleAddRecipe = async (recipe) => {
    const updatedRecipes = await addRecipe(recipe);
    setRecipes(updatedRecipes);
    setShowAddModal(false);
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

  const handleChooseRecipe = async () => {
    if (recipes.length === 0) {
      Alert.alert('No Recipes', 'Please add some recipes first!');
      return;
    }

    try {
      let attempts = 0;
      let recipe = null;

      while (attempts < 10) {
        const randomIndex = Math.floor(Math.random() * recipes.length);
        recipe = recipes[randomIndex];

        // If we got a recipe and it hasn't been shown before, use it
        if (recipe && !suggestedRecipes.has(recipe.name)) {
          setSuggestedRecipes(prev => new Set([...prev, recipe.name]));
          setSelectedRecipe(recipe);
          setIsSuggestionFlow(true);
          setShowRecipeDetails(true);
          return;
        }

        attempts++;
      }

      // If we've tried 10 times and still haven't found a new recipe
      setSuggestedRecipes(new Set()); // Reset the set of seen recipes
      setSelectedRecipe(recipes[Math.floor(Math.random() * recipes.length)]);
      setIsSuggestionFlow(true);
      setShowRecipeDetails(true);
    } catch (error) {
      console.error('Error choosing recipe:', error);
      Alert.alert('Error', 'Failed to choose a recipe');
    }
  };

  const handleNextRecipe = async () => {
    if (suggestedRecipes.size >= recipes.length) {
      // If we've shown all recipes, reset and start fresh
      setSuggestedRecipes(new Set());
      return { empty: true };
    }

    await handleChooseRecipe();
    return selectedRecipe;
  };

  const handleQuit = () => {
    BackHandler.exitApp();
  };

  const handleTogglePinned = async (recipeName) => {
    // Configure layout animation for smooth removal
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    const updatedPinnedRecipes = await togglePinnedRecipe(recipeName);
    setPinnedRecipes(updatedPinnedRecipes);
  };

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
      {isAnyDialogOpen && (
        <View style={styles.dialogOverlay} />
      )}
      <Surface style={[styles.header, { backgroundColor: theme.colors.primary }]} elevation={4} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
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
              icon={showPinnedOnly ? "pin" : "pin-off"}
              size={24}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowPinnedOnly(!showPinnedOnly)}
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

      <Animated.View style={[
        styles.mainButtons,
        {
          transform: [{
            translateY: buttonPositionAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [centerOffset, 0], // Use dynamic centering when disabled, move up when enabled
            })
          }]
        }
      ]} onLayout={e => setButtonAreaHeight(e.nativeEvent.layout.height)}>
        <Button
          onPress={handleChooseRecipe}
          style={[styles.mainButton, { backgroundColor: theme.colors.secondary }]}
          icon="shuffle"
          labelStyle={styles.mainButtonLabel}
        >
          Choose Recipe
        </Button>
        <Button
          onPress={() => setShowAddModal(true)}
          style={[styles.mainButton, { backgroundColor: theme.colors.primary }]}
          icon="plus"
          labelStyle={styles.mainButtonLabel}
        >
          Add Recipe
        </Button>
        <Button
          onPress={handleQuit}
          style={[styles.quitButton, { backgroundColor: theme.colors.accent }]}
          variant="destructive"
          icon="exit-to-app"
          labelStyle={styles.mainButtonLabel}
        >
          Quit
        </Button>
      </Animated.View>

      <View style={[
        styles.listContainer
      ]}>
        <Animated.View style={[
          styles.corkBackground,
          {
            transform: [{
              translateY: corkSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [windowHeight, 0], // Slide up from bottom of screen
              })
            }],
            opacity: corkSlideAnim,
            zIndex: 1, // Keep cork background behind recipes
            overflow: 'visible', // Allow pins to extend beyond cork boundaries
          }
        ]}>
          <ImageBackground 
            source={require('./assets/wine-cork-wp4.png')}
            style={styles.corkImageBackground}
            resizeMode="cover"
          >
            <View style={styles.corkOverlay} />
          </ImageBackground>
        </Animated.View>

        {/* Pinned recipes - slide with cork background */}
        <Animated.View
          style={[
            {
              flex: 1,
              transform: [{
                translateY: corkSlideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [windowHeight, 0], // Slide with cork background
                })
              }],
              opacity: 1, // Keep full opacity for pinned recipes on cork
              zIndex: 12, // Ensure recipes and pins are above all other layers
            }
          ]}
        >
          <FlatList
            data={recipes.filter(recipe => pinnedRecipes.includes(recipe.name))}
            keyExtractor={(item) => item.name}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const isAtBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 10;
              setShowScrollBorder(isAtBottom);
            }}
            scrollEventThrottle={16}
            style={[
              styles.list, 
              { 
                backgroundColor: 'transparent',
                borderTopWidth: 10,
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderBottomWidth: showScrollBorder ? 10 : 0,
                borderTopColor: '#C4A484',
                borderLeftColor: '#C4A484',
                borderRightColor: '#C4A484',
                borderBottomColor: '#C4A484',
              }
            ]}
            renderItem={({ item, index }) => {
              const recipeAnim = getRecipeAnimation(item.name);
              return (
                <Animated.View
                  style={{
                    transform: [{
                      translateY: recipeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [windowHeight, 0], // Start from bottom of screen, slide to final position
                      })
                    }],
                    opacity: recipeAnim.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [0, 0, 1], // Fade out when sliding down, but stay opaque when sliding up
                    }),
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedRecipe(item);
                      setIsSuggestionFlow(false);
                      setShowRecipeDetails(true);
                    }}
                  >
                    <Surface
                      style={[
                        styles.recipeCard,
                        { backgroundColor: theme.colors.surface },
                        styles.pinnedRecipeCard
                      ]}
                      elevation={4}
                    >
                      <InteractivePin
                        isPinned={pinnedRecipes.includes(item.name)}
                        onToggle={() => handleTogglePinned(item.name)}
                        size={32}
                        triggerBounce={bouncingPins.has(item.name)}
                        key={`pin-${item.name}-${showPinnedOnly}`} // Force re-mount to trigger bounce animation
                      />

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
                            <View style={[styles.badge, { backgroundColor: theme.colors.tertiary }]}>
                              <MaterialCommunityIcons name="pin" size={16} color={theme.colors.onSurface} />
                              <Text style={[styles.badgeText, { color: theme.colors.onSurface }]}>Pinned</Text>
                            </View>
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
                </Animated.View>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        </Animated.View>

        {/* Regular recipes - always visible when not in pinned mode, but exclude pinned recipes */}
        {!showPinnedOnly && (
          <FlatList
            data={recipes.filter(recipe => !pinnedRecipes.includes(recipe.name))}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedRecipe(item);
                  setIsSuggestionFlow(false);
                  setShowRecipeDetails(true);
                }}
              >
                <Surface
                  style={[
                    styles.recipeCard,
                    { backgroundColor: theme.colors.surface }
                  ]}
                  elevation={2}
                >
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
        )}
      </View>

      <Portal>
        <AddRecipeDialog
          visible={showAddModal}
          onDismiss={() => setShowAddModal(false)}
          onAddRecipe={handleAddRecipe}
        />
      </Portal>

      <RecipeDetailsDialog
        visible={showRecipeDetails && selectedRecipe !== null}
        recipe={selectedRecipe}
        isSuggestionFlow={isSuggestionFlow}
        onClose={() => {
          setShowRecipeDetails(false);
          setSelectedRecipe(null);
          setIsSuggestionFlow(false);
        }}
        onDelete={handleDeleteRecipe}
        onCook={handleCook}
        onUncook={handleUncook}
        onUpdate={handleUpdateRecipe}
        onNext={handleNextRecipe}
        onTogglePin={handleTogglePinned}
        isPinned={selectedRecipe ? pinnedRecipes.includes(selectedRecipe.name) : false}
      />

      <Portal>
        <Dialog
          visible={showHelp}
          onDismiss={() => setShowHelp(false)}
          style={[styles.dialog, { backgroundColor: theme.colors.surface, maxHeight: dialogMaxHeight }]}
        >
          <HelpDialog onClose={() => setShowHelp(false)} />
        </Dialog>
      </Portal>

      <Portal>
        <Dialog
          visible={showBuyCoffee}
          onDismiss={() => setShowBuyCoffee(false)}
          style={[styles.dialog, { backgroundColor: theme.colors.surface, maxHeight: dialogMaxHeight }]}
        >
          <BuyCoffeeDialog onClose={() => setShowBuyCoffee(false)} />
        </Dialog>
      </Portal>
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
    overflow: 'visible', // Allow pins to extend beyond container boundaries
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
    padding: 20,
    gap: 16,
  },
  mainButton: {
    borderRadius: 12,
    paddingVertical: 8,
  },
  quitButton: {
    borderRadius: 12,
    paddingVertical: 8,
    width: '45%',
    alignSelf: 'center',
  },
  mainButtonLabel: {
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 2,
  },
  recipeCard: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  pinnedRecipeCard: {
    backgroundColor: theme.colors.surface, // Match the yellowish background from the main container
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8, // Stronger bottom shadow to simulate hanging on cork board
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    // Android shadow
    elevation: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(139, 115, 85, 0.1)',
    overflow: 'visible', // Allow pin to show above the card
  },
  pinnedRecipeCardRegular: {
    shadowColor: '#8B7355',
    shadowOffset: {
      width: 2,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    // Android shadow
    elevation: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(139, 115, 85, 0.1)',
  },
  pinIcon: {
    position: 'absolute',
    top: -5,
    right: -5,
    transform: [{ rotate: '25deg' }],
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    paddingBottom: 24, // Added padding to prevent overlap with nav bar
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    gap: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  inputLabel: {
    width: 80,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '500',
    paddingTop: 0,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 32,
    gap: 12,
  },
  modalButton: {
    minWidth: 120,
    paddingVertical: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingTop: 16, // Add top margin for pinned recipes
  },
  dialogOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 20,
    paddingTop: 4,
    gap: 8,
  },
  dialog: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  titleIcon: {
    // marginRight is no longer needed, gap is used instead
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
    paddingTop: 0,
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
  corkBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1, // Higher z-index to show above the container background
  },
  corkImageBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  corkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(122, 57, 0, 0)',
  },
  listContainer: {
    flex: 1,
    position: 'relative', // Added to properly contain the absolute-positioned cork background
    overflow: 'visible', // Allow pins to extend beyond container boundaries
  },
});
