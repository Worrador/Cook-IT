// The parsed recipe: ingredients and method pulled from the linked page, with a
// serving-count stepper that rescales the amounts.
//
// Shared by the phone and web screens. The parsing itself happens in
// linkPreview.getPreview(), which fetches directly on native (no CORS, so no
// server) and goes via the proxy in a browser - callers here don't need to care
// which.
import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Image, ActivityIndicator, StyleSheet, Linking, TextInput,
} from 'react-native';
import DialogShell from './DialogShell';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getPreview, formatDuration } from '../services/linkPreview';
import { scaleIngredient, parseServings } from '../services/ingredientScaling';
import {
  convertIngredientToMetric, convertStepToMetric, hasImperialUnits,
} from '../services/unitConversion';
import { getUnitPreference, METRIC } from '../services/unitPreference';
import { BROWN, ORANGE, YELLOW, SAND, CREAM, PAGE_BG, INK, MUTED, ERROR } from '../theme/webPalette';

export default function RecipeViewDialog({
  visible, recipe, onClose, onAddToList, onCook, onSaveComment, onDelete, onPhotos, onCacheParsed,
}) {
  const [state, setState] = useState({ loading: false, data: null });
  const [baseServings, setBaseServings] = useState(null);
  const [servings, setServings] = useState(1);
  const [metric, setMetric] = useState(false);
  const [comment, setComment] = useState('');
  const [editingComment, setEditingComment] = useState(false);

  // Reset on every open, whether or not the recipe has a link.
  //
  // The metric toggle inside this dialog is a per-sitting override: it starts
  // from the global preference and is deliberately NOT saved, so closing and
  // reopening returns to your default. That only holds if the reset runs every
  // time - when this was folded into the fetch effect below it was skipped for
  // recipes with no URL, and the previous recipe's override (and comment) leaked
  // into the next one.
  useEffect(() => {
    let cancelled = false;
    if (!visible) return undefined;

    getUnitPreference().then(pref => { if (!cancelled) setMetric(pref === METRIC); });
    setComment(recipe?.comment || '');
    setEditingComment(false);
    return () => { cancelled = true; };
  }, [visible, recipe]);

  // Applies a parse result to the view.
  const applyData = (data) => {
    setState({ loading: false, data });
    // Start at whatever the recipe says it serves, so the amounts shown first
    // are the ones the author wrote.
    const parsed = parseServings(data?.servings);
    setBaseServings(parsed);
    setServings(parsed || 1);
  };

  useEffect(() => {
    let cancelled = false;
    if (!visible || !recipe?.url) {
      setState({ loading: false, data: null });
      setBaseServings(null);
      setServings(1);
      return undefined;
    }

    // A previously-parsed copy stored on the recipe is used immediately, with no
    // network call at all.
    //
    // This is what makes recipe reading work everywhere. Some publishers (the
    // Dotdash sites - allrecipes, seriouseats) return 403 to datacenter IPs, so
    // the web build's Pages Function cannot fetch them, while a phone can
    // because it fetches from a home connection. Caching the parse onto the
    // recipe and syncing it through the Drive workbook means whichever device
    // *could* read the page shares the result with the ones that can't.
    if (recipe.parsed?.ingredients?.length || recipe.parsed?.steps?.length) {
      applyData(recipe.parsed);
      return () => { cancelled = true; };
    }

    setState({ loading: true, data: null });
    getPreview(recipe.url).then(data => {
      if (cancelled) return;
      applyData(data);

      // Persist a successful parse so other devices - and this one, offline -
      // don't need to fetch it again. Only worth storing if it actually yielded
      // a recipe; an empty result would just cache a failure.
      if (onCacheParsed && (data?.ingredients?.length || data?.steps?.length)) {
        onCacheParsed(recipe, data);
      }
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
        // Five equal buttons in a row had no hierarchy - everything shouted.
        // Destructive and secondary actions are now quiet icons on the left;
        // the two things you actually came to do are on the right.
        <View style={styles.footRow}>
          <View style={styles.footLeft}>
            {onPhotos ? (
              <Pressable onPress={() => onPhotos(recipe)} style={styles.miniBtn} hitSlop={6}>
                <MaterialCommunityIcons
                  name={recipe?.images?.length ? 'image-multiple' : 'camera-plus-outline'}
                  size={19} color={MUTED}
                />
              </Pressable>
            ) : null}
            {recipe?.url ? (
              <Pressable onPress={() => Linking.openURL(recipe.url)} style={styles.miniBtn} hitSlop={6}>
                <MaterialCommunityIcons name="open-in-new" size={19} color={MUTED} />
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable onPress={() => onDelete(recipe)} style={styles.miniBtn} hitSlop={6}>
                <MaterialCommunityIcons name="trash-can-outline" size={19} color={ERROR} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.footRight}>
            {hasRecipe && onAddToList ? (
              <Pressable
                onPress={() => onAddToList(
                  data.ingredients.map(l => {
                    const scaled = scaleIngredient(l, factor);
                    return metric ? convertIngredientToMetric(scaled) : scaled;
                  })
                )}
                style={styles.ghostBtn}
              >
                <MaterialCommunityIcons name="cart-plus" size={16} color={BROWN} />
                <Text style={styles.ghostBtnText}>Add to list</Text>
              </Pressable>
            ) : null}
            {onCook ? (
              <Pressable onPress={() => onCook(recipe)} style={styles.primaryBtn}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Cook it</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
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

                {/* Only offered when there is actually something imperial to
                    convert, so it isn't a dead switch on a metric recipe. */}
                {hasImperialUnits(data.ingredients) ? (
                  <Pressable
                    onPress={() => setMetric(m => !m)}
                    style={[styles.unitToggle, metric && styles.unitToggleOn]}
                  >
                    <MaterialCommunityIcons
                      name="scale-balance"
                      size={14}
                      color={metric ? '#fff' : BROWN}
                    />
                    <Text style={[styles.unitToggleText, metric && { color: '#fff' }]}>
                      {metric ? 'metric' : 'to metric'}
                    </Text>
                  </Pressable>
                ) : null}

                {baseServings && servings !== baseServings ? (
                  <View style={styles.scaledBadge}>
                    <Text style={styles.badgeText}>scaled from {baseServings}</Text>
                  </View>
                ) : null}
              </View>

              {/* Your own note lives with the recipe, so it's here rather than
                  needing a separate dialog to read or change it. */}
              <View style={styles.noteBlock}>
                <View style={styles.noteHead}>
                  <MaterialCommunityIcons name="note-text-outline" size={15} color={MUTED} />
                  <Text style={styles.noteLabel}>Your note</Text>
                  {onSaveComment && !editingComment ? (
                    <Pressable onPress={() => setEditingComment(true)} hitSlop={8}>
                      <Text style={styles.noteEdit}>{comment ? 'Edit' : 'Add'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {editingComment ? (
                  <>
                    <TextInput
                      value={comment}
                      onChangeText={setComment}
                      placeholder="Adjust spice level to taste…"
                      placeholderTextColor={MUTED}
                      multiline
                      autoFocus
                      style={styles.noteInput}
                    />
                    <View style={styles.noteActions}>
                      <Pressable
                        onPress={() => { setComment(recipe.comment || ''); setEditingComment(false); }}
                        style={styles.ghostBtn}
                      >
                        <Text style={styles.ghostBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={async () => { await onSaveComment(recipe, comment); setEditingComment(false); }}
                        style={styles.primaryBtn}
                      >
                        <Text style={styles.primaryBtnText}>Save note</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.noteText, !comment && styles.notePlaceholder]}>
                    {comment || 'No note yet.'}
                  </Text>
                )}
              </View>

              {data.ingredients.length ? (
                <>
                  <Text style={styles.heading}>Ingredients</Text>
                  {data.ingredients.map((item, i) => (
                    <View key={i} style={styles.ingredientRow}>
                      <View style={styles.bullet} />
                      <Text selectable style={styles.ingredientText}>
                        {metric
                          ? convertIngredientToMetric(scaleIngredient(item, factor))
                          : scaleIngredient(item, factor)}
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
                      <Text selectable style={styles.stepBody}>{metric ? convertStepToMetric(step) : step}</Text>
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
  unitToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.28)',
  },
  unitToggleOn: { backgroundColor: BROWN, borderColor: BROWN },
  unitToggleText: { color: BROWN, fontSize: 12, fontWeight: '800' },

  // Deliberately flat. A bordered, lighter-filled box was the only raised
  // surface in the dialog, so it read as pasted on rather than part of the
  // page. A hairline rule separates it instead - same treatment as the
  // Ingredients and Method sections below.
  noteBlock: {
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(90,66,48,0.12)',
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  noteLabel: {
    flex: 1, color: MUTED, fontSize: 12, fontWeight: '800',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  noteEdit: { color: ORANGE, fontSize: 13, fontWeight: '800' },
  noteText: { color: INK, fontSize: 15, lineHeight: 22 },
  notePlaceholder: { color: MUTED, fontStyle: 'italic' },
  noteInput: {
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.22)', borderRadius: 9,
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 15, color: INK,
    backgroundColor: '#fff', minHeight: 68, textAlignVertical: 'top',
  },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 9 },
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
  footRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBtn: { padding: 9, borderRadius: 8 },
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
