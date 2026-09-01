// "Support Cook-IT" - the content only.
//
// Same rewrite as HelpDialog: the shared DialogShell now supplies the header,
// padding and footer buttons, so this file is just the message. Previously it
// drew its own centred title and two full-width stacked buttons, which looked
// cramped and unlike every other dialog once the shell was around it.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BROWN, ORANGE, YELLOW, INK, MUTED } from '../theme/webPalette';

const PERKS = [
  { icon: 'creation', text: 'Access to future premium features' },
  { icon: 'heart-outline', text: 'A thank you message in the app' },
  { icon: 'party-popper', text: 'The warm feeling of supporting open source' },
];

export default function BuyCoffeeDialog() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="coffee" size={26} color={BROWN} />
        </View>
        <Text style={styles.heroText}>
          <Text style={styles.strong}>Cook-IT is free and open source.</Text> If it&apos;s
          earning its place in your kitchen, a coffee helps keep it going.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Where it goes</Text>
      <Text style={styles.body}>
        Straight into maintaining Cook-IT, adding features, and keeping it free for
        everyone.
      </Text>

      <Text style={styles.sectionTitle}>What you get</Text>
      {PERKS.map(perk => (
        <View key={perk.text} style={styles.perk}>
          <MaterialCommunityIcons name={perk.icon} size={18} color={ORANGE} />
          <Text style={styles.perkText}>{perk.text}</Text>
        </View>
      ))}

      <Text style={styles.footnote}>
        Every contribution, however small, makes a difference — and no pressure if not.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 6 },

  hero: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: YELLOW, borderRadius: 12, padding: 16, marginBottom: 22,
  },
  heroIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroText: { flex: 1, color: BROWN, fontSize: 15, lineHeight: 23 },
  strong: { fontWeight: '800' },

  sectionTitle: {
    color: ORANGE, fontSize: 13, fontWeight: '800',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 6,
  },
  body: { color: INK, fontSize: 15, lineHeight: 23, marginBottom: 18 },

  perk: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  perkText: { flex: 1, color: INK, fontSize: 15, lineHeight: 22 },

  footnote: {
    color: MUTED, fontSize: 13.5, lineHeight: 21, fontStyle: 'italic',
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(90,66,48,0.12)',
  },
});
