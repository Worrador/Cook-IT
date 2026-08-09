import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, useWindowDimensions } from 'react-native';
import { Surface, useTheme, Dialog } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';

const RecipeBookDialog = ({
  onClose,
  recipes,
  onRecipePress,
  cookedRecipes,
  pinnedRecipes,
  onTogglePin,
  lastCookedDates = {}, // Add this prop for last cooked dates
  cookCounts = {} // Add this prop for cook counts
}) => {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Sort bar lives inside a ~90% width dialog, so estimate usable column width.
  const sortBarContentWidth = screenWidth * 0.9 - 32;
  const isCompactSort = sortBarContentWidth < 400;
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'timesCooked', 'lastCooked'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'

  // Sort recipes based on current sort settings and filter by search query
  const sortedRecipes = [...recipes]
    .filter(recipe =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (recipe.comment && recipe.comment.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'timesCooked':
          const aCookCount = cookCounts[a.name] || 0;
          const bCookCount = cookCounts[b.name] || 0;
          comparison = aCookCount - bCookCount;
          break;
        case 'lastCooked':
          const aLastCooked = lastCookedDates[a.name] ? new Date(lastCookedDates[a.name]) : new Date(0);
          const bLastCooked = lastCookedDates[b.name] ? new Date(lastCookedDates[b.name]) : new Date(0);
          comparison = aLastCooked - bLastCooked;
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort column with ascending order
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) {
      return 'unfold-more-horizontal'; // Neutral icon
    }
    return sortOrder === 'asc' ? 'chevron-up' : 'chevron-down';
  };

  const sortLabels = {
    name: isCompactSort ? 'Name' : 'Recipe name',
    lastCooked: 'Last cooked',
    timesCooked: 'Times cooked',
  };

  const renderSortButton = (column) => (
    <TouchableOpacity
      style={styles.sortButton}
      onPress={() => handleSort(column)}
    >
      <Text
        style={[styles.sortButtonText, isCompactSort && styles.sortButtonTextCompact, {
          color: sortBy === column ? theme.colors.primary : theme.colors.onSurfaceVariant,
          fontWeight: sortBy === column ? 'bold' : 'normal'
        }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        ellipsizeMode="tail"
      >
        {sortLabels[column]}
      </Text>
      <MaterialCommunityIcons
        name={getSortIcon(column)}
        size={isCompactSort ? 14 : 16}
        color={sortBy === column ? theme.colors.primary : theme.colors.onSurfaceVariant}
        style={styles.sortIcon}
      />
    </TouchableOpacity>
  );

  const renderRecipe = (recipe) => (
    <TouchableOpacity
      key={recipe.name}
      onPress={() => onRecipePress(recipe)}
      style={styles.recipeItem}
    >
      <Surface style={styles.recipeCard} elevation={0}>
        <View style={styles.recipeHeader}>
          <View style={styles.recipeTitleContainer}>
            <Text style={[styles.recipeName, { color: theme.colors.primary }]}>{recipe.name}</Text>
          </View>
          {recipe.comment && (
            <Text style={[styles.recipeComment, { color: theme.colors.primary }]} numberOfLines={2}>
              {recipe.comment}
            </Text>
          )}
          <View style={styles.recipeDates}>
            {lastCookedDates[recipe.name] && (
              <Text style={[styles.recipeDate, { color: '#A0A0A0' }]}>
                Last cooked: {new Date(lastCookedDates[recipe.name]).toLocaleDateString()}
              </Text>
            )}
            {cookCounts[recipe.name] > 0 && (
              <Text style={[styles.recipeDate, { color: '#A0A0A0', textAlign: 'right' }]}>
                Times cooked: {cookCounts[recipe.name]}
              </Text>
            )}
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={styles.header}>
        <MaterialCommunityIcons name="book-open" size={28} color={theme.colors.primary} style={styles.headerIcon} />
        <Text style={[styles.title, { color: theme.colors.primary }]}>Recipe Book</Text>
      </View>
      <Dialog.Content style={styles.content}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.primary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.primary }]}
            placeholder="Search recipes..."
            placeholderTextColor="#A0A0A0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Sort Bar */}
        <View style={styles.sortBar}>
          <View style={styles.sortButtons}>
            {renderSortButton('name')}
            {renderSortButton('lastCooked')}
            {renderSortButton('timesCooked')}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={true}
          style={styles.recipesList}
        >
          {sortedRecipes.length > 0 ? (
            sortedRecipes.map(renderRecipe)
          ) : (
            <View style={[styles.emptyState, { backgroundColor: '#FBE7A0' }]}>
              <MaterialCommunityIcons name="book-open-variant" size={48} color={theme.colors.primary} />
              <Text style={[styles.emptyStateText, { color: theme.colors.primary }]}>
                {searchQuery ? 'No results found' : 'No recipes yet! Add your first recipe using the "Add Recipe" button.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </Dialog.Content>
      <View style={styles.recipeCount}>
        <Text style={[styles.recipeCountText, { color: theme.colors.primary }]}>
          {recipes.length} recipes
        </Text>
      </View>
      <Dialog.Actions>
        <Button
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
          labelStyle={styles.closeButtonLabel}
        >
          Close
        </Button>
      </Dialog.Actions>
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerIcon: {
    marginRight: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  recipeCount: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  recipeCountText: {
    fontSize: 14,
    fontWeight: '400',
  },
  recipesList: {
    height: '80%', // Percentage-based height that works across all devices
  },
  recipeItem: {
    marginBottom: 12,
  },
  recipeCard: {
    borderRadius: 12,
    backgroundColor: '#fff',
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
    fontSize: 11,
  },
  recipeDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: '#FBE7A0',
    borderRadius: 8,
    marginBottom: 16,
  },
  sortButtons: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  sortButtonText: {
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'center',
  },
  sortButtonTextCompact: {
    fontSize: 11,
  },
  sortIcon: {
    flexShrink: 0,
    marginLeft: 2,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  closeButton: {
    width: '100%',
  },
  closeButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f7f0e2',
  },
  bold: {
    fontWeight: 'bold',
  },
});

export default RecipeBookDialog;