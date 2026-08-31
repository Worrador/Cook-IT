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
  ActivityIndicator, StyleSheet, useWindowDimensions, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Portal, Dialog as PaperDialog } from 'react-native-paper';
import {
  loadRecipes, addRecipe, deleteRecipe, updateRecipe,
  getPinnedRecipes, togglePinnedRecipe,
  getCookCounts,
  getLastCookedDates, setCookedStatus,
} from '../utils/storage';
import googleDriveService from '../services/googleDriveService';
import excelService from '../services/excelService';
import syncService from '../services/syncService';
import { pickDriveFile, preloadPicker, XLSX_MIME } from '../services/drivePicker';
import { isPickerConfigured } from '../config/webConfig';
import recipeImageService from '../services/recipeImageService';
import { useImageUrl, releaseImageUrl } from '../services/imageDisplay';
import { getOgImage, getFaviconUrl, getDomain, getPreview, formatDuration } from '../services/linkPreview';
import HelpDialog from '../components/HelpDialog';
import BuyCoffeeDialog from '../components/BuyCoffeeDialog';
import VoteSession from './VoteSession';
import CookCalendar from './CookCalendar';
import { pickWeighted } from '../services/suggestion';
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

// Human phrasing for how stale a recipe is, so the suggestion can explain itself
// rather than looking arbitrary.
function describeAge(isoDate) {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (!Number.isFinite(days)) return 'a while ago';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
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

// Renders one stored image. The URL resolves asynchronously (on web the bytes
// have to be pulled out of OPFS and wrapped in a blob URL), so a placeholder
// holds the layout until it arrives.
function Photo({ imageRef, style, onPress }) {
  const url = useImageUrl(imageRef);
  const content = url
    ? <Image source={{ uri: url }} style={styles.photoImg} resizeMode="cover" />
    : <View style={styles.photoPending}><ActivityIndicator size="small" color={MUTED} /></View>;

  if (!onPress) return <View style={[styles.photo, style]}>{content}</View>;
  return (
    <Hoverable onPress={onPress} style={[styles.photo, style]} hoverStyle={styles.photoHover}>
      {content}
    </Hoverable>
  );
}

// Shown in place of a photo when a recipe has only a link. Uses the site's
// og:image when a preview proxy is configured, otherwise a favicon-and-domain
// card - see linkPreview.js for why a browser can't scrape og:image unaided.
function LinkPreview({ url, style, onPress }) {
  const [ogImage, setOgImage] = useState(null);
  const domain = getDomain(url);
  const favicon = getFaviconUrl(url);

  useEffect(() => {
    let cancelled = false;
    getOgImage(url).then(image => { if (!cancelled) setOgImage(image); });
    return () => { cancelled = true; };
  }, [url]);

  const body = ogImage
    ? <Image source={{ uri: ogImage }} style={styles.photoImg} resizeMode="cover" />
    : (
      <View style={styles.linkFallback}>
        {favicon ? <Image source={{ uri: favicon }} style={styles.linkFavicon} /> : null}
        <Text style={styles.linkDomain} numberOfLines={1}>{domain || 'recipe link'}</Text>
      </View>
    );

  return (
    <Hoverable onPress={onPress} style={[styles.photo, style]} hoverStyle={styles.photoHover}>
      {body}
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
  const [gallery, setGallery] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cookConfirm, setCookConfirm] = useState(null);
  const [recipeView, setRecipeView] = useState(null);
  const [recipeData, setRecipeData] = useState({ loading: false, data: null });
  const [showHelp, setShowHelp] = useState(false);
  const [showCoffee, setShowCoffee] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

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
      // Warm the Picker scripts now so the click handler doesn't await a network
      // fetch, which would cost the user-activation needed to open its window.
      preloadPicker().catch(() => {});
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

  // History-weighted suggestion.
  //
  // App.js picks uniformly at random and only avoids repeating a name within the
  // session, so something cooked yesterday is as likely as something untouched
  // for a year. The original desktop app did weight by recency (scores 0-105,
  // decayed 5 per cook); that was lost in the mobile rewrite. This restores the
  // idea in a simpler form: a recipe's weight is how long it has been since it
  // was last cooked, so long-neglected recipes surface more often.
  //
  // Never-cooked recipes get the highest weight of all - they are the ones the
  // user most plausibly wants reminding of.
  const suggest = useCallback(() => {
    if (recipes.length === 0) return;

    // Candidates exclude anything already shown this session; when everything
    // has been seen, the pool resets rather than looping forever.
    let pool = recipes.filter(r => !seen.has(r.name));
    let resetting = false;
    if (pool.length === 0) {
      pool = recipes;
      resetting = true;
    }

    const next = pickWeighted(pool, lastCooked);
    if (!next) return;

    if (resetting) {
      setSeen(new Set([next.name]));
    } else {
      setSeen(prev => new Set([...prev, next.name]));
    }
    setSuggestion(next);
  }, [recipes, seen, lastCooked]);

  const openUrl = (url) => {
    if (!url) return;
    // noopener/noreferrer: the target page should get no handle on this window.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // "Cook it" opens the recipe and then asks for confirmation, rather than
  // recording the cook straight away - the user hasn't cooked anything yet at
  // the moment they click. Confirming is what marks it.
  //
  // NOTE: setCookedStatus() already increments the cook count internally, with a
  // 3-day guard so re-cooking the same thing twice in a week doesn't inflate the
  // number. Calling incrementCookCount() alongside it double-counts and bypasses
  // that guard - which is exactly the bug that made one click read as "cooked 2x".
  const handleCook = (recipe) => {
    openUrl(recipe.url);
    setCookConfirm(recipe);
  };

  const confirmCooked = async () => {
    const recipe = cookConfirm;
    if (!recipe) return;
    await setCookedStatus(recipe.name, true);
    setCookConfirm(null);
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

  // Photos go through the same recipeImageService the phone uses: pick ->
  // resize/compress -> save locally -> background Drive upload. Only the display
  // step differs on web (see imageDisplay.js).
  const handleAddPhoto = async (recipe) => {
    setPhotoBusy(true);
    try {
      const added = await recipeImageService.pickFromLibrary();
      if (added.length) {
        const images = [...(recipe.images || []), ...added];
        await updateRecipe(recipe.name, { images });
        setGallery(g => (g && g.name === recipe.name ? { ...g, images } : g));
        await refresh();
      }
    } catch (error) {
      setDriveState(s => ({ ...s, message: error?.message || 'Could not add the photo' }));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleDeletePhoto = async (recipe, imageRef) => {
    await recipeImageService.deleteImage(imageRef);
    releaseImageUrl(imageRef.id);
    const images = (recipe.images || []).filter(img => img.id !== imageRef.id);
    await updateRecipe(recipe.name, { images });
    setGallery(g => (g && g.name === recipe.name ? { ...g, images } : g));
    await refresh();
  };

  // Pull the recipe's ingredients and steps from the linked page. Works for any
  // site that publishes schema.org/Recipe JSON-LD, which most recipe sites do
  // because it's what drives Google's recipe cards. Sites without it show just
  // the link, which is the pre-existing behaviour.
  const openRecipe = async (recipe) => {
    setRecipeView(recipe);
    setRecipeData({ loading: true, data: null });
    const data = await getPreview(recipe.url);
    setRecipeData({ loading: false, data });
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

  const pinnedVisible = useMemo(
    () => visible.filter(r => pinned.includes(r.name)),
    [visible, pinned]
  );
  const otherVisible = useMemo(
    () => visible.filter(r => !pinned.includes(r.name)),
    [visible, pinned]
  );

  // Attach a specific Drive file, bypassing the hardcoded CookIT_Recipes.xlsx
  // name lookup in googleDriveService.getDriveFileId() - once an ID is stored it
  // is returned before any name search happens.
  const handleChooseFile = async () => {
    setDriveState(s => ({ ...s, busy: true, message: '' }));
    try {
      if (!googleDriveService.isAuthenticated()) {
        await googleDriveService.authenticate();
      }
      const file = await pickDriveFile(googleDriveService.accessToken);
      if (!file) {
        setDriveState(s => ({ ...s, busy: false, message: '' }));
        return;
      }
      if (file.mimeType !== XLSX_MIME) {
        setDriveState(s => ({
          ...s,
          busy: false,
          message: `“${file.name}” is not an .xlsx workbook, so Cook-IT can't read it.`,
        }));
        return;
      }

      await googleDriveService.setDriveFileId(file.id);
      const result = await syncService.performExcelSync();
      await refresh();

      if (result && result.success === false) {
        setDriveState({
          connected: googleDriveService.isAuthenticated(),
          busy: false,
          message: `${result.message || 'Sync failed'} — ${lastConsoleError()}`.trim(),
        });
        return;
      }
      const count = (await loadRecipes()).length;
      setDriveState({
        connected: true,
        busy: false,
        message: `Linked “${file.name}” — ${count} recipe${count === 1 ? '' : 's'} loaded`,
      });
    } catch (error) {
      setDriveState(s => ({ ...s, busy: false, message: error?.message || 'Could not open the Drive picker' }));
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
            {/* Icon actions are grouped and separated from the Drive chip: they
                are app-level utilities, the chip is account state, and mixing
                them at equal weight made the bar read as a row of loose icons. */}
            <View style={styles.navGroup}>
              <Hoverable onPress={() => setCalendarOpen(true)} style={styles.navIcon} hoverStyle={styles.navIconHover}>
                <MaterialCommunityIcons name="calendar-month-outline" size={20} color={CREAM} />
              </Hoverable>
              <Hoverable onPress={() => setVoteOpen(true)} style={styles.navIcon} hoverStyle={styles.navIconHover}>
                <MaterialCommunityIcons name="vote-outline" size={20} color={CREAM} />
              </Hoverable>
              <Hoverable onPress={() => setShowHelp(true)} style={styles.navIcon} hoverStyle={styles.navIconHover}>
                <MaterialCommunityIcons name="help-circle-outline" size={20} color={CREAM} />
              </Hoverable>
              <Hoverable onPress={() => setShowCoffee(true)} style={styles.navIcon} hoverStyle={styles.navIconHover}>
                <MaterialCommunityIcons name="coffee-outline" size={20} color={CREAM} />
              </Hoverable>
            </View>
            <View style={styles.navDivider} />
            {/* Hidden entirely until a Picker API key is configured - a button
                that can only ever explain why it doesn't work is just noise. */}
            {isPickerConfigured() ? (
              <Hoverable
                onPress={handleChooseFile}
                style={styles.chip}
                hoverStyle={styles.chipHover}
              >
                <MaterialCommunityIcons name="file-find-outline" size={18} color={CREAM} />
                <Text style={styles.chipText}>Choose Drive file</Text>
              </Hoverable>
            ) : null}
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
              What shall we cook?
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
              {/* Not "Start a vote": this is also how you rejoin or check an
                  ongoing one, and a label that only promises starting hides that. */}
              <Button
                label="Vote"
                icon="vote-outline"
                kind="ghost"
                onPress={() => setVoteOpen(true)}
                disabled={recipes.length < 2}
              />
            </View>
          </View>

          {/* Suggestion panel doubles as the hero's visual weight on desktop. */}
          <View style={styles.heroPanel}>
            {suggestion ? (
              <>
                {suggestion.images?.length ? (
                  <Photo imageRef={suggestion.images[0]} style={styles.panelPhoto} onPress={() => setGallery(suggestion)} />
                ) : suggestion.url ? (
                  <LinkPreview url={suggestion.url} style={styles.panelPhoto} onPress={() => openRecipe(suggestion)} />
                ) : null}
                <Text style={styles.panelKicker}>
                  {lastCooked[suggestion.name]
                    ? `LAST COOKED ${describeAge(lastCooked[suggestion.name])}`.toUpperCase()
                    : 'NEVER COOKED YET'}
                </Text>
                <Text style={styles.panelTitle} numberOfLines={2}>{suggestion.name}</Text>
                {suggestion.comment ? (
                  <Text style={styles.panelNote} numberOfLines={2}>{suggestion.comment}</Text>
                ) : null}
                <View style={styles.panelActions}>
                  <Button label="Cook it" icon="silverware-fork-knife" onPress={() => handleCook(suggestion)} />
                  {suggestion.url ? (
                    <Button label="Recipe" icon="text-box-outline" kind="secondary" onPress={() => openRecipe(suggestion)} />
                  ) : null}
                  <Button label="Next" icon="arrow-right" kind="ghost" onPress={suggest} />
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
          <>
            {/* Pinned recipes get their own labelled group. Previously they were
                merely sorted to the front with a slightly different pin icon,
                which is not a findable affordance - there was no way to tell what
                pinning had actually done. */}
            {pinnedVisible.length ? (
              <View style={styles.subHead}>
                <MaterialCommunityIcons name="pin" size={17} color={ORANGE} />
                <Text style={styles.subHeadText}>Pinned</Text>
                <Text style={styles.subHeadCount}>{pinnedVisible.length}</Text>
              </View>
            ) : null}

            {[
              { key: 'pinned', items: pinnedVisible },
              { key: 'rest', items: otherVisible, heading: pinnedVisible.length ? 'Everything else' : null },
            ].map(group => (
              group.items.length ? (
                <View key={group.key}>
                  {group.heading ? (
                    <View style={styles.subHead}>
                      <MaterialCommunityIcons name="book-open-variant" size={17} color={MUTED} />
                      <Text style={styles.subHeadText}>{group.heading}</Text>
                      <Text style={styles.subHeadCount}>{group.items.length}</Text>
                    </View>
                  ) : null}
                  <View style={styles.grid}>
            {group.items.map(recipe => {
              const isPinned = pinned.includes(recipe.name);
              const count = cookCounts[recipe.name] || 0;
              return (
                <View
                  key={recipe.name}
                  style={[styles.card, { width: `${100 / columns}%` }]}
                >
                  <View style={[styles.cardInner, isPinned && styles.cardPinned]}>
                    {recipe.images?.length ? (
                      <Photo
                        imageRef={recipe.images[0]}
                        style={styles.cardPhoto}
                        onPress={() => setGallery(recipe)}
                      />
                    ) : recipe.url ? (
                      <LinkPreview
                        url={recipe.url}
                        style={styles.cardPhoto}
                        onPress={() => openUrl(recipe.url)}
                      />
                    ) : null}
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
                          onPress={() => openRecipe(recipe)}
                          style={styles.cardIcon}
                          hoverStyle={styles.cardIconHover}
                        >
                          <MaterialCommunityIcons name="text-box-outline" size={18} color={NAVY} />
                        </Hoverable>
                      ) : null}
                      <Hoverable
                        onPress={() => setGallery(recipe)}
                        style={styles.cardIcon}
                        hoverStyle={styles.cardIconHover}
                      >
                        <MaterialCommunityIcons
                          name={recipe.images?.length ? 'image-multiple' : 'camera-plus-outline'}
                          size={18}
                          color={BROWN}
                        />
                      </Hoverable>
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
                </View>
              ) : null
            ))}
          </>
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

      <CookCalendar visible={calendarOpen} onClose={() => setCalendarOpen(false)} />

      <VoteSession
        visible={voteOpen}
        onClose={() => setVoteOpen(false)}
        recipes={recipes}
        lastCooked={lastCooked}
        onCookIt={(recipe) => { setSuggestion(recipe); handleCook(recipe); }}
      />

      <Sheet
        visible={!!cookConfirm}
        onClose={() => setCookConfirm(null)}
        title="Did you cook it?"
        width={460}
        footer={
          <>
            <Button label="Not this time" kind="ghost" onPress={() => setCookConfirm(null)} />
            <Button label="Yes, I cooked it" icon="check" onPress={confirmCooked} />
          </>
        }
      >
        <Text style={styles.confirmText}>
          “{cookConfirm?.name}” is open in a new tab. Confirm once you&apos;ve actually
          cooked it and Cook-IT will record it and bump its cook count.
        </Text>
        {cookConfirm ? (
          <Hoverable
            onPress={() => handlePin(cookConfirm)}
            style={styles.pinRow}
            hoverStyle={{ backgroundColor: 'rgba(90,66,48,0.08)' }}
          >
            <MaterialCommunityIcons
              name={pinned.includes(cookConfirm.name) ? 'pin' : 'pin-outline'}
              size={20}
              color={pinned.includes(cookConfirm.name) ? ORANGE : MUTED}
            />
            <Text style={styles.pinRowText}>
              {pinned.includes(cookConfirm.name) ? 'Pinned to the top of your library' : 'Pin this recipe'}
            </Text>
          </Hoverable>
        ) : null}
      </Sheet>

      <Sheet
        visible={!!recipeView}
        onClose={() => setRecipeView(null)}
        title={recipeView?.name || ''}
        width={760}
        footer={
          <>
            <Button label="Close" kind="ghost" onPress={() => setRecipeView(null)} />
            <Button label="Open site" icon="open-in-new" kind="secondary" onPress={() => openUrl(recipeView?.url)} />
            <Button label="Cook it" icon="silverware-fork-knife" onPress={() => { setRecipeView(null); handleCook(recipeView); }} />
          </>
        }
      >
        {recipeData.loading ? (
          <View style={styles.recipeLoading}>
            <ActivityIndicator color={ORANGE} />
            <Text style={styles.galleryEmptyText}>Reading the recipe…</Text>
          </View>
        ) : recipeData.data?.ingredients?.length || recipeData.data?.steps?.length ? (
          <ScrollView style={styles.recipeScroll}>
            <View style={styles.recipeMetaRow}>
              {formatDuration(recipeData.data.totalTime) ? (
                <View style={styles.badge}>
                  <MaterialCommunityIcons name="clock-outline" size={13} color={BROWN} />
                  <Text style={styles.badgeText}>{formatDuration(recipeData.data.totalTime)}</Text>
                </View>
              ) : null}
              {recipeData.data.servings ? (
                <View style={styles.badge}>
                  <MaterialCommunityIcons name="account-group-outline" size={13} color={BROWN} />
                  <Text style={styles.badgeText}>serves {recipeData.data.servings}</Text>
                </View>
              ) : null}
            </View>

            {recipeData.data.ingredients.length ? (
              <>
                <Text style={styles.recipeHeading}>Ingredients</Text>
                {recipeData.data.ingredients.map((item, i) => (
                  <View key={i} style={styles.ingredientRow}>
                    <View style={styles.bullet} />
                    {/* selectable: an ingredient list is the one thing here
                        people genuinely want to copy (into a shopping list). */}
                    <Text selectable style={styles.ingredientText}>{item}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {recipeData.data.steps.length ? (
              <>
                <Text style={styles.recipeHeading}>Method</Text>
                {recipeData.data.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                    <Text selectable style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.galleryEmpty}>
            <MaterialCommunityIcons name="text-box-remove-outline" size={40} color={MUTED} />
            <Text style={styles.galleryEmptyText}>
              Couldn&apos;t read a recipe from this page. Not every site publishes one in a
              machine-readable form — open the site to view it.
            </Text>
          </View>
        )}
      </Sheet>

      {/* Both dialogs render their own Paper Dialog.Title/Content and have no
          `visible` prop of their own - App.js controls them by wrapping in a
          Portal + Dialog, so this mirrors that rather than inventing a new
          contract. Rendering them bare would show their content permanently. */}
      <Portal>
        <PaperDialog
          visible={showHelp}
          onDismiss={() => setShowHelp(false)}
          style={styles.paperDialog}
        >
          <HelpDialog onClose={() => setShowHelp(false)} isFirstTime={false} />
        </PaperDialog>
        <PaperDialog
          visible={showCoffee}
          onDismiss={() => setShowCoffee(false)}
          style={styles.paperDialog}
        >
          <BuyCoffeeDialog onClose={() => setShowCoffee(false)} />
        </PaperDialog>
      </Portal>

      <Sheet
        visible={!!gallery}
        onClose={() => setGallery(null)}
        title={gallery ? `Photos — ${gallery.name}` : ''}
        width={680}
        footer={
          <>
            <Button label="Close" kind="ghost" onPress={() => setGallery(null)} />
            <Button
              label={photoBusy ? 'Adding…' : 'Add photo'}
              icon="camera-plus-outline"
              onPress={() => handleAddPhoto(gallery)}
              disabled={photoBusy}
            />
          </>
        }
      >
        {gallery?.images?.length ? (
          <View style={styles.galleryGrid}>
            {gallery.images.map(img => (
              <View key={img.id} style={styles.galleryItem}>
                <Photo imageRef={img} style={styles.galleryPhoto} />
                <Hoverable
                  onPress={() => handleDeletePhoto(gallery, img)}
                  style={styles.galleryDelete}
                  hoverStyle={{ backgroundColor: ERROR }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                </Hoverable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.galleryEmpty}>
            <MaterialCommunityIcons name="image-off-outline" size={40} color={MUTED} />
            <Text style={styles.galleryEmptyText}>
              No photos yet. Add a snap of the recipe page or the finished dish.
            </Text>
          </View>
        )}
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
  // Pinned cards are visually distinct on their own, not just grouped - the
  // grouping explains where they went, this explains which ones they are.
  cardPinned: { borderColor: ORANGE, borderWidth: 2, backgroundColor: '#fffdf6' },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 14 },
  subHeadText: { color: BROWN, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  subHeadCount: {
    color: BROWN, fontSize: 12, fontWeight: '800', overflow: 'hidden',
    backgroundColor: YELLOW, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
  },
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

  // photos
  photo: { borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(90,66,48,0.10)' },
  photoHover: { opacity: 0.88 },
  photoImg: { width: '100%', height: '100%' },
  photoPending: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60 },
  cardPhoto: { width: '100%', height: 150, marginBottom: 14 },
  linkFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: SAND, borderWidth: 1, borderColor: 'rgba(90,66,48,0.10)', borderRadius: 10,
  },
  linkFavicon: { width: 40, height: 40, borderRadius: 8 },
  linkDomain: { color: MUTED, fontSize: 13, fontWeight: '700', maxWidth: '85%' },

  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  galleryItem: { width: 180, height: 140, position: 'relative' },
  galleryPhoto: { width: '100%', height: '100%' },
  galleryDelete: {
    position: 'absolute', top: 6, right: 6, padding: 7, borderRadius: 8,
    backgroundColor: 'rgba(46,34,22,0.72)',
  },
  panelPhoto: { width: '100%', height: 168, marginBottom: 16 },
  // maxHeight is load-bearing, not cosmetic: HelpDialog renders its own
  // ScrollView, but a ScrollView only scrolls inside a bounded parent. Without a
  // height limit the dialog grew past the viewport and its content became
  // unreachable - visible but unscrollable.
  paperDialog: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
    maxHeight: '85%',
    backgroundColor: CREAM,
  },
  navIcon: { padding: 9, borderRadius: 999 },
  navIconHover: { backgroundColor: 'rgba(247,240,226,0.14)' },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navDivider: { width: 1, height: 22, backgroundColor: 'rgba(247,240,226,0.20)', marginHorizontal: 6 },
  pinRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(90,66,48,0.18)',
  },
  pinRowText: { color: INK, fontSize: 14, fontWeight: '600' },

  recipeLoading: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  recipeScroll: { maxHeight: 460 },
  recipeMetaRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  recipeHeading: { color: BROWN, fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 7 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: ORANGE, marginTop: 8 },
  ingredientText: { flex: 1, color: INK, fontSize: 15, lineHeight: 22 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: YELLOW, color: BROWN,
    fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 24,
  },
  stepText: { flex: 1, color: INK, fontSize: 15, lineHeight: 23 },

  galleryEmpty: { alignItems: 'center', gap: 12, paddingVertical: 34 },
  galleryEmptyText: { color: MUTED, fontSize: 15, textAlign: 'center', maxWidth: 320, lineHeight: 22 },

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
