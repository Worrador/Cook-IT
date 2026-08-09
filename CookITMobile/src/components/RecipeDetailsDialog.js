import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Keyboard, Linking, Alert, Modal, Image } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, ActivityIndicator, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import recipeImageService from '../services/recipeImageService';

const MAX_ZOOM_SCALE = 4;
const DOUBLE_TAP_ZOOM_SCALE = 2.5;

// A single pinch-to-zoom / pan-to-inspect page inside the full-screen photo
// viewer. Kept self-contained so each page in the swipe pager has its own
// independent zoom/pan state - zooming one photo must not affect the others.
const ZoomableImage = ({ uri, onZoomChange }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const notifyZoomChange = (zoomed) => {
    setIsZoomed(zoomed);
    if (onZoomChange) onZoomChange(zoomed);
  };

  useAnimatedReaction(
    () => scale.value > 1.05,
    (zoomed, previouslyZoomed) => {
      if (zoomed !== previouslyZoomed) {
        runOnJS(notifyZoomChange)(zoomed);
      }
    }
  );

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(savedScale.value * event.scale, MAX_ZOOM_SCALE));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        resetZoom();
      }
    });

  // Only pans the zoomed image; while unzoomed this gesture is disabled so
  // the surrounding pager's horizontal swipe (next/previous photo) keeps
  // working normally.
  const panGesture = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
      } else {
        scale.value = withTiming(DOUBLE_TAP_ZOOM_SCALE);
        savedScale.value = DOUBLE_TAP_ZOOM_SCALE;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.zoomableImageWrapper, animatedStyle]}>
        <Image source={{ uri }} style={styles.fullScreenImage} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
};

// Full-screen photo viewer: swipe between photos, pinch-to-zoom/pan on each,
// with controls to add another photo or delete the one currently showing.
const FullScreenImageViewer = ({
  visible,
  images,
  resolvedPaths,
  initialIndex,
  onClose,
  onDeleteCurrent,
}) => {
  const { width, height } = Dimensions.get('window');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Jump to the tapped thumbnail without an animated scroll (the fade-in
      // of the modal itself provides the transition).
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false });
      });
    }
  }, [visible, initialIndex, width]);

  if (!images.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)));
          }}
        >
          {images.map((image) => (
            <View key={image.id} style={{ width, height }}>
              {resolvedPaths[image.id] ? (
                <ZoomableImage uri={resolvedPaths[image.id]} onZoomChange={setScrollEnabled ? (zoomed) => setScrollEnabled(!zoomed) : undefined} />
              ) : (
                <View style={styles.viewerLoading}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.viewerCloseButton} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.viewerBottomBar}>
          <Text style={styles.viewerCounter}>{currentIndex + 1} / {images.length}</Text>
          <TouchableOpacity
            onPress={() => onDeleteCurrent(images[currentIndex])}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="delete" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export const RecipeDetailsDialog = ({ visible, recipe, isSuggestionFlow, onClose, onDelete, onCook, onUncook, onUpdate, onNext, onTogglePin, isPinned, pinnedRecipes, setPinnedRecipes }) => {
  const theme = useTheme();
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [nameText, setNameText] = useState('');
  const [hasClickedCook, setHasClickedCook] = useState(false);
  const [noMoreRecipes, setNoMoreRecipes] = useState(false);
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [shouldShowExpandButton, setShouldShowExpandButton] = useState(false);
  const [isNameMeasuring, setIsNameMeasuring] = useState(true);
  const [isCommentMeasuring, setIsCommentMeasuring] = useState(true);
  const commentInputRef = useRef(null);
  const commentTextRef = useRef(null);
  const nameInputRef = useRef(null);
  const nameTextRef = useRef(null);
  const [isNameExpanded, setIsNameExpanded] = useState(false);
  const [shouldShowNameExpandButton, setShouldShowNameExpandButton] = useState(false);
  const [isUrlExpanded, setIsUrlExpanded] = useState(false);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlText, setUrlText] = useState('');
  const urlInputRef = useRef(null);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);

  // --- Photos state ------------------------------------------------------
  const [images, setImages] = useState([]);
  const [resolvedPaths, setResolvedPaths] = useState({});
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openUrlSafely = async (rawUrl) => {
    try {
      if (!rawUrl) return;
      const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'No browser available',
          `Cannot open this link on your device/emulator. Install a web browser or copy the link:\n\n${url}`,
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.warn('Safe URL open failed:', e?.message);
      Alert.alert('Could not open link', 'There was a problem opening this link.');
    }
  };

  // Keyboard listeners for dialog positioning
  useEffect(() => {
    const keyboardDidShow = (event) => {
      // Only apply offset if any input is focused
      if (isCommentFocused || isNameFocused || isUrlFocused) {
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
  }, [isCommentFocused, isNameFocused, isUrlFocused]);

  const handleCommentSave = async () => {
    if (!recipe) {
      console.warn('Cannot save comment: recipe is null');
      return;
    }

    try {
      await onUpdate(recipe.name, { ...recipe, comment: commentText });
      setIsEditingComment(false);
      setIsCommentMeasuring(true);
      setIsCommentExpanded(false);
      setShouldShowExpandButton(false);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const handleNameSave = async () => {
    if (!recipe) {
      console.warn('Cannot save name: recipe is null');
      return;
    }

    try {
      // Update the recipe with the new name
      await onUpdate(recipe.name, { ...recipe, name: nameText });

      // If this recipe was pinned, we need to update the pinned recipes array
      // to reflect the new name
      if (isPinned && pinnedRecipes && setPinnedRecipes) {
        // Remove the old name and add the new name to pinned recipes
        const updatedPinnedRecipes = pinnedRecipes
          .filter(name => name !== recipe.name) // Remove old name
          .concat(nameText); // Add new name
        setPinnedRecipes(updatedPinnedRecipes);
      }

      setIsEditingName(false);
      setIsNameMeasuring(true);
      setIsNameExpanded(false);
      setShouldShowNameExpandButton(false);
    } catch (error) {
      console.error('Error saving name:', error);
    }
  };

  const handleUrlSave = async () => {
    if (!recipe) {
      console.warn('Cannot save URL: recipe is null');
      return;
    }

    try {
      await onUpdate(recipe.name, { ...recipe, url: urlText });
      setIsEditingUrl(false);
    } catch (error) {
      console.error('Error saving URL:', error);
    }
  };

  const toggleCommentExpansion = () => {
    setIsCommentExpanded(!isCommentExpanded);
  };

  const toggleNameExpansion = () => {
    setIsNameExpanded(!isNameExpanded);
  };

  const handleExpandableTextLayout = (event, { setExpanded, setShowChevron, setMeasuring, isMeasuring }) => {
    if (!isMeasuring) return;

    const lineCount = event.nativeEvent.lines.length;
    if (lineCount <= 2) {
      setExpanded(true);
      setShowChevron(false);
    } else {
      setExpanded(false);
      setShowChevron(true);
    }
    setMeasuring(false);
  };

  const handleNameTextLayout = (event) => {
    handleExpandableTextLayout(event, {
      setExpanded: setIsNameExpanded,
      setShowChevron: setShouldShowNameExpandButton,
      setMeasuring: setIsNameMeasuring,
      isMeasuring: isNameMeasuring,
    });
  };

  const handleCommentTextLayout = (event) => {
    handleExpandableTextLayout(event, {
      setExpanded: setIsCommentExpanded,
      setShowChevron: setShouldShowExpandButton,
      setMeasuring: setIsCommentMeasuring,
      isMeasuring: isCommentMeasuring,
    });
  };

  const getExpandableTextHeight = (isExpanded) => (isExpanded ? 200 : 48);

  const getExpandableNumberOfLines = (isExpanded) => (isExpanded ? undefined : 2);

  const renderExpandableText = ({
    text,
    placeholder,
    textRef,
    isExpanded,
    isMeasuring,
    onTextLayout,
    color,
  }) => (
    <>
      {isMeasuring && (
        <Text
          style={[styles.commentText, styles.measureText, { color }]}
          numberOfLines={undefined}
          onTextLayout={onTextLayout}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
        >
          {text || placeholder}
        </Text>
      )}
      <Text
        ref={textRef}
        style={[styles.commentText, { color }]}
        numberOfLines={getExpandableNumberOfLines(isExpanded)}
      >
        {text || placeholder}
      </Text>
    </>
  );

  useEffect(() => {
    if (recipe) {
      setCommentText(recipe.comment || '');
      setNameText(recipe.name || '');
      setUrlText(recipe.url || '');
      setImages(Array.isArray(recipe.images) ? recipe.images : []);
    }
  }, [recipe]);

  // Resolve a local path for every photo, downloading from Drive on demand
  // (recipeImageService.ensureLocal) when this device doesn't have the file
  // locally yet - e.g. a fresh install that only synced the Excel reference.
  useEffect(() => {
    let cancelled = false;

    const resolveImages = async () => {
      for (const image of images) {
        if (cancelled) return;
        if (image.localFile) {
          setResolvedPaths(prev => (prev[image.id] === image.localFile ? prev : { ...prev, [image.id]: image.localFile }));
          continue;
        }
        const path = await recipeImageService.ensureLocal(image);
        if (!cancelled && path) {
          setResolvedPaths(prev => ({ ...prev, [image.id]: path }));
        }
      }
    };

    resolveImages();

    return () => {
      cancelled = true;
    };
  }, [images]);

  // Re-measure expandable text whenever the dialog opens or recipe content changes.
  useEffect(() => {
    if (visible && recipe) {
      setIsNameMeasuring(true);
      setIsNameExpanded(false);
      setShouldShowNameExpandButton(false);
      setIsCommentMeasuring(true);
      setIsCommentExpanded(false);
      setShouldShowExpandButton(false);
    }
  }, [visible, recipe?.name, recipe?.comment]);

  useEffect(() => {
    if (!visible) {
      if (isEditingComment && recipe) {
        handleCommentSave();
      }
      if (isEditingName && recipe) {
        handleNameSave();
      }
      if (isEditingUrl && recipe) {
        handleUrlSave();
      }
      setHasClickedCook(false);
      setIsEditingComment(false);
      setIsEditingName(false);
      setIsEditingUrl(false);
      setNoMoreRecipes(false);
      setIsCommentExpanded(false);
      setIsNameExpanded(false);
      setIsCommentMeasuring(true);
      setIsNameMeasuring(true);
      setShouldShowExpandButton(false);
      setShouldShowNameExpandButton(false);
      setViewerVisible(false);
    }
  }, [visible, recipe]);

  if (!recipe) return null;

  const handleDialogDismiss = () => {
    if (isEditingComment && recipe) {
      handleCommentSave();
    }
    if (isEditingName && recipe) {
      handleNameSave();
    }
    onClose();
  };

  const handleContentPress = () => {
    if (isEditingComment && recipe) {
      handleCommentSave();
    }
    if (isEditingName && recipe) {
      handleNameSave();
    }
  };

  const handleChangeMind = () => {
    if (!recipe) return;
    setHasClickedCook(false);
    onUncook(recipe.name);
  };

  const handleCookPress = async () => {
    try {
      if (!recipe) return;

      setHasClickedCook(true);
      onCook(recipe.name);

      // If recipe has a URL, open it in browser
      if (recipe.url) {
        await openUrlSafely(recipe.url);
      } else {
        console.log('No URL to open for this recipe');
      }
    } catch (error) {
      console.error('Error in handleCook:', error);
      console.error('Error stack:', error.stack);
      // Don't crash the app, just log the error
    }
  };

  const handleOpenURL = async () => {
    if (!recipe || !recipe.url) return;
    await openUrlSafely(recipe.url);
  };

  const handleNext = async () => {
    setIsEditingComment(false);
    setHasClickedCook(false);
    setIsCommentExpanded(false);
    setIsEditingName(false);
    setIsNameExpanded(false);
    setIsCommentMeasuring(true);
    setIsNameMeasuring(true);
    setShouldShowExpandButton(false);
    setShouldShowNameExpandButton(false);
    setIsEditingUrl(false);
    try {
      const nextRecipe = await onNext();
      if (nextRecipe && nextRecipe.empty) {
        setNoMoreRecipes(true);
      }
    } catch (error) {
      console.error('Error getting next recipe:', error);
    }
  };

  // --- Photo handlers ------------------------------------------------

  const persistImages = async (updatedImages) => {
    setImages(updatedImages);
    if (!recipe) return;
    try {
      await onUpdate(recipe.name, { ...recipe, images: updatedImages });
    } catch (error) {
      console.error('Error saving recipe photos:', error);
    }
  };

  const handleAddPhotoFromCamera = async () => {
    try {
      setIsAddingImage(true);
      const imageRef = await recipeImageService.captureFromCamera();
      if (imageRef) {
        await persistImages([...images, imageRef]);
      }
    } catch (error) {
      console.warn('Failed to capture photo:', error?.message || error);
    } finally {
      setIsAddingImage(false);
    }
  };

  const handleAddPhotoFromGallery = async () => {
    try {
      setIsAddingImage(true);
      const picked = await recipeImageService.pickFromLibrary();
      if (picked?.length) {
        await persistImages([...images, ...picked]);
      }
    } catch (error) {
      console.warn('Failed to pick photos:', error?.message || error);
    } finally {
      setIsAddingImage(false);
    }
  };

  const openViewer = (index) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleDeleteCurrentViewerImage = async (imageToDelete) => {
    const remaining = images.filter(image => image.id !== imageToDelete.id);
    await persistImages(remaining);
    recipeImageService.deleteImage(imageToDelete).catch(() => {});

    if (remaining.length === 0) {
      setViewerVisible(false);
    } else {
      setViewerIndex(prev => Math.min(prev, remaining.length - 1));
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
        <View style={styles.header}>
          <MaterialCommunityIcons name="book-open-variant" size={28} color={theme.colors.primary} style={styles.headerIcon} />
          <Text style={[styles.title, { color: theme.colors.primary }]}>How about this recipe?</Text>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Name</Text>
                <View style={styles.nameContainer}>
                  {isEditingName ? (
                    <View style={styles.nameEditContainer}>
                      <TextInput
                        ref={nameInputRef}
                        value={nameText}
                        onChangeText={setNameText}
                        onBlur={() => {
                          setIsNameFocused(false);
                          handleNameSave();
                        }}
                        onFocus={() => setIsNameFocused(true)}
                        style={styles.commentInput}
                        placeholder="Enter recipe name"
                        placeholderTextColor={`${theme.colors.primary}66`}
                        multiline
                        autoFocus
                        mode="outlined"
                      />
                      <TouchableOpacity
                        onPress={handleNameSave}
                        style={styles.expandButton}
                      >
                        <MaterialCommunityIcons
                          name="content-save"
                          size={20}
                          width={20}
                          paddingTop={4}
                          paddingLeft={4}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.nameViewContainer}>
                      <TouchableOpacity
                        style={[styles.commentTextContainer, { maxHeight: getExpandableTextHeight(isNameExpanded) }]}
                        onPress={() => setIsEditingName(true)}
                      >
                        {renderExpandableText({
                          text: nameText,
                          placeholder: 'Enter recipe name',
                          textRef: nameTextRef,
                          isExpanded: isNameExpanded,
                          isMeasuring: isNameMeasuring,
                          onTextLayout: handleNameTextLayout,
                          color: nameText ? theme.colors.onSurface : theme.colors.onSurface + '66',
                        })}
                      </TouchableOpacity>
                      {shouldShowNameExpandButton && (
                        <TouchableOpacity
                          onPress={toggleNameExpansion}
                          style={styles.expandButton}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <MaterialCommunityIcons
                            name={isNameExpanded ? "chevron-up" : "chevron-down"}
                            size={28}
                            width={20}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => onDelete(recipe.name)}
                        style={styles.deleteButton}
                      >
                        <MaterialCommunityIcons
                          name="delete"
                          size={22}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
              <View style={[styles.row, { marginTop: 0 }]}>
                <Text style={[styles.label, { color: theme.colors.onSurface }]}>Comment</Text>
                <View style={styles.commentContainer}>
                  {isEditingComment ? (
                    <View style={styles.commentEditContainer}>
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
                      <TouchableOpacity
                        onPress={handleCommentSave}
                        style={styles.expandButton}
                      >
                        <MaterialCommunityIcons
                          name="content-save"
                          size={20}
                          width={20}
                          paddingTop={4}
                          paddingLeft={4}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.commentViewContainer}>
                      <TouchableOpacity
                        style={[styles.commentTextContainer, { maxHeight: getExpandableTextHeight(isCommentExpanded) }]}
                        onPress={() => setIsEditingComment(true)}
                      >
                        {renderExpandableText({
                          text: commentText,
                          placeholder: 'Add any comments',
                          textRef: commentTextRef,
                          isExpanded: isCommentExpanded,
                          isMeasuring: isCommentMeasuring,
                          onTextLayout: handleCommentTextLayout,
                          color: commentText ? theme.colors.onSurface : theme.colors.onSurface + '66',
                        })}
                      </TouchableOpacity>
                      {shouldShowExpandButton && (
                        <TouchableOpacity
                          onPress={toggleCommentExpansion}
                          style={styles.expandButton}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <MaterialCommunityIcons
                            name={isCommentExpanded ? "chevron-up" : "chevron-down"}
                            size={28}
                            width={20}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
              {recipe && recipe.url && (
                <View style={[styles.row, { marginTop: 1 }]}>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>URL</Text>
                  <View style={styles.urlContainer}>
                    {isEditingUrl ? (
                      <View style={styles.urlEditContainer}>
                        <TextInput
                          ref={urlInputRef}
                          value={urlText}
                          onChangeText={setUrlText}
                          onBlur={() => {
                            setIsUrlFocused(false);
                            handleUrlSave();
                          }}
                          onFocus={() => setIsUrlFocused(true)}
                          style={styles.commentInput}
                          placeholder="Enter recipe URL"
                          placeholderTextColor={`${theme.colors.primary}66`}
                          autoFocus
                          mode="outlined"
                        />
                        <TouchableOpacity
                          onPress={handleUrlSave}
                          style={styles.expandButton}
                        >
                          <MaterialCommunityIcons
                            name="content-save"
                            size={20}
                            width={20}
                            paddingTop={4}
                            paddingLeft={4}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.urlViewContainer}>
                        <TouchableOpacity
                          style={[styles.commentTextContainer, { maxHeight: 48 }]}
                          onLongPress={() => setIsEditingUrl(true)}
                        >
                          <Text
                            style={[styles.commentText, { color: theme.colors.primary }]}
                            numberOfLines={1}
                          >
                            {urlText || "Enter recipe URL"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleOpenURL}
                          style={styles.expandButton}
                        >
                          <MaterialCommunityIcons
                            name="open-in-new"
                            size={18}
                            width={16}
                            color={theme.colors.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}
              {/* With no thumbnails the container is just the add-photo icons, so both
                  sides are centred and the icons line up with the "Photos" label. Once a
                  thumbnail strip is present the label has to sit at the top instead. */}
              <View style={[styles.row, {
                marginTop: 1,
                alignItems: images.length > 0 ? 'flex-start' : 'center',
              }]}>
                <Text style={[styles.label, {
                  color: theme.colors.onSurface,
                  paddingTop: images.length > 0 ? 12 : 0,
                  alignSelf: images.length > 0 ? 'flex-start' : 'center',
                }]}>Photos</Text>
                <View style={styles.photosContainer}>
                  {images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailStrip}>
                      {images.map((image, index) => (
                        <TouchableOpacity
                          key={image.id}
                          style={styles.thumbnailWrapper}
                          onPress={() => openViewer(index)}
                        >
                          {resolvedPaths[image.id] ? (
                            <Image source={{ uri: resolvedPaths[image.id] }} style={styles.thumbnail} />
                          ) : (
                            <View style={[styles.thumbnail, styles.thumbnailLoading]}>
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  <View style={styles.addPhotoRow}>
                    <TouchableOpacity
                      onPress={handleAddPhotoFromCamera}
                      style={styles.addPhotoButton}
                      disabled={isAddingImage}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="camera-plus" size={22} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleAddPhotoFromGallery}
                      style={styles.addPhotoButton}
                      disabled={isAddingImage}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="image-plus" size={22} color={theme.colors.primary} />
                    </TouchableOpacity>
                    {isAddingImage && <ActivityIndicator size="small" color={theme.colors.primary} />}
                  </View>
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
                {onTogglePin && !isSuggestionFlow && (
                  <Button
                    mode="outlined"
                    onPress={() => onTogglePin(recipe.name)}
                    style={[styles.actionButton, { borderColor: theme.colors.tertiary }]}
                    textColor={theme.colors.tertiary}
                    icon={isPinned ? "pin-off" : "pin"}
                  >
                    {isPinned ? "Unpin this recipe" : "Pin this recipe"}
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={handleCookPress}
                  style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                  icon="chef-hat"
                >
                  I will Cook IT!
                </Button>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                {onTogglePin && (
                  <Button
                    mode="outlined"
                    onPress={() => onTogglePin(recipe.name)}
                    style={[styles.actionButton, { borderColor: theme.colors.tertiary }]}
                    textColor={theme.colors.tertiary}
                    icon={isPinned ? "pin-off" : "pin"}
                  >
                    {isPinned ? "Unpin this recipe" : "Pin this recipe"}
                  </Button>
                )}
                <Button
                  mode="contained"
                  onPress={handleChangeMind}
                  style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                  icon="refresh"
                >
                  Changed my mind
                </Button>
              </View>
            )}
          </Dialog.Actions>
        </ScrollView>
      </Dialog>

      <FullScreenImageViewer
        visible={viewerVisible}
        images={images}
        resolvedPaths={resolvedPaths}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
        onDeleteCurrent={handleDeleteCurrentViewerImage}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerIcon: {
    marginRight: 8,
  },
  content: {
    gap: 16,
    /*
     * Keeps the action buttons at a fixed height on the screen while stepping through
     * suggestions with "Next". The dialog is vertically centred and sizes to its
     * content, so any difference in content height moves the buttons by half of it.
     *
     * Collapsed, the four rows are bounded, so the tallest possible initial layout is
     * known up front:
     *   Name     48  (row minHeight; the text itself is capped at 48 when collapsed)
     *   Comment  48  (same)
     *   URL      48  (only rendered when the recipe has one)
     *   Photos   90  (56 thumbnail + 8 gap + 26 add-photo icons; 48 with no photos)
     *   gaps     48  (3 x 16)
     *            ---
     *            282
     * Padding every recipe to that height makes the collapsed state identical for all
     * of them. Expanding a name or comment (48 -> 200) still grows past it, which is
     * the one case where the buttons are meant to move.
     */
    minHeight: 282,
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
    paddingLeft: 12,
    marginRight: 2,
    flex: 1,
    paddingTop: 12,
  },
  deleteButton: {
    margin: 0,
    minWidth: 0,
    width: 30,
    alignSelf: 'flex-start',
    paddingTop: 12,
    paddingLeft: 4,
    marginLeft: 0,
    marginRight: -4,
  },
  commentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  nameTextContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 2,
  },
  nameInput: {
    fontSize: 16,
    flex: 1,
    backgroundColor: '#f7f0e2',
  },
  commentViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  commentEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  commentTextContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingTop: 0,
    paddingLeft: 12,
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 48,
    marginRight: 2,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  commentText: {
    fontSize: 16,
    lineHeight: 20,
  },
  measureText: {
    position: 'absolute',
    opacity: 0,
    left: 12,
    right: 0,
    top: 0,
    zIndex: -1,
  },
  commentInput: {
    fontSize: 16,
    flex: 1,
    backgroundColor: '#f7f0e2',
  },
  expandButton: {
    padding: 0,
    marginLeft: 4,
    marginRight: 4,
    alignSelf: 'center',
  },
  actions: {
    padding: 0,
    gap: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  actionButton: {
    width: '100%',
  },
  urlContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  urlEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  urlViewContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  photosContainer: {
    flex: 1,
    gap: 8,
    paddingLeft: 12,
  },
  thumbnailStrip: {
    flexGrow: 0,
  },
  thumbnailWrapper: {
    marginRight: 8,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#f7f0e2',
  },
  thumbnailLoading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  addPhotoButton: {
    padding: 2,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  viewerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomableImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  viewerCloseButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    padding: 6,
  },
  viewerBottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  viewerCounter: {
    color: '#fff',
    fontSize: 15,
  },
});
