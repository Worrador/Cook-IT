import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Card, CardHeader, CardContent, CardFooter } from './Card';
import { Button } from './Button';

export const HelpDialog = ({
  visible,
  onClose,
}) => {
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
                <Text style={styles.title}>Welcome to CookIT!</Text>
              </CardHeader>
              <CardContent>
                <Text style={styles.sectionTitle}>Getting Started</Text>
                <Text style={styles.text}>
                  CookIT helps you manage your recipes and cooking history. Here's how to use it:
                </Text>

                <Text style={styles.sectionTitle}>Adding Recipes</Text>
                <Text style={styles.text}>
                  1. Tap the "Add Recipe" button to create a new recipe{'\n'}
                  2. Enter the recipe name{'\n'}
                  3. Optionally add a URL to the recipe online{'\n'}
                  4. Add any comments or notes about the recipe
                </Text>

                <Text style={styles.sectionTitle}>Managing Recipes</Text>
                <Text style={styles.text}>
                  • Tap on a recipe to view its details{'\n'}
                  • Edit recipes by tapping the "Edit" button{'\n'}
                  • Mark recipes as cooked/uncooked{'\n'}
                  • Delete recipes you no longer need
                </Text>

                <Text style={styles.sectionTitle}>Features</Text>
                <Text style={styles.text}>
                  • Store recipes locally on your device{'\n'}
                  • Track which recipes you've cooked{'\n'}
                  • Add comments and notes to recipes{'\n'}
                  • Open recipe URLs directly in your browser
                </Text>

                <Text style={styles.sectionTitle}>Tips</Text>
                <Text style={styles.text}>
                  • Keep your recipe names descriptive{'\n'}
                  • Add URLs to easily access online recipes{'\n'}
                  • Use comments to note modifications or preferences{'\n'}
                  • Mark recipes as cooked to track your cooking history
                </Text>
              </CardContent>
              <CardFooter>
                <Button
                  onPress={onClose}
                  style={styles.button}
                >
                  Got it!
                </Button>
              </CardFooter>
            </Card>
          </ScrollView>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
  },
  button: {
    marginTop: 16,
  },
});