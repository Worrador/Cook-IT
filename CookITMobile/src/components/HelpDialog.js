// "How Cook-IT works" - the content only.
//
// Rewritten from a phone-shaped dialog that drew its own title bar and a
// full-width stacked action button. Inside the shared DialogShell that read as
// cramped: no breathing room, and two competing sets of chrome. This is now
// content alone; the shell supplies the header, the padding, and the footer
// button, so it looks the same as every other dialog on both platforms.
//
// The web build has its own screen (src/screens/WebHome.js) with different
// button labels and a few features the phone doesn't have, so the text branches
// rather than describing an app the reader isn't looking at.
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BROWN, ORANGE, YELLOW, CREAM, INK, MUTED } from '../theme/webPalette';

const IS_WEB = Platform.OS === 'web';

function Note({ children, icon = 'lightbulb-on-outline' }) {
  return (
    <View style={styles.note}>
      <MaterialCommunityIcons name={icon} size={20} color={BROWN} style={styles.noteIcon} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

function Section({ icon, title, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={17} color={BROWN} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Line({ children }) {
  return (
    <View style={styles.line}>
      <View style={styles.bullet} />
      <Text style={styles.lineText}>{children}</Text>
    </View>
  );
}

export default function HelpDialog({ isFirstTime = false }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        {isFirstTime ? 'Welcome! ' : ''}
        <Text style={styles.leadStrong}>Cook-IT helps you decide what to cook</Text> by
        suggesting recipes you haven&apos;t made in a while. No more &ldquo;what should we eat
        tonight?&rdquo;
      </Text>

      <Section icon="google-drive" title="Getting started">
        <Text style={styles.body}>
          Cook-IT keeps your recipes on this device and, if you connect Google Drive, backs
          them up to a single workbook there. Connect once and it finds or creates that file
          for you.
        </Text>
        <Note>
          Share that file in Google Drive with your partner and you both get the same recipe
          book.
        </Note>
      </Section>

      <Section icon="plus-circle-outline" title="Adding recipes">
        {IS_WEB ? (
          <>
            <Line>Hit <Text style={styles.strong}>Add recipe</Text>, paste a link, press Fetch — the name and picture fill themselves in.</Line>
            <Line>Add a note if you want (&ldquo;use more water&rdquo;, &ldquo;needs guanciale&rdquo;).</Line>
          </>
        ) : (
          <>
            <Line>Tap <Text style={styles.strong}>Add Recipe</Text> and give it a name.</Line>
            <Line>Add a web link, or a path to a local file.</Line>
            <Line>Add optional notes (&ldquo;use more water&rdquo;).</Line>
          </>
        )}
      </Section>

      <Section icon="shuffle-variant" title="Choosing what to cook">
        <Text style={styles.body}>
          {IS_WEB
            ? 'Choose a recipe suggests something based on how recently you made each dish — the longer it has been, the more likely it comes up. Never-cooked recipes come up most of all.'
            : 'Choose Recipe suggests something based on how recently you made each dish — the longer it has been, the more likely it comes up.'}
        </Text>
        <Note icon="vote-outline">
          Can&apos;t agree? <Text style={styles.strong}>Vote</Text> deals everyone a deck of your
          most overdue recipes. {IS_WEB ? 'Everyone votes from their own device' : 'Swipe right for yes, left for no'} — matches
          are shown when you all agree.
        </Note>
      </Section>

      <Section icon="book-open-variant" title="Your recipe book">
        <Line>Pin a recipe to keep it at the top.</Line>
        <Line>Tap a note to edit it, any time.</Line>
        <Line>Add photos of the dish, or of a page from a cookbook.</Line>
        {IS_WEB ? (
          <Line>
            Open a recipe to read its ingredients and method pulled straight from the site —
            and set how many people you&apos;re feeding to rescale the amounts.
          </Line>
        ) : (
          <Line>Open a recipe to read its ingredients and method, rescaled for however many you&apos;re feeding.</Line>
        )}
      </Section>

      <Section icon="calendar-month-outline" title="Keeping track">
        <Text style={styles.body}>
          Every time you confirm you&apos;ve cooked something it&apos;s recorded, so the calendar
          shows what you made and when — and the suggestions get better the more you use it.
        </Text>
        <Note icon="cart-outline">
          Building a shopping list? Open a recipe, set the servings, then{' '}
          <Text style={styles.strong}>Add to list</Text> — the amounts follow.
        </Note>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 },

  lead: { color: INK, fontSize: 16, lineHeight: 25, marginBottom: 24 },
  leadStrong: { fontWeight: '800', color: BROWN },

  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: YELLOW,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { color: ORANGE, fontSize: 17, fontWeight: '800' },
  // Indented to line up under the section title, with a rule tying the block
  // to its heading.
  sectionBody: {
    paddingLeft: 14, marginLeft: 15,
    borderLeftWidth: 2, borderLeftColor: 'rgba(90,66,48,0.14)',
  },

  body: { color: INK, fontSize: 15, lineHeight: 23 },
  strong: { fontWeight: '800', color: BROWN },

  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, marginTop: 9 },
  lineText: { flex: 1, color: INK, fontSize: 15, lineHeight: 23 },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: YELLOW, borderRadius: 10, padding: 13, marginTop: 12,
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, color: BROWN, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
});
