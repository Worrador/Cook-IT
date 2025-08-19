import React from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Surface, useTheme, Dialog } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';

const HelpDialog = ({ onClose }) => {
  const theme = useTheme();
  const screenWidth = Dimensions.get('window').width;

  // Adjust title font size based on screen width
  const getTitleFontSize = () => {
    if (screenWidth < 400) return 20;  // Very small phones
    if (screenWidth < 500) return 22;  // Small phones
    return 24;  // Normal and large phones
  };

  return (
    <>
      <View style={styles.header}>
        <MaterialCommunityIcons name="chef-hat" size={28} color={theme.colors.primary} style={styles.headerIcon} />
        <Text style={[styles.title, { color: theme.colors.primary, fontSize: getTitleFontSize() }]}>How does Cook-IT work?</Text>
      </View>
      <Dialog.Content style={styles.content}>
        <ScrollView
          showsVerticalScrollIndicator={true}
        >
          <View style={[styles.infoBox, { backgroundColor: '#FBE7A0' }]}>
            <Text style={[styles.infoText, { color: theme.colors.primary }]}>
              <Text style={styles.bold}>Cook-IT helps you decide what to cook</Text> by suggesting recipes you haven't made in a while.
              No more "What should we eat tonight?" dilemmas!
            </Text>
          </View>

          <Section
            icon="🚀"
            title="Getting Started"
            content="When you first use Cook-IT, it automatically creates a recipe file in your Google Drive. If you've used Cook-IT before, it finds your existing recipe file and syncs it with your device."
            theme={theme}
          />

          <Section
            icon="📜"
            title="Adding Recipes"
            content={
              <View>
                <ListItem icon="➕" text="Click 'Add Recipe'" theme={theme} />
                <ListItem icon="📝" text="Enter a name" theme={theme} />
                <ListItem icon="🌐" text="Add a web URL to the recipe or just a path to a local file (e.g: C:\Documents\Recipe.pdf)" theme={theme} />
                <ListItem icon="💬" text="Add optional comments or notes (e.g: Use more water)" theme={theme} />
              </View>
            }
            theme={theme}
          />

          <Section
            icon="🎲"
            title="Choosing What to Cook"
            content="Click 'Choose Recipe' and Cook-IT suggests something based on how recently you've made each dish. Recipes you haven't cooked in a while are more likely to be picked."
            theme={theme}
          />

          <Section
            icon="📖"
            title="Managing Your Recipes"
            content={
              <View>
                <Text style={[styles.sectionText, { color: theme.colors.primary }]}>
                  After you get a suggestion you have the options to:
                </Text>
                <ListItem icon="🗑️" text="Delete recipes you no longer want" theme={theme} />
                <ListItem icon="✏️" text="Edit comments anytime" theme={theme} />
                <ListItem icon="➔" text="Navigate to the next recipe suggestion by clicking 'Next'" theme={theme} />
                <ListItem icon="👀" text="View recipe details by clicking 'I will Cook IT!'. The app will remember your choice" theme={theme} />
                <ListItem icon="↺" text="You then will have the option to undo your choice" theme={theme} />
                <ListItem icon="📌" text="Or save the recipe to the homescreen" theme={theme} />
              </View>
            }
            theme={theme}
          />

          <View style={[styles.infoBox, { backgroundColor: '#FBE7A0' }]}>
            <MaterialCommunityIcons name="lightbulb" size={32} color={theme.colors.primary} style={styles.infoIcon} />
            <Text style={[styles.infoText, { color: theme.colors.primary, fontStyle: 'italic' }]}>
              Tip: By clicking "I will Cook IT!" you will have the chance to create your shopping list. And by saving the recipe to the homescreen, the next time you open the app, you can open the recipe again for the actual cooking instructions.
            </Text>
          </View>

          <Section
            icon="💾"
            title="Saving Your Recipes"
            content="Your new or modified recipes are saved automatically. When you close Cook-IT, all changes are securely uploaded to your Google Drive, ensuring nothing is lost."
            theme={theme}
          />

          <View style={[styles.infoBox, { backgroundColor: '#FBE7A0' }]}>
            <MaterialCommunityIcons name="lock" size={32} color={theme.colors.primary} style={styles.infoIcon} />
            <Text style={[styles.infoText, { color: theme.colors.primary, fontStyle: 'italic' }]}>
              All your recipe data stays private in your own Google Drive account.
            </Text>
          </View>
        </ScrollView>
      </Dialog.Content>
      <Dialog.Actions>
        <Button
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
          labelStyle={styles.closeButtonLabel}
        >
          Got it!
        </Button>
      </Dialog.Actions>
    </>
  );
};

const Section = ({ icon, title, content, theme }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={[styles.iconContainer, { backgroundColor: '#F2BC42' }]}>
        <Text style={[styles.iconText, { }]}>{icon}</Text>
      </View>
      <Text style={[styles.sectionTitle, { color: '#E06D3D' }]}>{title}</Text>
    </View>
    <View style={[styles.sectionContent, { borderLeftColor: '#F2BC42' }]}>
      {typeof content === 'string' ? (
        <Text style={[styles.sectionText, { color: theme.colors.primary }]}>{content}</Text>
      ) : (
        content
      )}
    </View>
  </View>
);

const ListItem = ({ icon, text, theme }) => (
  <View style={styles.listItem}>
    <Text style={[styles.listItemIcon, { color: '#E06D3D' }]}>{icon}</Text>
    <Text style={[styles.listItemText, { color: theme.colors.primary }]}>{text}</Text>
  </View>
);

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
    paddingHorizontal: 2, // Added horizontal padding
  },
  title: {
    fontWeight: 'bold',
    flexShrink: 1, // Allow text to shrink if needed
  },
  headerIcon: {
    marginRight: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
    gap: 8,
  },
  infoIcon: {},
  infoText: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionContent: {
    marginLeft: 15,
    paddingLeft: 12,
    borderLeftWidth: 2,
  },
  sectionText: {
    fontSize: 14,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItemIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
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

export default HelpDialog;