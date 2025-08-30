import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView, Alert, Linking, StatusBar, AppState, BackHandler, Dimensions, KeyboardAvoidingView, Platform, ImageBackground, ScrollView, LayoutAnimation, Animated, LogBox } from 'react-native';
import { Text, Surface, useTheme, IconButton, FAB, Portal, Dialog, Button as PaperButton, Provider as PaperProvider, MD3LightTheme, TextInput } from 'react-native-paper';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { RecipeDetailsDialog } from './src/components/RecipeDetailsDialog';
import HelpDialog from './src/components/HelpDialog';
import BuyCoffeeDialog from './src/components/BuyCoffeeDialog';
import AddRecipeDialog from './src/components/AddRecipeDialog';
import InteractivePin from './src/components/InteractivePin';
import RecipeBookDialog from './src/components/RecipeBookDialog';
import EmptyRecipeBookDialog from './src/components/EmptyRecipeBookDialog';
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
  addSampleRecipes,
  getLastCookedDates, // Add this import
  getCookCounts,
} from './src/utils/storage';
import syncService from './src/services/syncService';
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

// Hide console error messages at bottom of screen
LogBox.ignoreAllLogs();

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file'
];

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
  const [lastCookedDates, setLastCookedDates] = useState({});
  const [cookCounts, setCookCounts] = useState({});
  const [showBuyCoffee, setShowBuyCoffee] = useState(false);
  const [showRecipeBook, setShowRecipeBook] = useState(false);
  const [pinnedRecipes, setPinnedRecipes] = useState([]);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showHelpButton, setShowHelpButton] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  const [suggestedRecipes, setSuggestedRecipes] = useState(new Set());
  const [isAnyDialogOpen, setIsAnyDialogOpen] = useState(false);
  const [isSuggestionFlow, setIsSuggestionFlow] = useState(false);
  const [bouncingPins, setBouncingPins] = useState(new Set()); // Track which pins should bounce
  const [showScrollBorder, setShowScrollBorder] = useState(false); // Track if scroll border should show
  const [pressedRecipe, setPressedRecipe] = useState(null); // Track which recipe is being pressed

  // Google Drive sync states
  const [syncStatus, setSyncStatus] = useState({ isAuthenticated: false, lastSync: null, inProgress: false });
  const [showSyncInfo, setShowSyncInfo] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0); // Track actual sync progress (0-100)

  // Empty recipe book dialog states
  const [showEmptyRecipeBookDialog, setShowEmptyRecipeBookDialog] = useState(false);
  const [isAddingSampleRecipes, setIsAddingSampleRecipes] = useState(false);
  const [tutorialCount, setTutorialCountState] = useState(0);

  // Custom alert states
  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

  // Animation values
  const corkSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const buttonPositionAnim = useRef(new Animated.Value(0)).current; // 0 = center, 1 = top
  const recipeAnimations = useRef(new Map()).current; // Map to store individual recipe animations
  const syncIconRotation = useRef(new Animated.Value(0)).current; // For sync icon rotation
  const progressBarPulse = useRef(new Animated.Value(0)).current; // For progress bar pulse
  const progressBarFill = useRef(new Animated.Value(0)).current; // For actual progress bar fill

  // Helper function to get or create recipe animations
  const getRecipeAnimation = (recipeName) => {
    if (!recipeAnimations.has(recipeName)) {
      recipeAnimations.set(recipeName, new Animated.Value(0));
    }
    return recipeAnimations.get(recipeName);
  };

  // Helper function to show custom styled alerts
  const showCustomAlert = (title, message, type = 'info') => {
    setCustomAlert({ visible: true, title, message, type });
  };

  // Sync icon rotation animation
  useEffect(() => {
    if (syncStatus.inProgress) {
      // Create a continuous rotation animation that actually spins
      const rotateAnimation = Animated.loop(
        Animated.timing(syncIconRotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      rotateAnimation.start();

      // Progress bar pulse animation (just for visual feedback)
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(progressBarPulse, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(progressBarPulse, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      );
      pulseAnimation.start();
    } else {
      syncIconRotation.setValue(0);
      progressBarPulse.setValue(0);
      setSyncProgress(0); // Reset progress when sync stops
    }
  }, [syncStatus.inProgress]);

  useEffect(() => {
    // Hide status bar when component mounts
    StatusBar.setHidden(true);

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        StatusBar.setHidden(true);
        // Trigger sync when app comes to foreground
        handleSyncCheck();
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

    // Check app open count for help button visibility
    const checkHelpButtonVisibility = async () => {
      try {
        const appOpenCount = await getTutorialCount();
        const newCount = appOpenCount + 1;
        await incrementTutorialCount();

        // Show help button for first 5 times, then every 5th time
        const shouldShow = newCount <= 5 || newCount % 5 === 0;
        setShowHelpButton(shouldShow);
      } catch (error) {
        console.error('Error checking help button visibility:', error);
        setShowHelpButton(true); // Fallback to showing it
      }
    };

    checkHelpButtonVisibility();
  }, []);

  useEffect(() => {
    setIsAnyDialogOpen(showAddModal || showRecipeDetails || showHelp || showBuyCoffee || showEmptyRecipeBookDialog || customAlert.visible);
  }, [showAddModal, showRecipeDetails, showHelp, showBuyCoffee, showEmptyRecipeBookDialog, customAlert.visible]);

  // Set initial border state for pinned recipes
  useEffect(() => {
    if (showPinnedOnly && pinnedRecipes.length > 0) {
      // Show border initially for pinned recipes
      setShowScrollBorder(true);
    }
  }, [showPinnedOnly, pinnedRecipes.length]);

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
      if (showEmptyRecipeBookDialog) {
        setShowEmptyRecipeBookDialog(false);
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
  }, [showBuyCoffee, showHelp, showRecipeDetails, showAddModal, showEmptyRecipeBookDialog]); // Dependencies array

  const loadInitialData = async () => {
    try {
      const [loadedRecipes, loadedCookedRecipes, tutorialCount, loadedPinnedRecipes, loadedLastCookedDates, loadedCookCounts] = await Promise.all([
        loadRecipes(),
        getCookedRecipes(),
        getTutorialCount(),
        getPinnedRecipes(),
        getLastCookedDates(),
        getCookCounts(),
      ]);

      // Clean up any stale references before setting state
      const cleanupResult = await cleanupStaleReferences();

      setRecipes(loadedRecipes);
      // Use cleaned data if cleanup was successful
      if (cleanupResult) {
        setCookedRecipes(cleanupResult.cookedRecipes);
        setPinnedRecipes(cleanupResult.pinnedRecipes);
        setLastCookedDates(cleanupResult.lastCookedDates || loadedLastCookedDates);
        setCookCounts(cleanupResult.cookCounts || loadedCookCounts);
      } else {
        setCookedRecipes(loadedCookedRecipes);
        setPinnedRecipes(loadedPinnedRecipes);
        setLastCookedDates(loadedLastCookedDates);
        setCookCounts(loadedCookCounts);
      }
      setTutorialCountState(tutorialCount);
      setIsLoading(false);

      // Show tutorial for first 5 times
      if (tutorialCount < 5) {
        setShowHelp(true);
        await incrementTutorialCount();
      }

      // Show empty recipe book dialog if no recipes exist
      if (loadedRecipes.length === 0) {
        setShowEmptyRecipeBookDialog(true);
      }

      // Initialize Google Drive sync
      await initializeSync();
    } catch (error) {
      console.error('Error loading initial data:', error);
      setIsLoading(false);
    }
  };

  const initializeSync = async () => {
    try {
      console.log('Initializing Google Drive sync...');
      setSyncStatus(prev => ({ ...prev, inProgress: true }));
      setSyncProgress(0); // Reset progress - keep empty until connection confirmed

      const syncResult = await syncService.initializeSync();

      // Only start filling progress after we know we can connect
      if (syncResult.success) {
        // Gradually fill to 90% over 1.5 seconds (faster for initialization)
        const fillDuration = 1500; // 1.5 seconds
        const startTime = Date.now();

        const progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / fillDuration) * 90, 90);
          setSyncProgress(progress);

          if (progress >= 90) {
            clearInterval(progressInterval);
          }
        }, 50); // Update every 50ms for smooth animation

        // Complete to 100% after a short delay
        setTimeout(() => {
          setSyncProgress(100);
          clearInterval(progressInterval);
        }, fillDuration + 300);
      }

      if (syncResult.success && syncResult.hasChanges) {
        console.log('Sync completed with changes, reloading data...');
        // Reload data after successful sync with changes
        const [loadedRecipes, loadedCookedRecipes, loadedPinnedRecipes] = await Promise.all([
          loadRecipes(),
          getCookedRecipes(),
          getPinnedRecipes(),
        ]);

        setRecipes(loadedRecipes);
        setCookedRecipes(loadedCookedRecipes);
        setPinnedRecipes(loadedPinnedRecipes);
      }

      // Update sync status
      const status = await syncService.checkSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error initializing sync:', error);
      setSyncStatus(prev => ({ ...prev, inProgress: false }));
    }
  };

  const handleSyncCheck = async () => {
    try {
      const status = await syncService.checkSyncStatus();
      setSyncStatus(status);

      if (status.isAuthenticated && !status.inProgress) {
        // Trigger a background sync
        syncService.performSync().then(result => {
          if (result.success && result.hasChanges) {
            // Reload data if there were changes
            loadInitialData();
          }
        }).catch(error => {
          console.warn('Background sync failed:', error);
        });
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncStatus(prev => ({ ...prev, inProgress: true }));
      setSyncProgress(0); // Reset progress - keep empty until connection confirmed

      // Check if we're authenticated first
      const status = await syncService.checkSyncStatus();

      if (!status.isAuthenticated) {
        // Not authenticated - start authentication process
        console.log('Starting Google Drive authentication...');

        // Initialize sync service (which will handle authentication)
        const initResult = await syncService.initializeSync();

        if (initResult.success) {
          // Authentication successful, now sync
          const syncResult = await syncService.performSync();

          if (syncResult.success) {
            // Gradually fill to 90% over 2 seconds
            const fillDuration = 2000; // 2 seconds
            const startTime = Date.now();

            const progressInterval = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min((elapsed / fillDuration) * 90, 90);
              setSyncProgress(progress);

              if (progress >= 90) {
                clearInterval(progressInterval);
              }
            }, 50); // Update every 50ms for smooth animation

            // Complete to 100% after a short delay
            setTimeout(() => {
              setSyncProgress(100);
              clearInterval(progressInterval);
            }, fillDuration + 500);

            showCustomAlert('Authentication & Sync Complete', 'Successfully connected to Google Drive and synced your recipes!', 'success');
            if (syncResult.hasChanges) {
              // Reload data after successful sync with changes
              await loadInitialData();
            }
          } else {
            showCustomAlert('Sync Failed', syncResult.message, 'error');
          }
        } else {
          // Authentication failed
          showCustomAlert('Authentication Failed', initResult.message, 'error');
        }
      } else {
        // Already authenticated - just sync
        console.log('Already authenticated, performing sync...');
        const syncResult = await syncService.performSync();

        if (syncResult.success) {
          // Gradually fill to 90% over 2 seconds
          const fillDuration = 2000; // 2 seconds
          const startTime = Date.now();

          const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / fillDuration) * 90, 90);
            setSyncProgress(progress);

            if (progress >= 90) {
              clearInterval(progressInterval);
            }
          }, 50); // Update every 50ms for smooth animation

          // Complete to 100% after a short delay
          setTimeout(() => {
            setSyncProgress(100);
            clearInterval(progressInterval);
          }, fillDuration + 500);

          showCustomAlert('Sync Complete', syncResult.message, 'success');
          if (syncResult.hasChanges) {
            // Reload data after successful sync with changes
            await loadInitialData();
          }
        } else {
          // If sync failed, keep progress at 0 (empty vibrating bar)
          showCustomAlert('Sync Failed', syncResult.message, 'error');
        }
      }

      // Update sync status
      const updatedStatus = await syncService.checkSyncStatus();
      setSyncStatus(updatedStatus);
    } catch (error) {
      console.error('Manual sync error:', error);
      showCustomAlert('Sync Error', error.message, 'error');
      setSyncStatus(prev => ({ ...prev, inProgress: false }));
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

    // Reload last cooked dates and cook counts after cooking
    const [updatedLastCookedDates, updatedCookCounts] = await Promise.all([
      getLastCookedDates(),
      getCookCounts(),
    ]);
    setLastCookedDates(updatedLastCookedDates);
    setCookCounts(updatedCookCounts);
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
      setShowEmptyRecipeBookDialog(true);
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
      showCustomAlert('Error', 'Failed to choose a recipe', 'error');
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
    // Prevent multiple rapid calls
    if (isLoading) {
      return;
    }

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

    try {
      const updatedPinnedRecipes = await togglePinnedRecipe(recipeName);
      setPinnedRecipes(updatedPinnedRecipes);
    } catch (error) {
      console.error('Error toggling pinned recipe:', error);
      // Optionally show an error message to the user
      showCustomAlert('Error', 'Failed to update recipe pin status. Please try again.', 'error');
    }
  };

  const handleAddSampleRecipes = async () => {
    try {
      setIsAddingSampleRecipes(true);
      const updatedRecipes = await addSampleRecipes();
      setRecipes(updatedRecipes);
      setShowEmptyRecipeBookDialog(false);
      showCustomAlert('Success', 'Sample recipes have been added to your recipe book!', 'success');
    } catch (error) {
      console.error('Error adding sample recipes:', error);
      showCustomAlert('Error', 'Failed to add sample recipes. Please try again.', 'error');
    } finally {
      setIsAddingSampleRecipes(false);
    }
  };

  const handleOpenRecipeBook = () => {
    if (recipes.length === 0) {
      setShowEmptyRecipeBookDialog(true);
    } else {
      setShowRecipeBook(true);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialCommunityIcons name="chef-hat" size={48} color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your recipes...</Text>
        {syncStatus.inProgress && (
          <Text style={[styles.loadingText, { fontSize: 14, marginTop: 8 }]}>Syncing with Google Drive...</Text>
        )}
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
            <View style={styles.titleContainer}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.colors.tertiary }]}>CookIT</Text>
                <TouchableOpacity
                  onPress={() => setShowSyncInfo(true)}
                  style={styles.syncButton}
                  activeOpacity={0.7}
                >
                  <Animated.View style={{
                    opacity: syncStatus.inProgress ? progressBarPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 1],
                    }) : 1
                  }}>
                    <MaterialCommunityIcons
                      name={syncStatus.isAuthenticated ? (syncStatus.inProgress ? "cloud-sync-outline" : "cloud-check-outline") : "cloud-off-outline"}
                      size={22}
                      color={syncStatus.isAuthenticated ? theme.colors.tertiary : theme.colors.surface}
                      style={{ marginTop: 2 }}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
              <Text style={[styles.subtitle, { color: theme.colors.surface }]}>Your Recipe Manager</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            {showHelpButton && (
              <IconButton
                icon="help-circle"
                size={28}
                iconColor={theme.colors.tertiary}
                onPress={() => setShowHelp(true)}
              />
            )}
            <IconButton
              icon={showPinnedOnly ? "pin" : "pin-off"}
              size={28}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowPinnedOnly(!showPinnedOnly)}
            />
            <IconButton
              icon="book-open"
              size={28}
              iconColor={theme.colors.tertiary}
              onPress={handleOpenRecipeBook}
            />
            {!showHelpButton && (
              <IconButton
                icon="coffee"
                size={28}
                iconColor={theme.colors.tertiary}
                onPress={() => setShowBuyCoffee(true)}
              />
            )}
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
          }],
          zIndex: 10, // Higher z-index to ensure buttons are always above pinned recipes
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
              zIndex: 1, // Lower z-index so buttons appear above
            }
          ]}
        >
            {/* Combined cork surface with borders */}
            <View style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden', // Clip content at corkboard boundaries
            }}>
              {/* Combined cork background with borders */}
              <ImageBackground
                source={require('./assets/wine-cork-wp4.png')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1,
                }}
                resizeMode="cover"
              >
                {/* Top border */}
                <ImageBackground
                  source={require('./assets/cork-wood2.png')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 10,
                    zIndex: 3, // Higher than recipes but lower than pins
                  }}
                  resizeMode="stretch"
                />
                {/* Left border */}
                <ImageBackground
                  source={require('./assets/cork-wood.png')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: 10,
                    zIndex: 3, // Higher than recipes but lower than pins
                  }}
                  resizeMode="stretch"
                />
                {/* Right border */}
                <ImageBackground
                  source={require('./assets/cork-wood.png')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 10,
                    zIndex: 3, // Higher than recipes but lower than pins
                  }}
                  resizeMode="stretch"
                />
                {/* Bottom border - only when scrolled to bottom */}
                {showScrollBorder && (
                  <ImageBackground
                    source={require('./assets/cork-wood2.png')}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 10,
                      zIndex: 3, // Higher than recipes but lower than pins
                    }}
                    resizeMode="stretch"
                  />
                )}
              </ImageBackground>

              {/* ScrollView for pinned recipes on top of combined surface */}
              <FlatList
                data={recipes.filter(recipe => pinnedRecipes.includes(recipe.name))}
                keyExtractor={(item) => item.name}
                onScroll={(event) => {
                  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                  // Show border if content is shorter than container OR if scrolled to bottom
                  const isAtBottom = contentSize.height <= layoutMeasurement.height ||
                                    contentOffset.y + layoutMeasurement.height >= contentSize.height - 10;
                  setShowScrollBorder(isAtBottom);
                }}
                onContentSizeChange={(width, height) => {
                  // Also check on content size change
                  const isAtBottom = height <= 400; // Approximate container height
                  setShowScrollBorder(isAtBottom);
                }}
                scrollEventThrottle={16}
                style={[
                  styles.list,
                  {
                    backgroundColor: 'transparent',
                    marginTop: 10,
                    marginLeft: 10,
                    marginRight: 10,
                    marginBottom: showScrollBorder ? 10 : 0,
                    zIndex: 2, // Above cork background but below borders
                    overflow: 'hidden', // Clip recipes at container boundaries
                  }
                ]}
                renderItem={({ item, index }) => {
                  const recipeAnim = getRecipeAnimation(item.name);
                  return (
                    <Animated.View
                      style={{
                        transform: [
                          {
                            translateY: recipeAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [windowHeight, 0], // Start from bottom of screen, slide to final position
                            })
                          },
                          {
                            scale: pressedRecipe === item.name ? 1.05 : 1, // Scale up while pressed
                          }
                        ],
                        opacity: recipeAnim.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 0, 1], // Fade out when sliding down, but stay opaque when sliding up
                        }),
                        zIndex: 2, // Above cork background but below borders
                      }}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        onPressIn={() => {
                          setPressedRecipe(item.name);
                        }}
                        onPressOut={() => {
                          setPressedRecipe(null);
                        }}
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
                            styles.pinnedRecipeCard,
                            { overflow: 'visible' } // Allow pin to extend beyond card boundaries
                          ]}
                          elevation={4}
                        >
                          <InteractivePin
                            isPinned={pinnedRecipes.includes(item.name)}
                            onToggle={() => handleTogglePinned(item.name)}
                            size={32}
                            triggerBounce={bouncingPins.has(item.name)}
                            key={`pin-${item.name}-${showPinnedOnly}`} // Force re-mount to trigger bounce animation
                            style={{
                              zIndex: 4, // Highest z-index to appear above borders
                            }}
                          />

                          <View style={styles.recipeHeader}>
                            <View style={styles.recipeTitleContainer}>
                              <Text style={[styles.recipeName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                            </View>
                            {item.comment && (
                              <Text style={[styles.recipeComment, { color: theme.colors.onSurface }]} numberOfLines={2}>
                                {item.comment}
                              </Text>
                            )}
                            <View style={styles.recipeDates}>
                              {lastCookedDates[item.name] && (
                                <Text style={[styles.recipeDate, { color: '#A0A0A0' }]}>
                                  Last cooked: {new Date(lastCookedDates[item.name]).toLocaleDateString()}
                                </Text>
                              )}
                              {cookCounts[item.name] > 0 && (
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.recipeDate, { color: '#A0A0A0', textAlign: 'right' }]}>
                                    Times cooked: {cookCounts[item.name]}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </Surface>
                      </TouchableOpacity>
                    </Animated.View>
                  );
                }}
                contentContainerStyle={styles.listContent}
              />
            </View>
          </Animated.View>

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
        pinnedRecipes={pinnedRecipes}
        setPinnedRecipes={setPinnedRecipes}
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

      <Portal>
        <Dialog
          visible={showRecipeBook}
          onDismiss={() => setShowRecipeBook(false)}
          style={[styles.dialog, { backgroundColor: theme.colors.surface, maxHeight: dialogMaxHeight }]}
        >
          <RecipeBookDialog
            onClose={() => setShowRecipeBook(false)}
            recipes={recipes}
            onRecipePress={(recipe) => {
              setSelectedRecipe(recipe);
              setIsSuggestionFlow(false);
              setShowRecipeDetails(true);
              // Don't close the recipe book dialog
            }}
            cookedRecipes={cookedRecipes}
            pinnedRecipes={pinnedRecipes}
            onTogglePin={handleTogglePinned}
            lastCookedDates={lastCookedDates}
            cookCounts={cookCounts}
          />
        </Dialog>
      </Portal>

      {/* Sync Info Dialog */}
      <Portal>
        <Dialog
          visible={showSyncInfo}
          onDismiss={() => setShowSyncInfo(false)}
          style={[styles.dialog, { backgroundColor: theme.colors.surface, maxHeight: dialogMaxHeight }]}
        >
          <View style={styles.header2}>
            <MaterialCommunityIcons
              name="cloud-sync"
              size={28}
              color={theme.colors.primary}
              style={styles.headerIcon}
            />
            <Text style={[styles.title, { color: theme.colors.primary }]}>Google Drive Sync</Text>
          </View>

          <Dialog.Content style={styles.content}>
            <ScrollView>
              {/* Status Section */}
              <View style={[styles.infoBox, {
                backgroundColor: syncStatus.isAuthenticated ? '#E8F5E8' : '#FFEBEE',
                borderColor: syncStatus.isAuthenticated ? '#4CAF50' : '#F44336'
              }]}>
                <MaterialCommunityIcons
                  name={syncStatus.isAuthenticated ? "cloud-check" : "exclamation-thick"}
                  size={32}
                  color={syncStatus.isAuthenticated ? '#4CAF50' : '#F44336'}
                  style={styles.infoIcon}
                />
                <View style={styles.syncStatusText}>
                  <Text style={[styles.syncStatusTitle, {
                    color: syncStatus.isAuthenticated ? '#2E7D32' : '#C62828'
                  }]}>
                    {syncStatus.isAuthenticated ? 'Connected to Google Drive' : 'Not Connected'}
                  </Text>
                  <Text style={[styles.syncStatusSubtitle, {
                    color: syncStatus.isAuthenticated ? '#388E3C' : '#D32F2F'
                  }]}>
                    {syncStatus.isAuthenticated
                      ? 'Your recipes are being synced automatically'
                      : 'Tap "Connect to Google Drive" to get started'
                    }
                  </Text>
                </View>
              </View>

              {/* Last Sync Info */}
              {syncStatus.lastSync && (
                <View style={[styles.infoBox, { backgroundColor: '#F3F4F6' }]}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={32}
                    color={theme.colors.onSurfaceVariant}
                    style={styles.infoIcon}
                  />
                  <Text style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
                    Last synced: {new Date(syncStatus.lastSync).toLocaleString()}
                  </Text>
                </View>
              )}

              {/* Sync Progress */}
              {syncStatus.inProgress && (
                <View style={[styles.infoBox, { backgroundColor: '#E3F2FD' }]}>
                  <View style={styles.syncIconContainer}>
                    <Animated.View style={{
                      transform: [{
                        rotate: syncIconRotation.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['360deg', '0deg']
                        })
                      }]
                    }}>
                      <MaterialCommunityIcons
                        name="sync"
                        size={32}
                        color="#1976D2"
                      />
                    </Animated.View>
                  </View>
                  <View style={styles.syncProgressContent}>
                    <Text style={[styles.syncProgressText, { color: '#1976D2' }]}>
                      Syncing recipes with Google Drive...
                    </Text>
                    <View style={styles.syncProgressBar}>
                      <Animated.View style={[
                        styles.syncProgressFill,
                        {
                          backgroundColor: '#1976D2',
                          width: `${syncProgress}%`,
                          opacity: progressBarPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.6, 1],
                          }),
                        }
                      ]} />
                    </View>
                  </View>
                </View>
              )}

              {/* Info Section */}
              <View style={[styles.infoBox, { backgroundColor: '#FFF8E1' }]}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={32}
                  color="#F57C00"
                  style={styles.infoIcon}
                />
                <Text style={[styles.infoText, { color: '#E65100' }]}>
                  {syncStatus.isAuthenticated
                    ? 'Your recipes are automatically synced with Google Drive when you make changes. This ensures your data is safe and accessible across all your devices.'
                    : 'Connect to Google Drive to automatically sync your recipes across all your devices. Your data will be safely stored and accessible from anywhere.'
                  }
                </Text>
              </View>
            </ScrollView>
          </Dialog.Content>

          <Dialog.Actions>
            <View style={styles.buttonContainer}>
              {syncStatus.isAuthenticated ? (
                <Button
                  onPress={handleManualSync}
                  disabled={syncStatus.inProgress}
                  style={[styles.syncActionButton, {
                    backgroundColor: syncStatus.inProgress ? theme.colors.outline : theme.colors.secondary
                  }]}
                  labelStyle={[styles.syncActionButtonLabel, {
                    color: syncStatus.inProgress ? theme.colors.onSurfaceDisabled : 'white'
                  }]}
                  icon={syncStatus.inProgress ? "sync" : "cloud-sync"}
                >
                  {syncStatus.inProgress ? 'Syncing...' : 'Sync Now'}
                </Button>
              ) : (
                <Button
                  onPress={handleManualSync}
                  disabled={syncStatus.inProgress}
                  style={[styles.syncActionButton, {
                    backgroundColor: syncStatus.inProgress ? theme.colors.outline : theme.colors.secondary,
                    marginRight: 12
                  }]}
                  labelStyle={[styles.syncActionButtonLabel, {
                    color: syncStatus.inProgress ? theme.colors.onSurfaceDisabled : 'white',
                    fontSize: 16
                  }]}
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons
                      name={syncStatus.inProgress ? "account-key" : "google"}
                      size={20}
                      color={color}
                    />
                  )}
                >
                  {syncStatus.inProgress ? 'Connecting...' : ' Connect to Google Drive'}
                </Button>
              )}
              <Button
                onPress={() => setShowSyncInfo(false)}
                style={[styles.syncActionButton, { backgroundColor: theme.colors.primary }]}
                labelStyle={[styles.syncActionButtonLabel, { color: '#f7f0e2' }]}
              >
                Close
              </Button>
            </View>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Empty Recipe Book Dialog */}
      <Portal>
        <Dialog
          visible={showEmptyRecipeBookDialog}
          onDismiss={() => setShowEmptyRecipeBookDialog(false)}
          style={[styles.dialog, { backgroundColor: theme.colors.surface, maxHeight: dialogMaxHeight }]}
        >
          <EmptyRecipeBookDialog
            onDismiss={() => setShowEmptyRecipeBookDialog(false)}
            onAddSampleRecipes={handleAddSampleRecipes}
            isLoading={isAddingSampleRecipes}
            isFirstTime={tutorialCount < 5}
          />
        </Dialog>
      </Portal>

      {/* Custom Styled Alert Dialog */}
      <Portal>
        <Dialog
          visible={customAlert.visible}
          onDismiss={() => setCustomAlert({ ...customAlert, visible: false })}
          style={[styles.dialog, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.header}>
            <MaterialCommunityIcons
              name={
                customAlert.type === 'success' ? 'check-circle' :
                customAlert.type === 'error' ? 'alert-circle' :
                customAlert.type === 'warning' ? 'alert' : 'information'
              }
              size={28}
              color={
                customAlert.type === 'success' ? '#4CAF50' :
                customAlert.type === 'error' ? '#F44336' :
                customAlert.type === 'warning' ? '#FF9800' : theme.colors.primary
              }
              style={styles.headerIcon}
            />
            <Text style={[styles.title, { color: theme.colors.primary }]}>{customAlert.title}</Text>
          </View>
          <Dialog.Content style={styles.content}>
            <Text style={[styles.alertMessage, { color: theme.colors.onSurface }]}>
              {customAlert.message}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <View style={styles.buttonContainer}>
              <Button
                onPress={() => setCustomAlert({ ...customAlert, visible: false })}
                style={[styles.alertButton, { backgroundColor: theme.colors.primary }]}
                labelStyle={[styles.alertButtonLabel, { color: '#f7f0e2' }]}
              >
                OK
              </Button>
            </View>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AppContent />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden', // Clip content at app boundaries
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 16,
  },
  header2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: -4,
  },
  subtitle: {
    fontSize: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
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
  recipeDates: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
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
    maxHeight: '85%',
    alignSelf: 'center',
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  titleIcon: {
    // marginRight is no longer needed, gap is used instead
  },
  content: {
    flexShrink: 1,
    flexGrow: 1,
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
    overflow: 'hidden', // Clip content at container boundaries
  },
  titleContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  // Removed old sync dialog styles
  headerIcon: {
    marginRight: 12,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  infoIcon: {
    marginRight: 12,
  },
  syncStatusText: {
    marginLeft: 12,
    flex: 1,
  },
  syncStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  syncStatusSubtitle: {
    fontSize: 14,
  },
  infoText: {
    marginLeft: 12,
    fontSize: 14,
    flex: 1,
  },
  syncStatusText: {
    marginLeft: 12,
    flex: 1,
  },
  syncStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  syncStatusSubtitle: {
    fontSize: 14,
  },
  syncProgressContent: {
    flex: 1,
    marginLeft: 12,
  },
  syncProgressText: {
    fontSize: 14,
    marginBottom: 8,
  },
  syncProgressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  syncProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  syncActionButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 100,
    width: '100%',
  },
  syncActionButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  syncIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  alertButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 100,
    width: '100%',
  },
  alertButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  recipeDates: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
});
