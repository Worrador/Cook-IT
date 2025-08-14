import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, Dialog } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';

const EmptyRecipeBookDialog = ({ onDismiss, onAddSampleRecipes, isLoading, isFirstTime = false }) => {
  const theme = useTheme();

  return (
    <>
      {isFirstTime && (
        <View style={styles.header}>
          <MaterialCommunityIcons name="chef-hat" size={28} color={theme.colors.primary} style={styles.headerIcon} />
          <Text style={[styles.title, { color: theme.colors.primary }]}>Welcome to CookIT!</Text>
        </View>
      )}

      <Dialog.Content style={styles.content}>
        <ScrollView>
          <Text style={[styles.message, { color: theme.colors.onSurface }]}>
            Your recipe book is empty! Would you like to get started with some delicious sample recipes hand-picked by our team?
          </Text>

          <View style={styles.features}>
            <View style={styles.feature}>
              <MaterialCommunityIcons name="food-variant" size={20} color={theme.colors.secondary} />
              <Text style={[styles.featureText, { color: theme.colors.onSurface }]}>
                20 diverse recipes from around the world
              </Text>
            </View>

            <View style={styles.feature}>
              <MaterialCommunityIcons name="link-variant" size={20} color={theme.colors.secondary} />
              <Text style={[styles.featureText, { color: theme.colors.onSurface }]}>
                Each recipe includes a link to detailed instructions
              </Text>
            </View>

            <View style={styles.feature}>
              <MaterialCommunityIcons name="comment-text" size={20} color={theme.colors.secondary} />
              <Text style={[styles.featureText, { color: theme.colors.onSurface }]}>
                Helpful cooking tips and variations included
              </Text>
            </View>
          </View>

          <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
            You can always add your own recipes later or delete any of these sample recipes.
          </Text>
        </ScrollView>
      </Dialog.Content>

      <Dialog.Actions>
        <View style={styles.buttonContainer}>
          <Button
            onPress={onAddSampleRecipes}
            style={[styles.addButton, { backgroundColor: theme.colors.secondary }]}
            labelStyle={styles.buttonLabel}
            icon="food-variant"
            disabled={isLoading}
          >
            {isLoading ? 'Adding Recipes...' : 'Yes, please!'}
          </Button>

          <Button
            onPress={onDismiss}
            style={[styles.cancelButton, { backgroundColor: theme.colors.primary }]}
            labelStyle={styles.buttonLabel}
          >
            I'll add my own
          </Button>
        </View>
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
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerIcon: {
    marginRight: 8,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
    marginTop: 16,
  },
  features: {
    gap: 12,
    marginVertical: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  note: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  addButton: {},
  cancelButton: {},
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f7f0e2',
  },
});

export default EmptyRecipeBookDialog;