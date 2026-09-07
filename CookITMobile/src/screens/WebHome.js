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
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
  ActivityIndicator, StyleSheet, useWindowDimensions, Image, Platform,
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
import { isPickerConfigured, ADVISOR_ENABLED } from '../config/webConfig';
import recipeImageService from '../services/recipeImageService';
import { useImageUrl, releaseImageUrl } from '../services/imageDisplay';
import { getOgImage, getFaviconUrl, getDomain, getPreview, formatDuration } from '../services/linkPreview';
import HelpDialog from '../components/HelpDialog';
import BuyCoffeeDialog from '../components/BuyCoffeeDialog';
import VoteSession from './VoteSession';
import CookCalendar from './CookCalendar';
import RecipeViewDialog from '../components/RecipeViewDialog';
import DialogShell from '../components/DialogShell';
import ShoppingListDialog from '../components/ShoppingListDialog';
import { pickWeighted } from '../services/suggestion';
import { collectTags, filterRecipes } from '../services/recipeTags';
import Animated, {
  FadeInDown, FadeIn, LinearTransition,
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { scaleIngredient, parseServings } from '../services/ingredientScaling';
import { getUnitPreference, toggleUnitPreference, METRIC } from '../services/unitPreference';
import { askForAdvice, isAdvisorAvailable } from '../services/cookAdvisor';
import { adviseLocally } from '../services/localAdvisor';
import {
  getShoppingList, addRecipeToList, toggleItem,
  removeItem as removeShopItem, clearChecked, groupByRecipe,
} from '../services/shoppingList';
import { BROWN, ORANGE, YELLOW, SAND, CREAM, NAVY, ERROR, PAGE_BG, INK, MUTED } from '../theme/webPalette';
import { formatBuildStamp } from '../config/buildInfo';

// Wide enough to use a modern monitor, capped so text lines don't become
// unreadably long on an ultrawide. 1180 left ~370px of dead gutter each side at
// 1920, which made the page look like it was hiding in the middle.
const CONTENT_MAX = 1640;

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

// noopener/noreferrer: the target page should get no handle on this window.
function openUrl(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// --- small building blocks ------------------------------------------------

// A nav icon that names itself on hover. Five unlabelled glyphs in a row is a
// guessing game, and there is no room for permanent labels - a tooltip is the
// standard resolution and costs nothing until you hover.
function NavIcon({ icon, label, onPress, badge, compact }) {
  const [hovered, setHovered] = useState(false);
  return (
    <View style={styles.navIconWrap}>
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[styles.navIcon, compact && styles.navIconCompact, hovered && styles.navIconHover]}
        accessibilityLabel={label}
      >
        <MaterialCommunityIcons name={icon} size={compact ? 20 : 23} color={CREAM} />
        {badge ? <View style={styles.navDot} /> : null}
      </Pressable>
      {hovered ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
// `image` short-circuits the lookup: a recipe that has been opened once carries
// its parsed og:image, and re-fetching it per card is what made a large library
// crawl - one proxy round trip per card, every load.
function LinkPreview({ url, image, style, onPress }) {
  const [ogImage, setOgImage] = useState(image || null);
  const domain = getDomain(url);
  const favicon = getFaviconUrl(url);

  useEffect(() => {
    if (image) { setOgImage(image); return undefined; }
    let cancelled = false;
    getOgImage(url).then(found => { if (!cancelled) setOgImage(found); });
    return () => { cancelled = true; };
  }, [url, image]);

  const body = ogImage
    ? <Image source={{ uri: ogImage }} style={styles.photoImg} resizeMode="cover" />
    : (
      <View style={styles.linkFallback}>
        {favicon ? <Image source={{ uri: favicon }} style={styles.linkFavicon} /> : null}
        <Text style={styles.linkDomain} numberOfLines={1}>{domain || 'recipe link'}</Text>
      </View>
    );

  // Without an onPress this is decoration, so render a plain View. As a
  // Pressable it captured the tap and did nothing, which made the image look
  // dead while the rest of the card opened fine.
  if (!onPress) return <View style={[styles.photo, style]}>{body}</View>;

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

// Thin wrapper over the shared DialogShell so every call site in this file keeps
// working while the chrome itself lives in one place.
function Sheet({ visible, onClose, title, icon, children, footer, width = 520 }) {
  return (
    <DialogShell visible={visible} onClose={onClose} title={title} icon={icon} width={width} footer={footer}>
      <View style={styles.sheetBody}>{children}</View>
    </DialogShell>
  );
}

// One library card, memoised: a big book renders 80+ of these, and without this
// every keystroke in the search box and every hover elsewhere re-renders them
// all. The handlers it takes are stable so the memo actually holds.
const RecipeCard = React.memo(function RecipeCard({
  recipe, index, columns, isPinned, count, animate,
  onOpen, onPin, onCook, onPhotos, onDelete,
}) {
  // Reanimated's layout transitions measure every card on each change, which a
  // large grid cannot afford - past that size the cards just appear.
  const Wrapper = animate ? Animated.View : View;
  return (
    <Wrapper
      // Staggered entrance, capped so a large book doesn't spend a
      // second and a half dealing itself out. Cards also glide to
      // their new positions when a filter changes.
      {...(animate ? {
        entering: FadeInDown.delay(Math.min(index, 12) * 35).duration(280),
        layout: LinearTransition.duration(220),
      } : {})}
      style={[styles.card, { width: `${100 / columns}%` }]}
    >
      {/* One clickable surface. Everything you can do to a recipe
          now lives in the dialog it opens - a card carrying four
          competing buttons made the primary action ambiguous. Pin
          stays out here because it's a property of the card itself. */}
      <Hoverable
        onPress={() => onOpen(recipe)}
        style={[styles.cardInner, isPinned && styles.cardPinned]}
        hoverStyle={styles.cardInnerHover}
      >
        {recipe.images?.length ? (
          <Photo imageRef={recipe.images[0]} style={styles.cardPhoto} />
        ) : recipe.url ? (
          <LinkPreview url={recipe.url} image={recipe.parsed?.image} style={styles.cardPhoto} />
        ) : null}

        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>{recipe.name}</Text>
          <Hoverable
            onPress={() => onPin(recipe)}
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

        <Text
          style={[styles.cardNote, !recipe.comment && styles.cardNoteEmpty]}
          numberOfLines={2}
        >
          {recipe.comment || 'No note yet'}
        </Text>

        <View style={styles.cardFooter}>
          {count > 0 ? (
            <View style={styles.badge}>
              <MaterialCommunityIcons name="fire" size={13} color={BROWN} />
              <Text style={styles.badgeText}>cooked {count}×</Text>
            </View>
          ) : <View />}

          {/* Quick actions, back by request. Nested Pressables: the
              innermost handles the touch, so tapping an icon does
              not also open the dialog behind it. */}
          <View style={styles.cardActions}>
            <Hoverable
              onPress={() => onCook(recipe)}
              style={styles.cardIcon}
              hoverStyle={styles.cardIconHover}
            >
              <MaterialCommunityIcons name="silverware-fork-knife" size={17} color={ORANGE} />
            </Hoverable>
            <Hoverable
              onPress={() => onPhotos(recipe)}
              style={styles.cardIcon}
              hoverStyle={styles.cardIconHover}
            >
              <MaterialCommunityIcons
                name={recipe.images?.length ? 'image-multiple' : 'camera-plus-outline'}
                size={17}
                color={recipe.images?.length ? BROWN : MUTED}
              />
            </Hoverable>
            <Hoverable
              onPress={() => onDelete(recipe)}
              style={styles.cardIcon}
              hoverStyle={styles.cardIconHover}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={17} color={ERROR} />
            </Hoverable>
          </View>
        </View>
      </Hoverable>
    </Wrapper>
  );
});

export default function WebHome() {
  const { width } = useWindowDimensions();
  const columns =
    width >= 1560 ? 4 :
    width >= 1120 ? 3 :
    width >= 760 ? 2 : 1;
  const narrow = width < 720;

  const [recipes, setRecipes] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [cookCounts, setCookCounts] = useState({});
  const [lastCooked, setLastCooked] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Filtering re-renders the whole grid, so it runs on a settled query rather
  // than on every keystroke.
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTags, setActiveTags] = useState([]);

  const [suggestion, setSuggestion] = useState(null);
  const [seen, setSeen] = useState(() => new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', url: '', comment: '' });
  const [draftPreview, setDraftPreview] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const [driveState, setDriveState] = useState({ connected: false, busy: false, message: '' });
  const [gallery, setGallery] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cookConfirm, setCookConfirm] = useState(null);
  const [recipeView, setRecipeView] = useState(null);
  const [recipeData, setRecipeData] = useState({ loading: false, data: null });
  const [baseServings, setBaseServings] = useState(null);
  const [servings, setServings] = useState(1);
  const [showHelp, setShowHelp] = useState(false);
  const [showCoffee, setShowCoffee] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [useMetric, setUseMetric] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopItems, setShopItems] = useState([]);
  const [advisorOn, setAdvisorOn] = useState(false);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [mood, setMood] = useState('');
  const [advice, setAdvice] = useState({ loading: false, data: null, error: '' });

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
      setShopItems(await getShoppingList());
      setUseMetric((await getUnitPreference()) === METRIC);
      // Only probe the proxy when the feature is switched on at all.
      setAdvisorOn(ADVISOR_ENABLED ? await isAdvisorAvailable() : false);
      setLoading(false);
    })();
  }, [refresh]);

  // Text and tag filtering both live in recipeTags.js so the behaviour is
  // tested rather than reimplemented inline.
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const visible = useMemo(() => {
    const filtered = filterRecipes(recipes, { query: searchTerm, tags: activeTags });
    // Pinned first, then alphabetical - the grid has no other ordering cue.
    return [...filtered].sort((a, b) => {
      const ap = pinned.includes(a.name) ? 0 : 1;
      const bp = pinned.includes(b.name) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [recipes, searchTerm, activeTags, pinned]);

  // Entrance and layout animations are worth it for a grid you can take in at a
  // glance; past that they cost more than they add.
  const animateCards = visible.length <= 40;

  // Derived from the recipes themselves - there is no tagging UI to maintain.
  const availableTags = useMemo(() => collectTags(recipes), [recipes]);

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

  // "Cook it" opens the recipe and then asks for confirmation, rather than
  // recording the cook straight away - the user hasn't cooked anything yet at
  // the moment they click. Confirming is what marks it.
  //
  // NOTE: setCookedStatus() already increments the cook count internally, with a
  // 3-day guard so re-cooking the same thing twice in a week doesn't inflate the
  // number. Calling incrementCookCount() alongside it double-counts and bypasses
  // that guard - which is exactly the bug that made one click read as "cooked 2x".
  const handleCook = useCallback((recipe) => {
    openUrl(recipe.url);
    setCookConfirm(recipe);
  }, []);

  const confirmCooked = async () => {
    const recipe = cookConfirm;
    if (!recipe) return;
    await setCookedStatus(recipe.name, true);
    setCookConfirm(null);
    await refresh();
  };

  // Paste a link, get the name filled in. The preview proxy already fetches the
  // page for the og:image, and its title comes back in the same response - so
  // this costs one request that was going to happen anyway and removes the most
  // tedious part of adding a recipe.
  //
  // Only fills a field the user hasn't typed into: overwriting a name someone
  // deliberately entered would be worse than not helping at all.
  const handleLookup = async () => {
    const url = draft.url.trim();
    if (!url) return;

    setDraftBusy(true);
    try {
      const preview = await getPreview(url);
      if (preview?.title) {
        setDraft(prev => (prev.name.trim() ? prev : { ...prev, name: preview.title }));
      }
      setDraftPreview(preview);
    } catch (_error) {
      // A failed lookup just means no autofill; the user types it themselves.
      setDraftPreview(null);
    } finally {
      setDraftBusy(false);
    }
  };

  // Ingredients are added at the serving count currently shown, not the
  // recipe's original - if you scaled it for six people, the list should be for
  // six people.
  const handleAddToList = async () => {
    const ingredients = (recipeData.data?.ingredients || [])
      .map(line => scaleIngredient(line, scaleFactor));
    setShopItems(await addRecipeToList(recipeView.name, ingredients));
    setRecipeView(null);
    setShopOpen(true);
  };

  // Free, instant, offline. The default - there is no reason to pay per request
  // for "what have I been neglecting", which is a deterministic question.
  const handleAdviseLocally = () => {
    setAdvice({
      loading: false,
      data: adviseLocally(recipes, lastCooked, cookCounts, mood),
      error: '',
    });
  };

  // Opt-in upgrade: better at reading a free-text mood, costs a fraction of a
  // cent per ask, and sends recipe data to Anthropic.
  const handleAskClaude = async () => {
    setAdvice({ loading: true, data: null, error: '' });
    try {
      const result = await askForAdvice(recipes, lastCooked, cookCounts, mood);
      setAdvice({ loading: false, data: { ...result, source: 'claude' }, error: '' });
    } catch (error) {
      setAdvice({ loading: false, data: null, error: error?.message || 'The advisor failed.' });
    }
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
  const openRecipe = useCallback(async (recipe) => {
    setRecipeView(recipe);
    setRecipeData({ loading: true, data: null });
    const data = await getPreview(recipe.url);
    setRecipeData({ loading: false, data });

    // Start the stepper at whatever the recipe itself says it serves, so the
    // amounts shown initially are the ones the author wrote.
    const parsed = parseServings(data?.servings);
    setBaseServings(parsed);
    setServings(parsed || 1);
  }, []);

  const handlePin = useCallback(async (recipe) => {
    await togglePinnedRecipe(recipe.name);
    setPinned(await getPinnedRecipes());
  }, []);

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
          message: 'Excel service failed to initialize — see the browser console for details.',
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
        setDriveState({
          connected: googleDriveService.isAuthenticated(),
          busy: false,
          message: result.message || 'Sync failed',
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

  // 1 when there's no baseline to scale against, which makes scaleIngredient a
  // no-op and leaves the author's original text untouched.
  const scaleFactor = baseServings ? servings / baseServings : 1;

  // Drive status messages are transient notifications, not state - "Popup window
  // closed" describing something that happened ten minutes ago is just noise
  // taking up the top of the page. Errors linger a little longer than successes
  // because they're worth reading.
  // Reanimated rather than RN's Animated: this file already uses reanimated for
  // the card transitions, and importing both collides on the name `Animated`.
  const bannerProgress = useSharedValue(1);
  const bannerBarStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, bannerProgress.value) * 100}%`,
  }));

  useEffect(() => {
    if (!driveState.message || driveState.busy) return undefined;
    const isError = /fail|error|not |could not|closed|denied/i.test(driveState.message);
    const duration = isError ? 8000 : 4000;

    // A draining bar makes the countdown visible, so the banner disappearing
    // reads as intentional rather than as something vanishing mid-read.
    bannerProgress.value = 1;
    bannerProgress.value = withTiming(0, { duration });

    const timer = setTimeout(() => setDriveState(s => ({ ...s, message: '' })), duration);
    return () => clearTimeout(timer);
  }, [driveState.message, driveState.busy, bannerProgress]);

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
          message: result.message || 'Sync failed',
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
    // Header lives outside the ScrollView rather than scrolling away with the
    // content. The library can run to dozens of cards, and having to scroll back
    // to the top to reach search, the cart or the Drive state is a nuisance.
    <View style={styles.root}>
      {/* --- nav ------------------------------------------------------- */}
      <View style={[styles.nav, narrow && styles.navPad]}>
        <View style={[styles.navInner, { maxWidth: CONTENT_MAX }, narrow && styles.navInnerNarrow]}>
          {/* Three zones: identity left, navigation centre, account state
              right. Previously everything but the logo was crammed on the right,
              so the unit switch and the Drive chip - which are settings, not
              navigation - sat in the middle of the icon run. */}
          {/* Drive sits beside the wordmark, separated by a rule: it is the one
              thing here describing the app's connection to your data, so it
              belongs with the identity rather than among the preferences. */}
          {/* At phone widths the three zones want more room than the bar has.
              Nothing here shrinks gracefully - a too-narrow zone overflows and
              paints over its neighbour - so the labels are dropped and the
              controls stand as icons instead. */}
          <View style={[styles.navLeft, narrow && styles.navZoneNarrow]}>
            <View style={styles.brand}>
              <MaterialCommunityIcons name="chef-hat" size={narrow ? 24 : 30} color={YELLOW} />
              <Text style={[styles.brandName, narrow && styles.brandNameNarrow]}>
                Cook<Text style={{ color: YELLOW }}>-IT</Text>
              </Text>
            </View>

            {narrow ? null : <View style={styles.navDivider} />}

            <Hoverable
              onPress={handleDrive}
              style={[styles.chip, narrow && styles.chipIconOnly, driveState.connected && styles.chipOn]}
              hoverStyle={styles.chipHover}
            >
              {driveState.busy
                ? <ActivityIndicator size="small" color={CREAM} />
                : <MaterialCommunityIcons
                    name={driveState.connected ? 'cloud-check' : 'cloud-off-outline'}
                    size={18}
                    color={driveState.connected ? YELLOW : CREAM}
                  />}
              {narrow ? null : (
                <Text style={styles.chipText}>
                  {driveState.connected ? 'Drive synced' : 'Connect Drive'}
                </Text>
              )}
            </Hoverable>

            {isPickerConfigured() ? (
              <Hoverable onPress={handleChooseFile} style={styles.chip} hoverStyle={styles.chipHover}>
                <MaterialCommunityIcons name="file-find-outline" size={18} color={CREAM} />
                <Text style={styles.chipText}>Choose file</Text>
              </Hoverable>
            ) : null}
          </View>

          {/* Tools only. Help and Support moved to the footer: they are read-once
              meta, and mixing them in here gave a rarely-used link the same
              visual weight as the shopping list. Grouping the three in a subtle
              container makes them read as one control cluster rather than five
              loose glyphs. */}
          <View style={styles.navCenter}>
            <NavIcon
              icon="cart-outline"
              label="Shopping list"
              onPress={() => setShopOpen(true)}
              badge={shopItems.some(i => !i.checked)}
              compact={narrow}
            />
            <NavIcon icon="calendar-month-outline" label="Cooking history" onPress={() => setCalendarOpen(true)} compact={narrow} />
            <NavIcon icon="vote-outline" label="Vote on dinner" onPress={() => setVoteOpen(true)} compact={narrow} />
          </View>

          <View style={[styles.navRight, narrow && styles.navZoneNarrow]}>
            <Hoverable
              onPress={async () => setUseMetric((await toggleUnitPreference()) === METRIC)}
              style={[styles.unitPill, narrow && styles.unitPillIconOnly, useMetric && styles.unitPillOn]}
              // Hover must respect the toggle state. The shared navIconHover
              // paints a translucent cream background, which over the yellow
              // "on" pill left dark brown text on a dark surface - unreadable.
              hoverStyle={useMetric ? styles.unitPillOnHover : styles.unitPillOffHover}
            >
              <MaterialCommunityIcons name="scale-balance" size={16} color={useMetric ? PAGE_BG : CREAM} />
              {narrow ? null : (
                <Text style={[styles.unitPillText, useMetric && { color: PAGE_BG }]}>
                  {useMetric ? 'Metric' : 'To metric'}
                </Text>
              )}
            </Hoverable>

            {/* Icon only - the label lives on the footer button, which is where
                this goes entirely once the bar is too narrow to hold it. */}
            {narrow ? null : (
              <NavIcon icon="coffee-outline" label="Support Cook-IT" onPress={() => setShowCoffee(true)} />
            )}
          </View>
        </View>
      </View>

      {driveState.message ? (
        <Hoverable
          onPress={() => setDriveState(s => ({ ...s, message: '' }))}
          style={styles.banner}
          hoverStyle={styles.bannerHover}
        >
          <Text style={styles.bannerText}>{driveState.message}</Text>
          {/* Absolutely positioned so the message stays optically centred in
              the bar rather than being shoved left by the button's width. */}
          <View style={styles.bannerClose}>
            <MaterialCommunityIcons name="close" size={16} color={INK} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[styles.bannerProgress, bannerBarStyle]}
          />
        </Hoverable>
      ) : null}

      <ScrollView style={styles.scroller} contentContainerStyle={styles.rootContent}>
      {/* --- hero ------------------------------------------------------ */}
      <View style={[styles.hero, narrow && styles.heroPad]}>
        <View style={[styles.heroInner, { maxWidth: CONTENT_MAX }, narrow && styles.heroNarrow]}>
          <View style={[styles.heroCopy, narrow && styles.heroStackChild]}>
            <Text style={styles.heroKicker}>YOUR RECIPE BOOK</Text>
            <Text style={[styles.heroTitle, narrow && styles.heroTitleNarrow]}>
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
              {ADVISOR_ENABLED ? (
                <Button
                  label="Ask Cook-IT"
                  icon="chef-hat"
                  kind="ghost"
                  onPress={() => { setAdviceOpen(true); setAdvice({ loading: false, data: null, error: '' }); }}
                  disabled={recipes.length === 0}
                />
              ) : null}
            </View>
          </View>

          {/* Suggestion panel doubles as the hero's visual weight on desktop. */}
          <View style={[styles.heroPanel, narrow && styles.heroStackChild, narrow && styles.heroPanelNarrow]}>
            {suggestion ? (
              <Animated.View key={suggestion.name} entering={FadeIn.duration(260)}>
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
              </Animated.View>
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

        {availableTags.length ? (
          <View style={styles.tagRow}>
            {activeTags.length ? (
              <Hoverable
                onPress={() => setActiveTags([])}
                style={[styles.tag, styles.tagClear]}
                hoverStyle={styles.tagHover}
              >
                <MaterialCommunityIcons name="close" size={13} color={ERROR} />
                <Text style={[styles.tagText, { color: ERROR }]}>Clear</Text>
              </Hoverable>
            ) : null}
            {availableTags.map(({ tag, count }) => {
              const on = activeTags.includes(tag);
              return (
                <Hoverable
                  key={tag}
                  onPress={() => setActiveTags(prev =>
                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                  )}
                  style={[styles.tag, on && styles.tagOn]}
                  hoverStyle={styles.tagHover}
                >
                  <Text style={[styles.tagText, on && { color: '#fff' }]}>{tag}</Text>
                  <Text style={[styles.tagCount, on && { color: 'rgba(255,255,255,0.75)' }]}>{count}</Text>
                </Hoverable>
              );
            })}
          </View>
        ) : null}

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="notebook-outline" size={44} color={MUTED} />
            <Text style={styles.emptyText}>
              {recipes.length === 0
                ? 'No recipes yet.'
                : activeTags.length
                  ? `Nothing matches ${activeTags.join(' + ')}${query.trim() ? ' and that search' : ''}.`
                  : 'Nothing matches that search.'}
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
            {group.items.map((recipe, index) => (
              <RecipeCard
                key={recipe.name}
                recipe={recipe}
                index={index}
                columns={columns}
                animate={animateCards}
                isPinned={pinned.includes(recipe.name)}
                count={cookCounts[recipe.name] || 0}
                onOpen={openRecipe}
                onPin={handlePin}
                onCook={handleCook}
                onPhotos={setGallery}
                onDelete={setConfirm}
              />
            ))}
                  </View>
                </View>
              ) : null
            ))}
          </>
        )}
      </View>

      </ScrollView>

      {/* Pinned below the scroller, mirroring the nav above it. The build stamp
          is only useful if it can be read without scrolling past the whole
          library first. */}
      <View style={[styles.footer, narrow && styles.footerPad]}>
        <View style={[styles.footerInner, { maxWidth: CONTENT_MAX }, narrow && styles.footerInnerNarrow]}>
          <View style={styles.footerLinks}>
            <Hoverable
              onPress={() => setShowHelp(true)}
              style={[styles.footerLink, narrow && styles.footerLinkIconOnly]}
              hoverStyle={styles.footerLinkHover}
            >
              <MaterialCommunityIcons name="help-circle-outline" size={15} color={CREAM} />
              {narrow ? null : <Text style={styles.footerLinkText}>How it works</Text>}
            </Hoverable>
            <Hoverable
              onPress={() => setShowCoffee(true)}
              style={[styles.footerLink, narrow && styles.footerLinkIconOnly]}
              hoverStyle={styles.footerLinkHover}
            >
              <MaterialCommunityIcons name="coffee-outline" size={15} color={CREAM} />
              {narrow ? null : <Text style={styles.footerLinkText}>Support Cook-IT</Text>}
            </Hoverable>
          </View>

          {/* First to go when the row runs out of room: it is reassurance, not
              something anyone needs on screen at all times. */}
          {narrow ? null : (
            <Text style={styles.footerText} numberOfLines={1}>
              Recipes stay on this device and sync to your own Google Drive.
            </Text>
          )}

          {/* Nothing deploys this site automatically, and a browser will happily
              serve a cached bundle, so the page states which build it is. */}
          <Text style={styles.footerBuild}>Deployed {formatBuildStamp()}</Text>
        </View>
      </View>

      {/* --- modals ---------------------------------------------------- */}
      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a recipe" icon="plus-circle-outline"
        footer={
          <>
            <Button label="Cancel" kind="ghost" onPress={() => setAddOpen(false)} />
            <Button label="Add recipe" icon="plus" onPress={handleAdd} disabled={!draft.name.trim()} />
          </>
        }
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Link</Text>
          <View style={styles.lookupRow}>
            <TextInput
              value={draft.url}
              onChangeText={v => setDraft({ ...draft, url: v })}
              onBlur={handleLookup}
              onSubmitEditing={handleLookup}
              placeholder="https://…"
              placeholderTextColor={MUTED}
              style={[styles.input, { flex: 1 }]}
              autoFocus
            />
            <Button
              label={draftBusy ? '…' : 'Fetch'}
              icon="download-outline"
              kind="secondary"
              onPress={handleLookup}
              disabled={!draft.url.trim() || draftBusy}
            />
          </View>
          {draftPreview?.ingredients?.length ? (
            <Text style={styles.lookupHint}>
              Found “{draftPreview.title}” — {draftPreview.ingredients.length} ingredients,
              {' '}{draftPreview.steps.length} steps.
            </Text>
          ) : null}
        </View>

        {draftPreview?.image ? (
          <Image source={{ uri: draftPreview.image }} style={styles.draftPreview} resizeMode="cover" />
        ) : null}

        <Field label="Name" value={draft.name} onChangeText={v => setDraft({ ...draft, name: v })} placeholder="Carbonara" />
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
        visible={ADVISOR_ENABLED && adviceOpen}
        onClose={() => setAdviceOpen(false)}
        title="Ask Cook-IT"
        width={560}
        footer={
          <>
            <Button label="Close" kind="ghost" onPress={() => setAdviceOpen(false)} />
            {advisorOn ? (
              <Button
                label={advice.loading ? 'Thinking…' : 'Ask Claude'}
                icon="creation"
                kind="secondary"
                onPress={handleAskClaude}
                disabled={advice.loading}
              />
            ) : null}
            <Button label="Suggest" icon="chef-hat" onPress={handleAdviseLocally} />
          </>
        }
      >
        <Field
          label="Anything in particular? (optional)"
          value={mood}
          onChangeText={setMood}
          placeholder="something quick, we have guests, use up the spinach…"
        />

        {advice.loading ? (
          <View style={styles.adviceLoading}>
            <ActivityIndicator color={ORANGE} />
            <Text style={styles.galleryEmptyText}>Reading your recipe book…</Text>
          </View>
        ) : advice.error ? (
          <Text style={styles.adviceError}>{advice.error}</Text>
        ) : advice.data ? (
          <View>
            <Text style={styles.adviceText}>{advice.data.advice}</Text>
            {advice.data.picks.map(pick => {
              const match = recipes.find(r => r.name === pick.name);
              return (
                <View key={pick.name} style={styles.pickRow}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={17} color={ORANGE} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{pick.name}</Text>
                    <Text style={styles.pickReason}>{pick.reason}</Text>
                  </View>
                  {match ? (
                    <Button
                      label="Cook it"
                      onPress={() => { setAdviceOpen(false); handleCook(match); }}
                      style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                    />
                  ) : null}
                </View>
              );
            })}
            <Text style={styles.adviceFootnote}>
              {advice.data.source === 'claude'
                ? `Suggested by Claude (Haiku 4.5) from your recipe names, notes and cooking dates${
                    advice.data.usage?.estimatedCostUsd
                      ? ` — about $${advice.data.usage.estimatedCostUsd.toFixed(4)} for this answer`
                      : ''
                  }.`
                : 'Worked out on your device from your cooking history — free, and nothing left your browser.'}
            </Text>
          </View>
        ) : (
          <Text style={styles.galleryEmptyText}>
            “Suggest” works out an answer on your device from your cooking history —
            free, instant, and nothing leaves your browser.
            {advisorOn
              ? ' “Ask Claude” is better at reading what you typed above, costs a fraction of a cent, and sends your recipe names and dates to Anthropic.'
              : ''}
          </Text>
        )}
      </Sheet>

      <CookCalendar visible={calendarOpen} onClose={() => setCalendarOpen(false)} />

      <Sheet
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        title="Shopping list" icon="cart-outline"
        width={560}
        footer={
          <>
            <Button
              label="Clear ticked"
              kind="ghost"
              onPress={async () => setShopItems(await clearChecked())}
              disabled={!shopItems.some(i => i.checked)}
            />
            <Button label="Done" icon="check" onPress={() => setShopOpen(false)} />
          </>
        }
      >
        {shopItems.length === 0 ? (
          <View style={styles.galleryEmpty}>
            <MaterialCommunityIcons name="cart-outline" size={40} color={MUTED} />
            <Text style={styles.galleryEmptyText}>
              Nothing on the list. Open a recipe and use “Add to list” — the amounts
              follow whatever serving count you set.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.shopScroll}>
            {groupByRecipe(shopItems).map(group => (
              <View key={group.recipe} style={styles.shopGroup}>
                <Text style={styles.shopGroupTitle}>{group.recipe}</Text>
                {group.items.map(item => (
                  <Hoverable
                    key={item.id}
                    onPress={async () => setShopItems(await toggleItem(item.id))}
                    style={styles.shopRow}
                    hoverStyle={{ backgroundColor: 'rgba(90,66,48,0.06)' }}
                  >
                    <MaterialCommunityIcons
                      name={item.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={item.checked ? ORANGE : MUTED}
                    />
                    <Text style={[styles.shopText, item.checked && styles.shopTextDone]}>
                      {item.text}
                    </Text>
                    <Hoverable
                      onPress={async () => setShopItems(await removeShopItem(item.id))}
                      style={styles.cardIcon}
                      hoverStyle={styles.cardIconHover}
                    >
                      <MaterialCommunityIcons name="close" size={15} color={MUTED} />
                    </Hoverable>
                  </Hoverable>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </Sheet>

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

      {/* Same component the phone uses, so comment editing, unit conversion
          and serving scaling can't diverge between the two screens. */}
      <RecipeViewDialog
        visible={!!recipeView}
        key={`${recipeView?.name || ''}-${useMetric}`}
        recipe={recipeView}
        onClose={() => setRecipeView(null)}
        onCook={(r) => { setRecipeView(null); handleCook(r); }}
        onPhotos={(r) => { setRecipeView(null); setGallery(r); }}
        onDelete={(r) => { setRecipeView(null); setConfirm(r); }}
        onSaveComment={async (r, text) => {
          await updateRecipe(r.name, { comment: text.trim() });
          await refresh();
        }}
        onCacheParsed={async (r, parsed) => {
          // Stored so every device gets it, including ones the publisher blocks.
          await updateRecipe(r.name, { parsed: { ...parsed, parsedAt: new Date().toISOString() } });
          await refresh();
        }}
        onAddToList={async (ingredients) => {
          setShopItems(await addRecipeToList(recipeView.name, ingredients));
          setRecipeView(null);
          setShopOpen(true);
        }}
      />

      <DialogShell
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="How Cook-IT works"
        icon="help-circle-outline"
        width={620}
        footer={<Button label="Got it" icon="check" onPress={() => setShowHelp(false)} />}
      >
        <HelpDialog isFirstTime={false} />
      </DialogShell>

      <DialogShell
        visible={showCoffee}
        onClose={() => setShowCoffee(false)}
        title="Support Cook-IT"
        icon="coffee-outline"
        width={520}
        footer={
          <>
            <Button label="Maybe later" kind="ghost" onPress={() => setShowCoffee(false)} />
            <Button
              label="Buy me a coffee"
              icon="coffee"
              onPress={() => { openUrl('https://www.buymeacoffee.com/worrador'); setShowCoffee(false); }}
            />
          </>
        }
      >
        <BuyCoffeeDialog />
      </DialogShell>

      <Sheet
        visible={!!gallery}
        onClose={() => setGallery(null)}
        title={gallery ? `Photos — ${gallery.name}` : ''} icon="image-multiple"
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
        title="Delete recipe" icon="trash-can-outline"
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
    </View>
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
  scroller: { flex: 1 },
  rootContent: { alignItems: 'center', paddingBottom: 28 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG, gap: 14 },
  loadingText: { color: CREAM, fontSize: 16 },

  // nav
  nav: {
    width: '100%', backgroundColor: PAGE_BG, paddingHorizontal: 32, paddingVertical: 12,
    alignItems: 'center', zIndex: 20,
    // A hairline plus a soft shadow so the bar reads as sitting above the page
    // once content scrolls beneath it.
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.25)',
    ...Platform.select({ web: { boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }, default: {} }),
  },
  navInner: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Keeps the zones off each other once they size to their content.
  navInnerNarrow: { gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { color: CREAM, fontSize: 24, fontWeight: '800', letterSpacing: 0.4 },
  brandNameNarrow: { fontSize: 18, letterSpacing: 0.2 },
  navLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  // The zones carry flex: 1 from the desktop bar, which splits it into equal
  // thirds - and a third of a phone is narrower than the wordmark and the Drive
  // chip together, so the zone overflows into the icons beside it. Sized to
  // their content here, with only shrinking allowed.
  navZoneNarrow: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', gap: 7 },
  navPad: { paddingHorizontal: 16 },
  navDivider: { width: 1, height: 26, backgroundColor: 'rgba(247,240,226,0.22)' },
  navCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0,
    // A quiet inset panel: enough to bind the three together, not enough to
    // compete with the Drive chip, which is the one thing here with state.
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 999, padding: 3,
  },
  navIconWrap: { position: 'relative' },
  tooltip: {
    position: 'absolute', top: '100%', left: '50%', marginTop: 8,
    transform: [{ translateX: '-50%' }],
    backgroundColor: 'rgba(24,17,10,0.95)', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 7, zIndex: 40,
  },
  tooltipText: { color: CREAM, fontSize: 12.5, fontWeight: '600', whiteSpace: 'nowrap' },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(247,240,226,0.35)',
  },
  // Connected is a resting state, so it reads as filled-and-settled rather than
  // as another button asking to be pressed.
  chipOn: { borderColor: 'rgba(242,188,66,0.55)', backgroundColor: 'rgba(242,188,66,0.14)' },
  chipHover: { backgroundColor: 'rgba(247,240,226,0.12)' },
  chipText: { color: CREAM, fontSize: 14, fontWeight: '600' },
  chipIconOnly: { paddingHorizontal: 9, gap: 0 },

  banner: {
    width: '100%', backgroundColor: YELLOW, paddingVertical: 10, paddingHorizontal: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerClose: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  bannerProgress: {
    position: 'absolute', left: 0, bottom: 0, height: 3,
    backgroundColor: 'rgba(90,66,48,0.45)',
  },
  bannerHover: { backgroundColor: '#e6ae35' },
  bannerText: { color: INK, fontSize: 14, fontWeight: '600' },

  // hero
  hero: { width: '100%', backgroundColor: SAND, paddingHorizontal: 32, paddingTop: 56, paddingBottom: 48, alignItems: 'center' },
  heroInner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 48 },
  heroNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 32 },
  // Stacked, these must size to their content. Left at flex: 1 they are told to
  // share a height the column does not have, collapse, and get drawn on top of
  // one another.
  //
  // Spelled out rather than `flex: 0`, which is not "size to content": it sets
  // flexBasis to 0 as well, so the box takes zero height in a column and its
  // content spills outside it - the same overlap by a different route.
  heroStackChild: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0, width: '100%' },
  heroPad: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28 },
  heroCopy: { flex: 1, minWidth: 280 },
  heroKicker: { color: ORANGE, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  heroTitle: { color: BROWN, fontSize: 54, fontWeight: '800', lineHeight: 60, marginBottom: 14 },
  heroTitleNarrow: { fontSize: 38, lineHeight: 44 },
  heroSub: { color: INK, fontSize: 17, lineHeight: 26, marginBottom: 28, maxWidth: 520 },
  heroActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  heroPrimary: { paddingHorizontal: 26, paddingVertical: 15 },

  heroPanel: {
    flex: 1, minWidth: 300, minHeight: 260, padding: 28, justifyContent: 'center',
    ...card, backgroundColor: '#fffdf6',
  },
  heroPanelNarrow: { minHeight: 200, padding: 20 },
  panelKicker: { color: MUTED, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  panelTitle: { color: BROWN, fontSize: 30, fontWeight: '800', lineHeight: 36, marginBottom: 10 },
  panelNote: { color: INK, fontSize: 15, lineHeight: 23, marginBottom: 22 },
  panelActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  panelEmpty: { alignItems: 'center', gap: 14 },
  panelEmptyText: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

  // stats
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 32, marginBottom: 40 },
  stat: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, ...card },
  statValue: { color: BROWN, fontSize: 24, fontWeight: '800' },
  statLabel: { color: MUTED, fontSize: 14 },

  // library
  section: { width: '100%', paddingHorizontal: 32, marginBottom: 56 },
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.22)',
  },
  tagOn: { backgroundColor: BROWN, borderColor: BROWN },
  tagHover: { borderColor: 'rgba(90,66,48,0.45)' },
  tagClear: { borderColor: 'rgba(214,48,49,0.4)' },
  tagText: { color: INK, fontSize: 13.5, fontWeight: '700' },
  tagCount: { color: MUTED, fontSize: 12, fontWeight: '700' },
  cardInner: { flex: 1, padding: 20, ...card },
  cardInnerHover: { borderColor: 'rgba(90,66,48,0.34)' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, minHeight: 24,
  },
  cardMetaIcon: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { color: MUTED, fontSize: 12, fontWeight: '700' },
  // Pinned cards are visually distinct on their own, not just grouped - the
  // grouping explains where they went, this explains which ones they are.
  // Border only - repainting the surface made pinned cards look like a
  // different kind of object rather than the same card, highlighted.
  cardPinned: { borderColor: ORANGE, borderWidth: 2 },
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
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
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
  navIcon: { padding: 11, borderRadius: 999 },
  navIconCompact: { padding: 8 },
  navIconHover: { backgroundColor: 'rgba(247,240,226,0.14)' },
  // Quieter than the Drive chip on purpose: this is a preference, not status.
  unitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  unitPillIconOnly: { paddingHorizontal: 9, gap: 0 },
  unitPillOn: { backgroundColor: YELLOW },
  // Deeper yellow, so dark text stays legible.
  unitPillOnHover: { backgroundColor: '#e0a92f' },
  // Lighter than the resting inset, so cream text stays legible.
  unitPillOffHover: { backgroundColor: 'rgba(247,240,226,0.18)' },
  unitPillText: { color: CREAM, fontSize: 13, fontWeight: '700' },
  navDot: {
    position: 'absolute', top: 7, right: 7, width: 8, height: 8,
    borderRadius: 4, backgroundColor: ORANGE,
  },
  adviceLoading: { alignItems: 'center', gap: 12, paddingVertical: 26 },
  adviceError: { color: ERROR, fontSize: 14, lineHeight: 21, paddingVertical: 10 },
  adviceText: { color: INK, fontSize: 15.5, lineHeight: 24, marginBottom: 16 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(90,66,48,0.12)',
  },
  pickName: { color: BROWN, fontSize: 15.5, fontWeight: '800' },
  pickReason: { color: MUTED, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  adviceFootnote: { color: MUTED, fontSize: 12, marginTop: 16, fontStyle: 'italic' },
  shopScroll: { maxHeight: 420 },
  shopGroup: { marginBottom: 18 },
  shopGroupTitle: { color: BROWN, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8 },
  shopText: { flex: 1, color: INK, fontSize: 15, lineHeight: 21 },
  shopTextDone: { color: MUTED, textDecorationLine: 'line-through' },
  pinRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(90,66,48,0.18)',
  },
  pinRowText: { color: INK, fontSize: 14, fontWeight: '600' },

  recipeLoading: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  recipeScroll: { maxHeight: 460 },
  recipeHero: { width: '100%', height: 190, borderRadius: 12, marginBottom: 14, backgroundColor: SAND },
  recipeMetaRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' },
  servingStepper: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
    backgroundColor: YELLOW,
  },
  servingCount: { color: BROWN, fontSize: 12, fontWeight: '800', minWidth: 62, textAlign: 'center' },
  stepBtn: { padding: 3, borderRadius: 999 },
  stepBtnHover: { backgroundColor: 'rgba(90,66,48,0.16)' },
  scaledBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.28)',
  },
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

  // Same padding as the nav, and the same hairline-plus-shadow treatment cast
  // upward, so the two bars frame the page as a matched pair.
  footer: {
    width: '100%', backgroundColor: PAGE_BG, paddingHorizontal: 32, paddingVertical: 12,
    alignItems: 'center', zIndex: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.25)',
    ...Platform.select({ web: { boxShadow: '0 -2px 12px rgba(0,0,0,0.18)' }, default: {} }),
  },
  // 45 is the height of the nav's tallest child (a 23px icon in 11px of
  // padding). Stated rather than derived, because nothing in this row is that
  // tall on its own and the two bars have to match.
  footerInner: {
    width: '100%', height: 45, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 16,
  },
  // Matches the compact nav icons, so the two bars stay the same height on a
  // phone as they are on a desktop.
  footerInnerNarrow: { height: 36, gap: 10 },
  footerPad: { paddingHorizontal: 16 },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(247,240,226,0.22)',
  },
  footerLinkIconOnly: { paddingHorizontal: 9, gap: 0 },
  footerLinkHover: { backgroundColor: 'rgba(247,240,226,0.12)' },
  footerLinkText: { color: CREAM, fontSize: 13, fontWeight: '600' },
  footerText: { color: 'rgba(247,240,226,0.65)', fontSize: 12.5, flexShrink: 1 },
  footerBuild: { color: 'rgba(247,240,226,0.6)', fontSize: 12.5, textAlign: 'right' },

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
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lookupHint: { color: MUTED, fontSize: 13, marginTop: 8, lineHeight: 19 },
  draftPreview: { width: '100%', height: 140, borderRadius: 10, marginBottom: 14 },
});
