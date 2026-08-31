// Desktop web layout for Cook-IT.
//
// The native screen (AppContent in App.js) is built for a portrait phone: a
// single centred column of full-width buttons, with everything else behind
// modal dialogs. Rendered in a browser that reads as a ported phone app, so the
// web build gets its own screen instead - a nav bar, a hero with the primary
// action, and a responsive recipe grid that actually uses horizontal space.
//
// This is a presentation layer only. Every read and write goes through the same
// src/utils/storage.js functions the native screen uses, so the two stay in sync
// through the same AsyncStorage keys and the same Drive backup. No recipe logic
// is duplicated here - including the suggestion algorithm, which deliberately
// mirrors handleChooseRecipe() in App.js (random pick, skip names already shown
// this session, give up after 10 attempts and reset).
//
// Colours are the app's existing theme values, unchanged - see src/theme/webPalette.js.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  loadRecipes, addRecipe, deleteRecipe, updateRecipe,
  getPinnedRecipes, togglePinnedRecipe,
  getCookCounts, incrementCookCount,
  getLastCookedDates, setCookedStatus,
} from '../utils/storage';
import googleDriveService from '../services/googleDriveService';
import excelService from '../services/excelService';
import syncService from '../services/syncService';
import { BROWN, ORANGE, YELLOW, SAND, CREAM, NAVY, ERROR, PAGE_BG, INK, MUTED } from '../theme/webPalette';

const CONTENT_MAX = 1180;

// --- temporary diagnostic -------------------------------------------------
// Several modules in the sync chain (excelService.initialize, syncService's
// lazy-loading Proxy, googleDriveService.initialize) catch their own errors and
// report only a boolean or a generic message, logging the real cause to the
// console. That makes a failure impossible to diagnose from the UI alone.
//
// This tees console.error into a small ring buffer so the most recent underlying
// error can be shown in the banner alongside the generic message. Remove once
// the web sync path is confirmed working - it is a debugging aid, not a feature.
const errorLog = [];
if (typeof console !== 'undefined' && !console.__cookitTee) {
  const original = console.error;
  console.error = (...args) => {
    try {
      errorLog.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(' '));
      if (errorLog.length > 10) errorLog.shift();
    } catch (_e) { /* never let logging break the app */ }
    original.apply(console, args);
  };
  console.__cookitTee = true;
}

function lastConsoleError() {
  return errorLog.length ? errorLog[errorLog.length - 1] : '';
}

// --- small building blocks ------------------------------------------------

// Pressable with a hover state, since the desktop layout leans on hover
// affordances that the phone screen has no need for.
function Hoverable({ children, style, hoverStyle, ...props }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[style, hovered && hoverStyle]}
      {...props}
    >
      {typeof children === 'function' ? children({ hovered }) : children}
    </Pressable>
  );
}

function Button({ label, icon, onPress, kind = 'primary', disabled, style }) {
  const palette = {
    primary: { bg: ORANGE, fg: '#fff', hover: '#c25c2f' },
    secondary: { bg: BROWN, fg: '#fff', hover: '#6d5140' },
    ghost: { bg: 'transparent', fg: INK, hover: 'rgba(90,66,48,0.10)' },
    danger: { bg: ERROR, fg: '#fff', hover: '#b52b2b' },
  }[kind];

  return (
    <Hoverable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: palette.bg },
        kind === 'ghost' && styles.btnGhost,
        disabled && styles.btnDisabled,
        style,
      ]}
      hoverStyle={!disabled && { backgroundColor: palette.hover }}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[styles.btnLabel, { color: palette.fg }]}>{label}</Text>
    </Hoverable>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, autoFocus }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        multiline={multiline}
        autoFocus={autoFocus}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function Sheet({ visible, onClose, title, children, footer, width = 520 }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop clicks inside the sheet from closing it. */}
        <Pressable style={[styles.sheet, { maxWidth: width }]} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Hoverable onPress={onClose} style={styles.iconBtn} hoverStyle={styles.iconBtnHover}>
              <MaterialCommunityIcons name="close" size={20} color={CREAM} />
            </Hoverable>
          </View>
          <View style={styles.sheetBody}>{children}</View>
          {footer ? <View style={styles.sheetFoot}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- screen ---------------------------------------------------------------

export default function WebHome() {
  const { width } = useWindowDimensions();
  const columns = width >= 1180 ? 3 : width >= 820 ? 2 : 1;
  const narrow = width < 720;

  const [recipes, setRecipes] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [cookCounts, setCookCounts] = useState({});
  const [lastCooked, setLastCooked] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [suggestion, setSuggestion] = useState(null);
  const [seen, setSeen] = useState(() => new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', url: '', comment: '' });
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const [driveState, setDriveState] = useState({ connected: false, busy: false, message: '' });

  const refresh = useCallback(async () => {
    const [list, pins, counts, dates] = await Promise.all([
      loadRecipes(), getPinnedRecipes(), getCookCounts(), getLastCookedDates(),
    ]);
    setRecipes(list);
    setPinned(pins);
    setCookCounts(counts);
    setLastCooked(dates);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      try {
        await googleDriveService.initialize();
        setDriveState(s => ({ ...s, connected: googleDriveService.isAuthenticated() }));
      } catch (_error) {
        // Drive is a background backup; the app is fully usable without it.
      }
      setLoading(false);
    })();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? recipes.filter(r =>
          r.name?.toLowerCase().includes(q) || r.comment?.toLowerCase().includes(q))
      : recipes;
    // Pinned first, then alphabetical - the grid has no other ordering cue.
    return [...filtered].sort((a, b) => {
      const ap = pinned.includes(a.name) ? 0 : 1;
      const bp = pinned.includes(b.name) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [recipes, query, pinned]);

  // Mirrors handleChooseRecipe() in App.js: random pick that avoids repeating a
  // name already suggested this session, giving up and resetting after 10 tries.
  const suggest = useCallback(() => {
    if (recipes.length === 0) return;
    let next = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = recipes[Math.floor(Math.random() * recipes.length)];
      if (candidate && !seen.has(candidate.name)) { next = candidate; break; }
    }
    if (next) {
      setSeen(prev => new Set([...prev, next.name]));
    } else {
      next = recipes[Math.floor(Math.random() * recipes.length)];
      setSeen(new Set(next ? [next.name] : []));
    }
    setSuggestion(next);
  }, [recipes, seen]);

  const openUrl = (url) => {
    if (!url) return;
    // noopener/noreferrer: the target page should get no handle on this window.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCook = async (recipe) => {
    openUrl(recipe.url);
    await setCookedStatus(recipe.name, true);
    await incrementCookCount(recipe.name);
    await refresh();
  };

  const handleAdd = async () => {
    const name = draft.name.trim();
    if (!name) return;
    await addRecipe({ name, url: draft.url.trim(), comment: draft.comment.trim() });
    setDraft({ name: '', url: '', comment: '' });
    setAddOpen(false);
    await refresh();
  };

  const handleDelete = async (recipe) => {
    await deleteRecipe(recipe.name);
    setConfirm(null);
    if (suggestion?.name === recipe.name) setSuggestion(null);
    await refresh();
  };

  const handleSaveComment = async () => {
    if (!editing) return;
    await updateRecipe(editing.name, { comment: editText.trim() });
    setEditing(null);
    await refresh();
  };

  const handlePin = async (recipe) => {
    await togglePinnedRecipe(recipe.name);
    setPinned(await getPinnedRecipes());
  };

  const handleDrive = async () => {
    setDriveState(s => ({ ...s, busy: true, message: '' }));
    try {
      if (!googleDriveService.isAuthenticated()) {
        await googleDriveService.authenticate();
      }

      // syncService's default export is a Proxy that lazily builds the real
      // service and, on any failure, reports the generic "Sync service failed to
      // initialize" while logging the actual cause to the console. Probe the two
      // services it depends on first so the specific failure reaches the UI.
      if (!(await excelService.initialize())) {
        setDriveState({
          connected: googleDriveService.isAuthenticated(),
          busy: false,
          message: `Excel service failed to initialize. ${lastConsoleError() || ''}`.trim(),
        });
        return;
      }

      // Both entry points report failure by RETURNING { success: false, message }
      // rather than throwing, so the result has to be inspected - otherwise a
      // failed sync silently renders as a successful one and the reason is lost.
      const result = googleDriveService.isAuthenticated() && driveState.connected
        ? await syncService.performExcelSync()
        : await syncService.initializeSync();

      await refresh();

      if (result && result.success === false) {
        const underlying = lastConsoleError();
        setDriveState({
          connected: googleDriveService.isAuthenticated(),
          busy: false,
          message: underlying
            ? `${result.message || 'Sync failed'} — ${underlying}`
            : (result.message || 'Sync failed'),
        });
        return;
      }

      const count = (await loadRecipes()).length;
      setDriveState({
        connected: true,
        busy: false,
        message: `Synced — ${count} recipe${count === 1 ? '' : 's'} in your book`,
      });
    } catch (error) {
      setDriveState({
        connected: googleDriveService.isAuthenticated(),
        busy: false,
        message: error?.message || 'Google Drive failed',
      });
    }
  };

  const cookedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return Object.values(lastCooked).filter(d => new Date(d).getTime() >= weekAgo).length;
  }, [lastCooked]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={YELLOW} />
        <Text style={styles.loadingText}>Loading your recipe book…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.rootContent}>
      {/* --- nav ------------------------------------------------------- */}
      <View style={styles.nav}>
        <View style={[styles.navInner, { maxWidth: CONTENT_MAX }]}>
          <View style={styles.brand}>
            <MaterialCommunityIcons name="chef-hat" size={30} color={YELLOW} />
            <Text style={styles.brandName}>Cook<Text style={{ color: YELLOW }}>-IT</Text></Text>
          </View>
          <View style={styles.navRight}>
            <Hoverable
              onPress={handleDrive}
              style={[styles.chip, driveState.connected && styles.chipOn]}
              hoverStyle={styles.chipHover}
            >
              {driveState.busy
                ? <ActivityIndicator size="small" color={CREAM} />
                : <MaterialCommunityIcons
                    name={driveState.connected ? 'cloud-check' : 'cloud-off-outline'}
                    size={18}
                    color={driveState.connected ? YELLOW : CREAM}
                  />}
              <Text style={styles.chipText}>
                {driveState.connected ? 'Drive synced' : 'Connect Drive'}
              </Text>
            </Hoverable>
          </View>
        </View>
      </View>

      {driveState.message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{driveState.message}</Text>
        </View>
      ) : null}

      {/* --- hero ------------------------------------------------------ */}
      <View style={styles.hero}>
        <View style={[styles.heroInner, { maxWidth: CONTENT_MAX }, narrow && styles.heroNarrow]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>YOUR RECIPE BOOK</Text>
            <Text style={[styles.heroTitle, narrow && { fontSize: 40 }]}>
              What&apos;s for dinner?
            </Text>
            <Text style={styles.heroSub}>
              {recipes.length === 0
                ? 'Add a few recipes and let Cook-IT pick for you.'
                : `${recipes.length} recipe${recipes.length === 1 ? '' : 's'} to choose from. Let chance decide.`}
            </Text>
            <View style={styles.heroActions}>
              <Button
                label="Choose a recipe"
                icon="shuffle-variant"
                onPress={suggest}
                disabled={recipes.length === 0}
                style={styles.heroPrimary}
              />
              <Button label="Add recipe" icon="plus" kind="secondary" onPress={() => setAddOpen(true)} />
            </View>
          </View>

          {/* Suggestion panel doubles as the hero's visual weight on desktop. */}
          <View style={styles.heroPanel}>
            {suggestion ? (
              <>
                <Text style={styles.panelKicker}>TONIGHT&apos;S PICK</Text>
                <Text style={styles.panelTitle} numberOfLines={3}>{suggestion.name}</Text>
                {suggestion.comment ? (
                  <Text style={styles.panelNote} numberOfLines={4}>{suggestion.comment}</Text>
                ) : null}
                <View style={styles.panelActions}>
                  <Button label="Cook it" icon="silverware-fork-knife" onPress={() => handleCook(suggestion)} />
                  <Button label="Next" icon="arrow-right" kind="secondary" onPress={suggest} />
                </View>
              </>
            ) : (
              <View style={styles.panelEmpty}>
                <MaterialCommunityIcons name="silverware-variant" size={52} color={MUTED} />
                <Text style={styles.panelEmptyText}>
                  Hit “Choose a recipe” and Cook-IT will pick something you haven&apos;t seen yet.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* --- stats ----------------------------------------------------- */}
      <View style={[styles.stats, { maxWidth: CONTENT_MAX }]}>
        {[
          { icon: 'book-open-variant', value: recipes.length, label: 'recipes' },
          { icon: 'pin', value: pinned.length, label: 'pinned' },
          { icon: 'fire', value: cookedThisWeek, label: 'cooked this week' },
        ].map(s => (
          <View key={s.label} style={styles.stat}>
            <MaterialCommunityIcons name={s.icon} size={22} color={ORANGE} />
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* --- library --------------------------------------------------- */}
      <View style={[styles.section, { maxWidth: CONTENT_MAX }]}>
        <View style={[styles.sectionHead, narrow && styles.sectionHeadNarrow]}>
          <Text style={styles.sectionTitle}>Recipe library</Text>
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={18} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search recipes…"
              placeholderTextColor={MUTED}
              style={styles.searchInput}
            />
          </View>
        </View>

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="notebook-outline" size={44} color={MUTED} />
            <Text style={styles.emptyText}>
              {recipes.length === 0 ? 'No recipes yet.' : 'Nothing matches that search.'}
            </Text>
            {recipes.length === 0 ? (
              <Button label="Add your first recipe" icon="plus" onPress={() => setAddOpen(true)} />
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {visible.map(recipe => {
              const isPinned = pinned.includes(recipe.name);
              const count = cookCounts[recipe.name] || 0;
              return (
                <View
                  key={recipe.name}
                  style={[styles.card, { width: `${100 / columns}%` }]}
                >
                  <View style={styles.cardInner}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{recipe.name}</Text>
                      <Hoverable
                        onPress={() => handlePin(recipe)}
                        style={styles.cardIcon}
                        hoverStyle={styles.cardIconHover}
                      >
                        <MaterialCommunityIcons
                          name={isPinned ? 'pin' : 'pin-outline'}
                          size={18}
                          color={isPinned ? ORANGE : MUTED}
                        />
                      </Hoverable>
                    </View>

                    <Pressable
                      onPress={() => { setEditing(recipe); setEditText(recipe.comment || ''); }}
                      style={styles.cardNoteWrap}
                    >
                      <Text style={[styles.cardNote, !recipe.comment && styles.cardNoteEmpty]} numberOfLines={3}>
                        {recipe.comment || 'Add a note…'}
                      </Text>
                    </Pressable>

                    <View style={styles.cardMeta}>
                      {count > 0 ? (
                        <View style={styles.badge}>
                          <MaterialCommunityIcons name="fire" size={13} color={BROWN} />
                          <Text style={styles.badgeText}>cooked {count}×</Text>
                        </View>
                      ) : <View />}
                    </View>

                    <View style={styles.cardActions}>
                      <Button
                        label="Cook it"
                        icon="silverware-fork-knife"
                        onPress={() => handleCook(recipe)}
                        style={styles.cardBtn}
                      />
                      {recipe.url ? (
                        <Hoverable
                          onPress={() => openUrl(recipe.url)}
                          style={styles.cardIcon}
                          hoverStyle={styles.cardIconHover}
                        >
                          <MaterialCommunityIcons name="open-in-new" size={18} color={NAVY} />
                        </Hoverable>
                      ) : null}
                      <Hoverable
                        onPress={() => setConfirm(recipe)}
                        style={styles.cardIcon}
                        hoverStyle={styles.cardIconHover}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={ERROR} />
                      </Hoverable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Cook-IT — recipes stay on this device and sync to your own Google Drive.
        </Text>
      </View>

      {/* --- modals ---------------------------------------------------- */}
      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a recipe"
        footer={
          <>
            <Button label="Cancel" kind="ghost" onPress={() => setAddOpen(false)} />
            <Button label="Add recipe" icon="plus" onPress={handleAdd} disabled={!draft.name.trim()} />
          </>
        }
      >
        <Field label="Name" value={draft.name} onChangeText={v => setDraft({ ...draft, name: v })} placeholder="Carbonara" autoFocus />
        <Field label="Link" value={draft.url} onChangeText={v => setDraft({ ...draft, url: v })} placeholder="https://…" />
        <Field label="Note" value={draft.comment} onChangeText={v => setDraft({ ...draft, comment: v })} placeholder="Needs guanciale" multiline />
      </Sheet>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name || ''}
        footer={
          <>
            <Button label="Cancel" kind="ghost" onPress={() => setEditing(null)} />
            <Button label="Save note" icon="check" onPress={handleSaveComment} />
          </>
        }
      >
        <Field label="Note" value={editText} onChangeText={setEditText} placeholder="Add a note…" multiline autoFocus />
      </Sheet>

      <Sheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete recipe"
        width={420}
        footer={
          <>
            <Button label="Cancel" kind="ghost" onPress={() => setConfirm(null)} />
            <Button label="Delete" icon="trash-can-outline" kind="danger" onPress={() => handleDelete(confirm)} />
          </>
        }
      >
        <Text style={styles.confirmText}>
          Remove “{confirm?.name}” from your recipe book? This cannot be undone.
        </Text>
      </Sheet>
    </ScrollView>
  );
}

const card = {
  backgroundColor: CREAM,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(90,66,48,0.14)',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SAND },
  rootContent: { alignItems: 'center', paddingBottom: 0 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG, gap: 14 },
  loadingText: { color: CREAM, fontSize: 16 },

  // nav
  nav: { width: '100%', backgroundColor: PAGE_BG, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center' },
  navInner: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { color: CREAM, fontSize: 24, fontWeight: '800', letterSpacing: 0.4 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(247,240,226,0.28)',
  },
  chipOn: { borderColor: YELLOW },
  chipHover: { backgroundColor: 'rgba(247,240,226,0.12)' },
  chipText: { color: CREAM, fontSize: 14, fontWeight: '600' },

  banner: { width: '100%', backgroundColor: YELLOW, paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  bannerText: { color: INK, fontSize: 14, fontWeight: '600' },

  // hero
  hero: { width: '100%', backgroundColor: SAND, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 48, alignItems: 'center' },
  heroInner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 48 },
  heroNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 32 },
  heroCopy: { flex: 1, minWidth: 280 },
  heroKicker: { color: ORANGE, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  heroTitle: { color: BROWN, fontSize: 54, fontWeight: '800', lineHeight: 60, marginBottom: 14 },
  heroSub: { color: INK, fontSize: 17, lineHeight: 26, marginBottom: 28, maxWidth: 460 },
  heroActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  heroPrimary: { paddingHorizontal: 26, paddingVertical: 15 },

  heroPanel: {
    flex: 1, minWidth: 300, minHeight: 260, padding: 28, justifyContent: 'center',
    ...card, backgroundColor: '#fffdf6',
  },
  panelKicker: { color: MUTED, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  panelTitle: { color: BROWN, fontSize: 30, fontWeight: '800', lineHeight: 36, marginBottom: 10 },
  panelNote: { color: INK, fontSize: 15, lineHeight: 23, marginBottom: 22 },
  panelActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  panelEmpty: { alignItems: 'center', gap: 14 },
  panelEmptyText: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

  // stats
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 24, marginBottom: 40 },
  stat: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, ...card },
  statValue: { color: BROWN, fontSize: 24, fontWeight: '800' },
  statLabel: { color: MUTED, fontSize: 14 },

  // library
  section: { width: '100%', paddingHorizontal: 24, marginBottom: 56 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 16 },
  sectionHeadNarrow: { flexDirection: 'column', alignItems: 'stretch' },
  sectionTitle: { color: BROWN, fontSize: 26, fontWeight: '800' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 240,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    backgroundColor: CREAM, borderWidth: 1, borderColor: 'rgba(90,66,48,0.18)',
  },
  searchInput: { flex: 1, color: INK, fontSize: 15, outlineStyle: 'none' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  cardInner: { flex: 1, padding: 20, ...card },
  card: { padding: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  cardTitle: { flex: 1, color: BROWN, fontSize: 19, fontWeight: '700', lineHeight: 25 },
  cardNoteWrap: { marginBottom: 14, borderRadius: 8 },
  cardNote: { color: INK, fontSize: 14, lineHeight: 21, minHeight: 42 },
  cardNoteEmpty: { color: MUTED, fontStyle: 'italic' },
  cardMeta: { flexDirection: 'row', minHeight: 24, marginBottom: 12 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: YELLOW,
  },
  badgeText: { color: BROWN, fontSize: 12, fontWeight: '700' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardBtn: { flex: 1 },
  cardIcon: { padding: 9, borderRadius: 8 },
  cardIconHover: { backgroundColor: 'rgba(90,66,48,0.10)' },

  empty: { alignItems: 'center', gap: 14, paddingVertical: 60, ...card },
  emptyText: { color: MUTED, fontSize: 16 },

  footer: { width: '100%', backgroundColor: PAGE_BG, paddingVertical: 26, alignItems: 'center', paddingHorizontal: 24 },
  footerText: { color: 'rgba(247,240,226,0.65)', fontSize: 13, textAlign: 'center' },

  // buttons
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10,
  },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(90,66,48,0.25)' },
  btnDisabled: { opacity: 0.45 },
  btnLabel: { fontSize: 15, fontWeight: '700' },

  // sheets
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: { width: '100%', borderRadius: 16, backgroundColor: CREAM, overflow: 'hidden' },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BROWN, paddingHorizontal: 20, paddingVertical: 15,
  },
  sheetTitle: { color: CREAM, fontSize: 19, fontWeight: '800', flex: 1 },
  iconBtn: { padding: 6, borderRadius: 8 },
  iconBtnHover: { backgroundColor: 'rgba(247,240,226,0.16)' },
  sheetBody: { padding: 20, gap: 4 },
  sheetFoot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 20, paddingTop: 4 },
  confirmText: { color: INK, fontSize: 15, lineHeight: 23 },

  field: { marginBottom: 14 },
  fieldLabel: { color: BROWN, fontSize: 13, fontWeight: '700', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.22)', borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: INK,
    backgroundColor: '#fffdf6', outlineStyle: 'none',
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
});
