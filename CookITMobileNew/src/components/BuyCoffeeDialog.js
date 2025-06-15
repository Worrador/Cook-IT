import React from 'react';
import { View, Text, StyleSheet, Linking, ScrollView } from 'react-native';
import { Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';

const BuyCoffeeDialog = ({ visible, onClose }) => {
  const theme = useTheme();

  const handleBuyCoffee = () => {
    Linking.openURL('https://ko-fi.com/worrador');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
      bounces={true}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="coffee" size={32} color={theme.colors.primary} style={styles.headerIcon} />
        <Text style={[styles.title, { color: theme.colors.primary }]}>Support Cook-IT</Text>
      </View>

      <View style={[styles.infoBox, { backgroundColor: '#FBE7A0' }]}>
        <MaterialCommunityIcons name="heart" size={32} color={theme.colors.primary} style={styles.infoIcon} />
        <Text style={[styles.infoText, { color: theme.colors.primary }]}>
          <Text style={styles.bold}>Cook-IT is free and open source</Text>, but if you find it helpful, consider buying me a coffee to support its development!
        </Text>
      </View>

      <Section
        icon="☕"
        title="Why Support?"
        content="Your support helps me maintain and improve Cook-IT, add new features, and keep it free for everyone to use."
        theme={theme}
      />

      <Section
        icon="💡"
        title="What You Get"
        content={
          <View>
            <ListItem icon="✨" text="Access to future premium features" theme={theme} />
            <ListItem icon="💌" text="Special thank you message in the app" theme={theme} />
            <ListItem icon="🎉" text="The warm feeling of supporting open source" theme={theme} />
          </View>
        }
        theme={theme}
      />

      <View style={[styles.infoBox, { backgroundColor: '#FBE7A0' }]}>
        <MaterialCommunityIcons name="star" size={32} color={theme.colors.primary} style={styles.infoIcon} />
        <Text style={[styles.infoText, { color: theme.colors.primary, fontStyle: 'italic' }]}>
          Every contribution, no matter how small, makes a big difference in keeping Cook-IT alive and growing!
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          onPress={handleBuyCoffee}
          style={[styles.buyButton, { backgroundColor: theme.colors.primary }]}
          labelStyle={styles.buyButtonLabel}
          icon="coffee"
        >
          Buy Me a Coffee
        </Button>
        <Button
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: theme.colors.secondary }]}
          labelStyle={styles.closeButtonLabel}
        >
          Maybe Later
        </Button>
      </View>
    </ScrollView>
  );
};

const Section = ({ icon, title, content, theme }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={[styles.iconContainer, { backgroundColor: '#F2BC42', marginLeft: -15 }]}>
        <Text style={styles.iconText}>{icon}</Text>
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
  container: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  headerIcon: {
    marginRight: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 16,
  },
  infoIcon: {
    marginRight: 4,
  },
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
  buttonContainer: {
    marginTop: 16,
    gap: 12,
    paddingBottom: 16,
  },
  buyButton: {
    marginBottom: 8,
  },
  buyButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f7f0e2',
  },
  closeButton: {
    marginBottom: 8,
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

export default BuyCoffeeDialog;