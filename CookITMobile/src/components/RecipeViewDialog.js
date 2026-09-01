// The parsed recipe: ingredients and method pulled from the linked page, with a
// serving-count stepper that rescales the amounts.
//
// Shared by the phone and web screens. The parsing itself happens in
// linkPreview.getPreview(), which fetches directly on native (no CORS, so no
// server) and goes via the proxy in a browser - callers here don't need to care
// which.
import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Image, ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import DialogShell from './DialogShell';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getPreview, formatDuration } from '../services/linkPreview';
import { scaleIngredient, parseServings } from '../services/ingredientScaling';
import { BROWN, ORANGE, YELLOW, SAND, CREAM, PAGE_BG, INK, MUTED } from '../theme/webPalette';

export default function RecipeViewDialog({ visible, recipe, onClose, onAddToList, onCook }) {
  const [state, setState] = useState({ loading: false, data: null });
  const [baseServings, setBaseServings] = useState(null);
  const [servings, setServings] = useState(1);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !recipe?.url) return undefined;

    setState({ loading: true, data: null });
    getPreview(recipe.url).then(data => {
      if (cancelled) return;
      setState({ loading: false, data });
      // Start at whatever the recipe says it serves, so the amounts shown first
      // are the ones the author wrote.
      const parsed = parseServings(data?.servings);
      setBaseServings(parsed);
      setServings(parsed || 1);
    });
    return () => { cancelled = true; };
  }, [visible, recipe]);

  // 1 when there's no baseline, which makes scaleIngredient a no-op and leaves
  // the author's text untouched rather than scaling against a guess.
  const factor = baseServings ? servings / baseServings : 1;
  const data = state.data;
  const hasRecipe = Boolean(data?.ingredients?.length || data?.steps?.length);

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title={recipe?.name || ''}
      icon="text-box-outline"
      width={640}
      footer={
        <>
          {hasRecipe && onAddToList ? (
            <Pressable
              onPress={() => onAddToList(data.ingredients.map(l => scaleIngredient(l, factor)))}
              style={styles.ghostBtn}
            >
              <MaterialCommunityIcons name="cart-plus" size={16} color={BROWN} />
              <Text style={styles.ghostBtnText}>Add to list</Text>
            </Pressable>
          ) : null}
          {recipe?.url ? (
            <Pressable onPress={() => Linking.openURL(recipe.url)} style={styles.ghostBtn}>
              <MaterialCommunityIcons name="open-in-new" size={16} color={BROWN} />
              <Text style={styles.ghostBtnText}>Site</Text>
            </Pressable>
          ) : null}
          {onCook ? (
            <Pressable onPress={() => onCook(recipe)} style={styles.primaryBtn}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Cook it</Text>
            </Pressable>
          ) : null}
        </>
      }
    >
      <>
          {state.loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={ORANGE} size="large" />
              <Text style={styles.muted}>Reading the recipe…</Text>
            </View>
          ) : hasRecipe ? (
            <ScrollView style={styles.body}>
              {data.image ? (
                <Image source={{ uri: data.image }} style={styles.hero} resizeMode="cover" />
              ) : null}

              <View style={styles.metaRow}>
                {formatDuration(data.totalTime) ? (
                  <View style={styles.badge}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color={BROWN} />
                    <Text style={styles.badgeText}>{formatDuration(data.totalTime)}</Text>
                  </View>
                ) : null}

                {/* Only offered when the page published a serving count we could
                    parse - without a baseline there is nothing to scale against. */}
                {baseServings ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => setServings(s => Math.max(1, s - 1))} hitSlop={8} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="minus" size={16} color={BROWN} />
                    </Pressable>
                    <Text style={styles.stepText}>serves {servings}</Text>
                    <Pressable onPress={() => setServings(s => Math.min(99, s + 1))} hitSlop={8} style={styles.stepBtn}>
                      <MaterialCommunityIcons name="plus" size={16} color={BROWN} />
                    </Pressable>
                  </View>
                ) : null}

                {baseServings && servings !== baseServings ? (
                  <View style={styles.scaledBadge}>
                    <Text style={styles.badgeText}>scaled from {baseServings}</Text>
                  </View>
                ) : null}
              </View>

              {data.ingredients.length ? (
                <>
                  <Text style={styles.heading}>Ingredients</Text>
                  {data.ingredients.map((item, i) => (
                    <View key={i} style={styles.ingredientRow}>
                      <View style={styles.bullet} />
                      <Text selectable style={styles.ingredientText}>
                        {scaleIngredient(item, factor)}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {data.steps.length ? (
                <>
                  <Text style={styles.heading}>Method</Text>
                  {data.steps.map((step, i) => (
                    <View key={i} style={styles.stepRow}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                      <Text selectable style={styles.stepBody}>{step}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          ) : (
            <View style={styles.centered}>
              <MaterialCommunityIcons name="text-box-remove-outline" size={40} color={MUTED} />
              <Text style={styles.muted}>
                Couldn&apos;t read a recipe from this page. Not every site publishes one in a
                machine-readable form — open the site to view it.
              </Text>
            </View>
          )}

      </>
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 640, maxHeight: '90%',
    borderRadius: 16, backgroundColor: CREAM, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PAGE_BG, paddingHorizontal: 18, paddingVertical: 14, gap: 10,
  },
  headTitle: { color: CREAM, fontSize: 18, fontWeight: '800', flex: 1 },
  iconBtn: { padding: 4 },

  body: { paddingHorizontal: 18, paddingTop: 14 },
  centered: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 24 },
  muted: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  hero: { width: '100%', height: 180, borderRadius: 12, marginBottom: 14, backgroundColor: SAND },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: YELLOW,
  },
  badgeText: { color: BROWN, fontSize: 12, fontWeight: '700' },
  scaledBadge: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.28)',
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: YELLOW,
  },
  stepBtn: { padding: 3 },
  stepText: { color: BROWN, fontSize: 12, fontWeight: '800', minWidth: 62, textAlign: 'center' },

  heading: { color: BROWN, fontSize: 17, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 7 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: ORANGE, marginTop: 8 },
  ingredientText: { flex: 1, color: INK, fontSize: 15, lineHeight: 22 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: YELLOW, color: BROWN,
    fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 24,
  },
  stepBody: { flex: 1, color: INK, fontSize: 15, lineHeight: 23 },

  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, gap: 10,
  },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 13, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.25)',
  },
  ghostBtnText: { color: BROWN, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORANGE, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 9,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
