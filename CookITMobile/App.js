import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, FlatList, Modal, TouchableOpacity, SafeAreaView, Alert, Linking, StatusBar, AppState, BackHandler, Dimensions, KeyboardAvoidingView, Platform, ImageBackground, ScrollView, LayoutAnimation, Animated, LogBox } from 'react-native';
import { Text, Surface, useTheme, IconButton, FAB, Portal, Dialog, Button as PaperButton, Provider as PaperProvider, MD3LightTheme, TextInput, Checkbox } from 'react-native-paper';
import { Card, CardHeader, CardContent, CardFooter } from './src/components/Card';
import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { RecipeDetailsDialog } from './src/components/RecipeDetailsDialog';
import HelpDialog from './src/components/HelpDialog';
// Web gets its own screen rather than the phone layout - see WebHome's header
// comment. Both screens read and write through src/utils/storage.js, so they
// share the same data and the same Drive backup.
import CookCalendar from './src/screens/CookCalendar';
import ShoppingListDialog from './src/components/ShoppingListDialog';
import RecipeViewDialog from './src/components/RecipeViewDialog';
import DialogShell from './src/components/DialogShell';
import VoteSession from './src/screens/VoteSession';
import { addRecipeToList } from './src/services/shoppingList';
import WebShell from './src/components/WebShell';
import WebHome from './src/screens/WebHome';
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  // Both are plain React Native and store locally, so they work on the phone
  // exactly as they do on the web screen - no platform branching needed.
  const [showCalendar, setShowCalendar] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showVote, setShowVote] = useState(false);
  const [recipeView, setRecipeView] = useState(null);
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
  const [syncMessage, setSyncMessage] = useState(''); // Track sync status message

  // Empty recipe book dialog states
  const [showEmptyRecipeBookDialog, setShowEmptyRecipeBookDialog] = useState(false);
  const [isAddingSampleRecipes, setIsAddingSampleRecipes] = useState(false);
  const [tutorialCount, setTutorialCountState] = useState(0);
  const [hasShownSyncDialog, setHasShownSyncDialog] = useState(false);
  const [searchAllDrivesPref, setSearchAllDrivesPref] = useState(true);

  // Dialog sequence states for first-time users
  const [dialogSequence, setDialogSequence] = useState({
    helpShown: false,
    emptyRecipeBookShown: false,
    syncShown: false
  });

  // Custom alert states
  const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

  // Flag to track manual authentication in progress
  const [isManualAuthInProgress, setIsManualAuthInProgress] = useState(false);

  // Animation values
  const corkSlideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const buttonPositionAnim = useRef(new Animated.Value(0)).current; // 0 = center, 1 = top
  const recipeAnimations = useRef(new Map()).current; // Map to store individual recipe animations
  const syncIconRotation = useRef(new Animated.Value(0)).current; // For sync icon rotation
  const progressBarPulse = useRef(new Animated.Value(0)).current; // For progress bar pulse
  const progressBarFill = useRef(new Animated.Value(0)).current; // For actual progress bar fill
  const syncButtonPop = useRef(new Animated.Value(0)).current; // For primary sync button pop animation (disabled for connect)
  const searchPrefPop = useRef(new Animated.Value(0)).current; // For checkbox pop animation
  const pendingAuthTimeoutsRef = useRef([]); // Staged auth-progress setTimeout handles from handleManualSync, cleared on completion/unmount

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

  // Animate progress bar fill
  useEffect(() => {
    Animated.timing(progressBarFill, {
      toValue: syncProgress,
      duration: 300, // Smooth transition
      useNativeDriver: false, // width is not supported by native driver
    }).start();
  }, [syncProgress]);

  // Ensure any old connect button pop is disabled
  useEffect(() => {
    syncButtonPop.setValue(0);
  }, [showSyncInfo, syncStatus.isAuthenticated]);

  // Cancel any staged auth-progress timeouts from handleManualSync on unmount, so they
  // never call setState (via onProgress) after the component is gone.
  useEffect(() => {
    return () => {
      pendingAuthTimeoutsRef.current.forEach(clearTimeout);
      pendingAuthTimeoutsRef.current = [];
    };
  }, []);

  // Pop the checkbox row when the sync dialog opens (before authentication)
  useEffect(() => {
    if (showSyncInfo && !syncStatus.isAuthenticated) {
      Animated.sequence([
        Animated.timing(searchPrefPop, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(searchPrefPop, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      searchPrefPop.setValue(0);
    }
  }, [showSyncInfo, syncStatus.isAuthenticated]);

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
    // Load Drive search preference for first auth
    (async () => {
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        const pref = await AsyncStorage.getItem('@cookit_drive_search_all_pref');
        if (pref === null) {
          await AsyncStorage.setItem('@cookit_drive_search_all_pref', 'true');
          setSearchAllDrivesPref(true);
        } else {
          setSearchAllDrivesPref(pref === 'true');
        }
      } catch {}
    })();

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
    setIsAnyDialogOpen(showAddModal || showRecipeDetails || showHelp || showBuyCoffee || showEmptyRecipeBookDialog || customAlert.visible || showSyncInfo);
  }, [showAddModal, showRecipeDetails, showHelp, showBuyCoffee, showEmptyRecipeBookDialog, customAlert.visible, showSyncInfo]);

  // Refresh sync status when the Sync dialog opens, and poll while visible
  useEffect(() => {
    let intervalId = null;
    const refresh = async () => {
      try {
        const status = await syncService.checkSyncStatus();
        setSyncStatus(prev => ({ ...prev, lastSync: status.lastSync }));
      } catch {}
    };

    if (showSyncInfo) {
      refresh();
      intervalId = setInterval(refresh, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showSyncInfo]);

  // Show sync info dialog when not authenticated and no other dialogs are open
  // But respect the dialog sequence for first-time users
  useEffect(() => {
    // Reset the flag when user becomes authenticated
    if (syncStatus.isAuthenticated) {
      setHasShownSyncDialog(false);
      setDialogSequence(prev => ({ ...prev, syncShown: true }));
    }

    // For first-time users (tutorialCount <= 5), only show sync dialog as part of sequence
    const isFirstTime = tutorialCount <= 5;
    const shouldShowSyncDialog = !syncStatus.isAuthenticated &&
                                !syncStatus.inProgress &&
                                !isLoading &&
                                !showAddModal &&
                                !showRecipeDetails &&
                                !showHelp &&
                                !showBuyCoffee &&
                                !showEmptyRecipeBookDialog &&
                                !customAlert.visible &&
                                !showSyncInfo &&
                                !hasShownSyncDialog &&
                                (!isFirstTime || (isFirstTime && dialogSequence.helpShown && dialogSequence.emptyRecipeBookShown));

    if (shouldShowSyncDialog) {
      setShowSyncInfo(true);
      setHasShownSyncDialog(true);
    }
  }, [
    syncStatus.isAuthenticated,
    syncStatus.inProgress,
    isLoading,
    showAddModal,
    showRecipeDetails,
    showHelp,
    showBuyCoffee,
    showEmptyRecipeBookDialog,
    customAlert.visible,
    showSyncInfo,
    hasShownSyncDialog,
    tutorialCount,
    dialogSequence.helpShown,
    dialogSequence.emptyRecipeBookShown
  ]);

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
      if (showSyncInfo) {
        setShowSyncInfo(false);
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
  }, [showBuyCoffee, showHelp, showRecipeDetails, showAddModal, showEmptyRecipeBookDialog, showSyncInfo]); // Dependencies array

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

      // Handle dialog sequence for first-time users (tutorial count < 5)
      const isFirstTime = tutorialCount < 5;
      if (isFirstTime && !dialogSequence.helpShown) {
        // Start with help dialog for first-time users (only if not already shown)
        setShowHelp(true);
        await incrementTutorialCount();
      } else if (loadedRecipes.length === 0 && !dialogSequence.emptyRecipeBookShown) {
        // For returning users with empty recipe book, show empty dialog directly (only if not already shown)
        setShowEmptyRecipeBookDialog(true);
      }

      // Check sync status without initializing authentication
      const status = await syncService.checkSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error loading initial data:', error);
      setIsLoading(false);
    }
  };



  const handleSyncCheck = async () => {
    try {
      const status = await syncService.checkSyncStatus();

      // Don't override sync status if we're currently in a manual sync process
      setSyncStatus(prev => {
        // If we're manually managing sync progress or authentication, don't override it
        if ((prev.inProgress && !status.inProgress) || isManualAuthInProgress) {
          console.log('Preserving manual sync/auth progress state');
          return prev; // Keep the current state
        }
        return status; // Use the new status
      });

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
      setSyncProgress(0);
      setSyncMessage('Starting sync...');

      const onProgress = (progress, message) => {
        setSyncProgress(progress * 100);
        setSyncMessage(message);
      };

      // Check if we're authenticated first
      const status = await syncService.checkSyncStatus();

      // Update UI to show we're syncing (this fixes the progress bar not showing)
      setSyncStatus(prev => ({ ...prev, inProgress: true }));

      if (!status.isAuthenticated) {
        // Not authenticated - start authentication process
        console.log('Starting Google Drive authentication...');
        setIsManualAuthInProgress(true); // Set flag to prevent status override
        onProgress(0.1, 'Connecting to Google Drive...');

        // Keep the UI in sync mode during authentication
        // Don't rely on checkSyncStatus during auth as it will show "not connected" until auth completes

        // Stage progress messages during authentication. Handles are collected so they
        // can be cancelled below (and on unmount) instead of firing onProgress/setState
        // up to 8s later against a dialog/component that may already be gone.
        pendingAuthTimeoutsRef.current.push(
          setTimeout(() => onProgress(0.2, 'Opening Google authentication...'), 1000),
          setTimeout(() => onProgress(0.3, 'Waiting for user authentication...'), 3000),
          setTimeout(() => onProgress(0.5, 'Processing authentication...'), 6000),
          setTimeout(() => onProgress(0.7, 'Setting up Google Drive access...'), 8000)
        );

        let initResult;
        try {
          initResult = await syncService.initializeSync();
        } finally {
          // Cancel any staged messages that haven't fired yet, whether initializeSync
          // succeeded or threw.
          pendingAuthTimeoutsRef.current.forEach(clearTimeout);
          pendingAuthTimeoutsRef.current = [];
        }

        // Reset flag
        setIsManualAuthInProgress(false);

        if (initResult.success) {
          // Authentication and sync completed - initializeSync does both
          onProgress(0.9, 'Authentication complete, finalizing...');

          // Update sync status immediately to reflect authentication
          const updatedStatus = await syncService.checkSyncStatus();
          setSyncStatus(updatedStatus);

          onProgress(1, 'Sync complete');
          showCustomAlert('Authentication & Sync Complete', 'Successfully connected to Google Drive and synced your recipes!', 'success');

          if (initResult.hasChanges) {
            await loadInitialData();
          }
        } else {
          // Authentication failed - reset flag
          setIsManualAuthInProgress(false);
          const errorMessage = initResult.message || 'Authentication failed - please try again';
          if (errorMessage.includes('not properly configured')) {
            showCustomAlert(
              'Setup Required',
              'Google Drive sync needs to be configured. Please check the GOOGLE_OAUTH_SETUP.md file for setup instructions. You can still use the app without sync for now.',
              'warning'
            );
          } else if (errorMessage.includes('Drive access was declined')) {
            // Signing in again won't re-open the consent screen (the Google session
            // already exists), so route the user through the explicit permission
            // request instead of leaving them stuck.
            showCustomAlert('Google Drive Permission Needed', errorMessage, 'warning');
          } else {
            showCustomAlert('Authentication Failed', errorMessage, 'error');
          }
        }
      } else {
        // Already authenticated - just sync
        console.log('Already authenticated, performing sync...');
        const syncResult = await syncService.performSync(false, onProgress);

        if (syncResult.success) {
          onProgress(1, 'Sync complete');
          showCustomAlert('Sync Complete', syncResult.message || 'Sync completed successfully', 'success');
          if (syncResult.hasChanges) {
            await loadInitialData();
          }
        } else {
          const errorMessage = syncResult.message || 'Sync failed - please try again';
          if (errorMessage.includes('not properly configured')) {
            showCustomAlert(
              'Setup Required',
              'Google Drive sync needs to be configured. Please check the GOOGLE_OAUTH_SETUP.md file for setup instructions. You can still use the app without sync for now.',
              'warning'
            );
          } else {
            showCustomAlert('Sync Failed', errorMessage, 'error');
          }
        }
      }

      // Update sync status
      const updatedStatus = await syncService.checkSyncStatus();
      setSyncStatus(updatedStatus);
    } catch (error) {
      console.error('Manual sync error:', error);
      const errorMessage = error.message || 'An unexpected error occurred during sync';
      showCustomAlert('Sync Error', errorMessage, 'error');
      setSyncStatus(prev => ({ ...prev, inProgress: false }));
    }
  };

  // Disconnect the app from Google Drive. Local recipes are untouched - the only
  // thing that goes away is syncing - so the confirmation says exactly that rather
  // than leaving the user to guess whether logging out deletes their recipe book.
  const handleSignOut = () => {
    Alert.alert(
      'Log out of Google Drive?',
      'Your recipes stay on this device. They will stop syncing with Google Drive (and with the desktop app) until you connect again.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await syncService.signOut();

              // Re-read the status rather than assuming, then drop any leftover
              // progress state so the dialog falls back to the "Not Connected"
              // view with a working Connect button.
              const updatedStatus = await syncService.checkSyncStatus();
              setSyncStatus({ ...updatedStatus, inProgress: false });
              setSyncProgress(0);
              setSyncMessage('');
              setIsManualAuthInProgress(false);

              // The user just chose to disconnect; the auto-prompt that nags
              // unauthenticated users to connect would otherwise reappear the moment
              // this dialog is closed.
              setHasShownSyncDialog(true);

              if (result?.success) {
                showCustomAlert(
                  'Logged Out',
                  'Cook-IT is no longer connected to Google Drive. Your recipes are still saved on this device.',
                  'success'
                );
              } else {
                showCustomAlert(
                  'Log Out Failed',
                  result?.message || 'Could not log out of Google Drive. Please try again.',
                  'error'
                );
              }
            } catch (error) {
              console.error('Sign out error:', error);
              showCustomAlert(
                'Log Out Failed',
                error.message || 'Could not log out of Google Drive. Please try again.',
                'error'
              );
            }
          },
        },
      ]
    );
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
      // History-weighted pick. Previously this drew uniformly at random, so a
      // recipe cooked yesterday was exactly as likely as one untouched for a
      // year. Weight is now how long it has been since the recipe was last
      // cooked, so neglected recipes resurface more often - the same idea the
      // original desktop app used (recency scores decayed per cook in
      // Cook_IT.py), which was lost in the move to React Native.
      //
      // Kept in step with the web screen's suggest() in src/screens/WebHome.js:
      // both must weight the same way or the two clients would recommend
      // differently from identical data.
      const NEVER_COOKED_WEIGHT = 120;
      const MAX_DAYS = 90;

      const weightFor = (candidate) => {
        const last = lastCookedDates[candidate.name];
        if (!last) return NEVER_COOKED_WEIGHT;
        const days = (Date.now() - new Date(last).getTime()) / 86400000;
        if (!Number.isFinite(days)) return NEVER_COOKED_WEIGHT;
        // +1 floor keeps something cooked today unlikely rather than impossible.
        return Math.min(Math.max(days, 0), MAX_DAYS) + 1;
      };

      // Exclude anything already suggested this session; reset the pool once
      // everything has been seen, rather than looping.
      let pool = recipes.filter(r => !suggestedRecipes.has(r.name));
      const resetting = pool.length === 0;
      if (resetting) pool = recipes;

      const weights = pool.map(weightFor);
      const total = weights.reduce((sum, w) => sum + w, 0);
      let ticket = Math.random() * total;
      let recipe = pool[pool.length - 1]; // Guards against floating-point drift.
      for (let i = 0; i < pool.length; i++) {
        ticket -= weights[i];
        if (ticket <= 0) { recipe = pool[i]; break; }
      }

      setSuggestedRecipes(resetting ? new Set([recipe.name]) : new Set([...suggestedRecipes, recipe.name]));
      setSelectedRecipe(recipe);
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

  // Handle dialog sequence for first-time users
  const handleHelpDialogClose = () => {
    setShowHelp(false);
    setDialogSequence(prev => ({ ...prev, helpShown: true }));

    // Check if we need to show empty recipe book dialog next
    if (recipes.length === 0) {
      setTimeout(() => {
        setShowEmptyRecipeBookDialog(true);
      }, 300); // Small delay for smooth transition
    } else {
      // If there are recipes, check if we should show sync dialog
      setTimeout(() => {
        handleNextInSequence('emptyRecipeBookShown');
      }, 300);
    }
  };

  const handleEmptyRecipeBookDialogClose = () => {
    setShowEmptyRecipeBookDialog(false);
    setDialogSequence(prev => ({ ...prev, emptyRecipeBookShown: true }));

    // Show sync dialog next if it's a first-time user and sync hasn't been shown
    setTimeout(() => {
      handleNextInSequence('syncShown');
    }, 300);
  };

  const handleNextInSequence = (completedStep) => {
    if (tutorialCount <= 5 && !dialogSequence.syncShown && !syncStatus.isAuthenticated) {
      setShowSyncInfo(true);
      setDialogSequence(prev => ({ ...prev, syncShown: true }));
    }
  };

  const handleAddSampleRecipes = async () => {
    try {
      setIsAddingSampleRecipes(true);
      const updatedRecipes = await addSampleRecipes();
      setRecipes(updatedRecipes);
      setShowEmptyRecipeBookDialog(false);
      setDialogSequence(prev => ({ ...prev, emptyRecipeBookShown: true }));
      showCustomAlert('Success', 'Sample recipes have been added to your recipe book!', 'success');

      // Continue with sequence after adding sample recipes
      setTimeout(() => {
        handleNextInSequence('emptyRecipeBookShown');
      }, 1000); // Delay to let success message show
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
            {/* The header shows either the help button or the coffee button, never both
                (see headerButtons below). The chef hat is the way to reach whichever one
                is currently hidden, so it always opens the other dialog. */}
            <TouchableOpacity
              onPress={() => (showHelpButton ? setShowBuyCoffee(true) : setShowHelp(true))}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="chef-hat" size={32} color={theme.colors.tertiary} />
            </TouchableOpacity>
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
              icon="vote-outline"
              size={28}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowVote(true)}
            />
            <IconButton
              icon="calendar-month-outline"
              size={28}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowCalendar(true)}
            />
            <IconButton
              icon="cart-outline"
              size={28}
              iconColor={theme.colors.tertiary}
              onPress={() => setShowShoppingList(true)}
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

      <CookCalendar visible={showCalendar} onClose={() => setShowCalendar(false)} />

      <VoteSession
        visible={showVote}
        onClose={() => setShowVote(false)}
        recipes={recipes}
        lastCooked={lastCookedDates}
        onCookIt={(recipe) => { setSelectedRecipe(recipe); setShowRecipeDetails(true); }}
      />

      <RecipeViewDialog
        visible={!!recipeView}
        recipe={recipeView}
        onClose={() => setRecipeView(null)}
        onAddToList={async (ingredients) => {
          await addRecipeToList(recipeView.name, ingredients);
          setRecipeView(null);
          setShowShoppingList(true);
        }}
        onCook={(recipe) => { setRecipeView(null); setSelectedRecipe(recipe); setShowRecipeDetails(true); }}
      />
      <ShoppingListDialog visible={showShoppingList} onClose={() => setShowShoppingList(false)} />

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

      {/* Same DialogShell the web screen uses, so help and support look identical
          on both platforms instead of each getting its own chrome. */}
      <DialogShell
        visible={showHelp}
        onClose={handleHelpDialogClose}
        title={tutorialCount <= 5 ? 'Welcome to Cook-IT' : 'How Cook-IT works'}
        icon="help-circle-outline"
        width={620}
        footer={
          <PaperButton mode="contained" onPress={handleHelpDialogClose} buttonColor={theme.colors.secondary}>
            Got it
          </PaperButton>
        }
      >
        <HelpDialog isFirstTime={tutorialCount <= 5} />
      </DialogShell>

      <DialogShell
        visible={showBuyCoffee}
        onClose={() => setShowBuyCoffee(false)}
        title="Support Cook-IT"
        icon="coffee-outline"
        width={520}
        footer={
          <>
            <PaperButton mode="outlined" onPress={() => setShowBuyCoffee(false)}>
              Maybe later
            </PaperButton>
            <PaperButton
              mode="contained"
              icon="coffee"
              buttonColor={theme.colors.secondary}
              onPress={() => {
                Linking.openURL('https://www.buymeacoffee.com/worrador');
                setShowBuyCoffee(false);
              }}
            >
              Buy me a coffee
            </PaperButton>
          </>
        }
      >
        <BuyCoffeeDialog />
      </DialogShell>

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
              {/* 1. CURRENT STATUS - Most Important (What's happening right now?) */}
              <View style={[styles.infoBox, {
                backgroundColor: syncStatus.isAuthenticated ? '#E8F5E8' : '#FFEBEE',
                borderColor: syncStatus.isAuthenticated ? '#4CAF50' : '#F44336',
                borderWidth: 2, // Emphasize importance
                marginBottom: 20 // More space to show hierarchy
              }]}>
                <MaterialCommunityIcons
                  name={syncStatus.isAuthenticated ? "cloud-check" : "cloud-off-outline"}
                  size={36} // Larger icon for emphasis
                  color={syncStatus.isAuthenticated ? '#4CAF50' : '#F44336'}
                  style={styles.infoIcon}
                />
                <View style={styles.syncStatusText}>
                  <Text style={[styles.syncStatusTitle, {
                    color: syncStatus.isAuthenticated ? '#2E7D32' : '#C62828',
                    fontSize: 20 // Larger text for main status
                  }]}>
                    {syncStatus.isAuthenticated ? 'Connected to Google Drive' : 'Not Connected'}
                  </Text>
                  <Text style={[styles.syncStatusSubtitle, {
                    color: syncStatus.isAuthenticated ? '#388E3C' : '#D32F2F'
                  }]}>
                    {syncStatus.isAuthenticated
                      ? 'Recipes sync automatically across devices'
                      : 'Connect to sync your recipes everywhere'
                    }
                  </Text>
                </View>
              </View>

              {/* 2. ACTIVE SYNC PROGRESS - Show when syncing */}
              {syncStatus.inProgress && (
                <View style={[styles.infoBox, { backgroundColor: '#E3F2FD', marginBottom: 16 }]}>
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
                    <Text style={[styles.syncProgressText, { color: '#1976D2', fontWeight: '600' }]}>
                      {syncMessage || 'Syncing recipes with Google Drive...'}
                    </Text>
                    <View style={styles.syncProgressBar}>
                      <Animated.View style={[
                        styles.syncProgressFill,
                        {
                          backgroundColor: '#1976D2',
                          width: progressBarFill.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%']
                          }),
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

              {/* 4. HELP INFO - Only show when not connected (contextual help) */}
              {!syncStatus.isAuthenticated && (
                <View style={[styles.infoBox, { backgroundColor: '#FBE7A0', marginTop: 8 }]}>
                  <MaterialCommunityIcons
                    name="information-outline"
                    size={24}
                    color="#F57C00"
                    style={styles.infoIcon}
                  />
                  <Text style={[styles.infoText, { color: '#E65100', fontSize: 13 }]}>
                    Sync keeps your recipes safe and accessible from any device. Your data stays private in your Google Drive.
                  </Text>
                </View>
              )}

              {/* Preference: search existing/shared files, only before first authentication */}
              {!syncStatus.isAuthenticated && (
                (() => {
                  const scale = searchPrefPop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
                  return (
                    <View style={[styles.infoBox, { backgroundColor: '#FFF3E0', borderColor: '#F2BC42', borderWidth: 1, marginTop: 8, overflow: 'visible' }]}>
                      <Animated.View style={{ transform: [{ scale }], flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Checkbox
                          status={searchAllDrivesPref ? 'checked' : 'unchecked'}
                          onPress={async () => {
                            try {
                              const next = !searchAllDrivesPref;
                              setSearchAllDrivesPref(next);
                              const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
                              await AsyncStorage.setItem('@cookit_drive_search_all_pref', next ? 'true' : 'false');
                            } catch {}
                          }}
                          color={theme.colors.primary}
                        />
                        <Text style={[styles.infoText, { color: theme.colors.primary, fontSize: 13 }]}>
                          Search for existing "CookIT_Recipes.xlsx" file on my Drive or shared files
                        </Text>
                      </Animated.View>
                    </View>
                  );
                })()
              )}
            </ScrollView>
          </Dialog.Content>

          {/* 3. LAST SYNC TIME - Secondary info (When did this last work?) */}
          {syncStatus.lastSync && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              marginBottom: 0,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={16}
                color={theme.colors.onSurfaceVariant}
                style={{ marginRight: 6 }}
              />
              <Text style={{
                color: theme.colors.onSurfaceVariant,
                fontSize: 11,
                textAlign: 'center'
              }}>
                Last synced: {(() => {
                  const date = new Date(syncStatus.lastSync);
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const hours = String(date.getHours()).padStart(2, '0');
                  const minutes = String(date.getMinutes()).padStart(2, '0');
                  return `${year}/${month}/${day} ${hours}:${minutes}`;
                })()}
              </Text>
            </View>
          )}
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
              {/* Log out - only for a user who actually has a Google session. That
                  includes the "signed in but Drive was declined" state, where logging
                  out and back in is the way to redo the consent screen. Deliberately a
                  small text link under Close rather than a full button: it is a rare
                  action that should not compete with Sync and Close for attention. */}
              {(syncStatus.isAuthenticated || syncStatus.needsDrivePermission) && (
                <TouchableOpacity
                  onPress={handleSignOut}
                  disabled={syncStatus.inProgress}
                  style={styles.logoutLink}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.logoutLinkText, {
                    color: syncStatus.inProgress ? theme.colors.onSurfaceDisabled : '#C62828'
                  }]}>
                    Log out of Google Drive
                  </Text>
                </TouchableOpacity>
              )}
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
            onDismiss={handleEmptyRecipeBookDialogClose}
            onAddSampleRecipes={handleAddSampleRecipes}
            isLoading={isAddingSampleRecipes}
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
          <View style={[styles.header, { paddingHorizontal: 16 }]}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'center',
              maxWidth: '100%',
            }}>
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
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text
                style={[styles.title, {
                  color: theme.colors.primary,
                  textAlign: 'center',
                  flexShrink: 1,
                  maxWidth: '85%'
                }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {customAlert.title}
              </Text>
            </View>
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
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          {Platform.OS === 'web'
            ? <WebShell><WebHome /></WebShell>
            : <AppContent />}
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
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
    paddingBottom: 20,
    paddingTop: 4,
    gap: 8,
  },
  dialog: {
    width: '90%',
    maxWidth: 420, // Slightly wider to accommodate longer text
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
    overflow: 'hidden', // Prevent content overflow
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
    marginRight: 0,
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
  logoutLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    marginTop: 2,
  },
  logoutLinkText: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
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
    lineHeight: 22,
    paddingHorizontal: 16, // Proper horizontal padding for centered text
    paddingVertical: 8, // Add vertical padding for better spacing
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
});
