// "Start a vote" - a Tinder-style deck for deciding what to cook, shared across
// everyone's own device.
//
// Sessions live in a small JSON file in Drive (see voteSync.js) rather than in a
// realtime backend. That means the vote is eventually-consistent, not live: you
// see other people's votes when you refresh, not the instant they tap. For
// deciding dinner that's fine, and it keeps the app backend-free.
//
// A session lasts 24 hours, so tonight's vote can't be confused with yesterday's
// and nothing needs cleaning up.
//
// The deck is fixed when the vote is created and stored in the session, so every
// participant votes on the same cards in the same order - otherwise tallying
// would be comparing different shortlists.
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { topByWeight, tallyVotes } from '../services/suggestion';
import {
  fetchSession, createSession, submitVotes, votesForTally,
  getVoterName, setVoterName, getVoterId,
} from '../services/voteSync';
import { useImageUrl } from '../services/imageDisplay';
import { getFaviconUrl, getDomain, getOgImage } from '../services/linkPreview';
import googleDriveService from '../services/googleDriveService';
import { BROWN, ORANGE, YELLOW, SAND, CREAM, PAGE_BG, INK, MUTED, ERROR } from '../theme/webPalette';

const DECK_SIZE = 20;

// Artwork for a vote card, in the same order of preference the library cards
// use: the user's own photo, then the linked page's og:image, then a favicon
// placeholder. The first version skipped the og:image step entirely, so recipes
// with a link but no photo showed only a favicon - which is most of them.
function VoteCardArt({ recipe }) {
  const photoUrl = useImageUrl(recipe?.images?.[0]);
  const [ogImage, setOgImage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!recipe?.url || recipe?.images?.length) { setOgImage(null); return undefined; }
    getOgImage(recipe.url).then(image => { if (!cancelled) setOgImage(image); });
    return () => { cancelled = true; };
  }, [recipe]);

  const art = photoUrl || ogImage;
  if (art) return <Image source={{ uri: art }} style={styles.cardArt} resizeMode="cover" />;

  const favicon = recipe?.url ? getFaviconUrl(recipe.url) : null;
  return (
    <View style={[styles.cardArt, styles.cardArtFallback]}>
      {favicon
        ? <Image source={{ uri: favicon }} style={styles.favicon} />
        : <MaterialCommunityIcons name="silverware-variant" size={48} color={MUTED} />}
      {recipe?.url ? <Text style={styles.cardDomain}>{getDomain(recipe.url)}</Text> : null}
    </View>
  );
}

function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3600000);
  return hours >= 1 ? `${hours}h left` : `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

export default function VoteSession({ visible, onClose, recipes, lastCooked, onCookIt }) {
  const [stage, setStage] = useState('loading');
  const [session, setSession] = useState(null);
  const [name, setName] = useState('');
  const [cardIndex, setCardIndex] = useState(0);
  const [approved, setApproved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [alreadyVoted, setAlreadyVoted] = useState(false);

  // The deck comes from the session when one exists, so everyone votes on the
  // same cards. Names are resolved back to full recipe objects; anything since
  // deleted is dropped rather than rendering a blank card.
  const deck = useMemo(() => {
    if (session?.deck) {
      const byName = new Map(recipes.map(r => [r.name, r]));
      return session.deck.map(n => byName.get(n)).filter(Boolean);
    }
    return topByWeight(recipes, lastCooked, DECK_SIZE);
  }, [session, recipes, lastCooked]);

  const load = useCallback(async () => {
    setStage('loading');
    setError('');
    try {
      const [existing, savedName, voterId, profile] = await Promise.all([
        fetchSession(), getVoterName(), getVoterId(),
        googleDriveService.getUserProfile(),
      ]);
      setSession(existing);
      // Prefer a name the user has already set for themselves; otherwise fall
      // back to their Google display name, so nobody has to type what Google
      // already told us. openid/profile/email are in BASE_SCOPES already, so
      // this costs no extra consent.
      setName(savedName || profile?.name || '');
      setAlreadyVoted(Boolean(existing?.votes?.[voterId]));
      setStage('lobby');
    } catch (e) {
      setError(e?.message || 'Could not reach the vote.');
      setStage('lobby');
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setCardIndex(0);
      setApproved([]);
      load();
    }
  }, [visible, load]);

  const close = () => { setSession(null); onClose(); };

  // Back always returns to the lobby, reloading the session so the vote counts
  // and "already voted" state are current rather than whatever they were when
  // this screen was opened. Mid-swipe, it abandons the unsubmitted votes -
  // nothing has been written to Drive until the last card, so there is nothing
  // half-saved to worry about.
  const goBack = () => {
    setCardIndex(0);
    setApproved([]);
    load();
  };

  const beginNewVote = async () => {
    setBusy(true);
    setError('');
    try {
      await setVoterName(name);
      const fresh = await createSession(topByWeight(recipes, lastCooked, DECK_SIZE), name);
      setSession(fresh);
      setAlreadyVoted(false);
      setCardIndex(0);
      setApproved([]);
      setStage('swiping');
    } catch (e) {
      setError(e?.message || 'Could not start the vote.');
    } finally {
      setBusy(false);
    }
  };

  const joinVote = async () => {
    await setVoterName(name);
    setCardIndex(0);
    setApproved([]);
    setStage('swiping');
  };

  const swipe = async (yes) => {
    const recipe = deck[cardIndex];
    const next = yes ? [...approved, recipe.name] : approved;
    setApproved(next);

    if (cardIndex + 1 < deck.length) {
      setCardIndex(cardIndex + 1);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const updated = await submitVotes(session.sessionId, next, name);
      setSession(updated);
      setAlreadyVoted(true);
      setStage('results');
    } catch (e) {
      setError(e?.message || 'Could not save your votes.');
      setStage('results');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const latest = await fetchSession();
      if (latest) setSession(latest);
      else setError('The vote has expired.');
    } catch (e) {
      setError(e?.message || 'Could not refresh.');
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(
    () => (session ? tallyVotes(votesForTally(session), deck, lastCooked) : null),
    [session, deck, lastCooked]
  );

  const voterCount = Object.keys(session?.votes || {}).length;
  const voterNames = Object.values(session?.votes || {}).map(v => v.name);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.headLeft}>
              {/* Every stage past the lobby needs a way back that isn't "close
                  the whole thing" - otherwise the results are a dead end. */}
              {stage !== 'lobby' && stage !== 'loading' ? (
                <Pressable onPress={goBack} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color={CREAM} />
                </Pressable>
              ) : (
                <MaterialCommunityIcons name="vote-outline" size={22} color={YELLOW} />
              )}
              <Text style={styles.headTitle}>
                {stage === 'results' ? 'The verdict' : 'Vote on dinner'}
              </Text>
            </View>
            <Pressable onPress={close} style={styles.iconBtn}>
              <MaterialCommunityIcons name="close" size={20} color={CREAM} />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBar}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {stage === 'loading' ? (
            <View style={styles.bodyCentered}>
              <ActivityIndicator color={ORANGE} size="large" />
              <Text style={styles.lead}>Checking for an open vote…</Text>
            </View>
          ) : null}

          {/* --- lobby --------------------------------------------------- */}
          {stage === 'lobby' ? (
            <ScrollView style={styles.body}>
              <View style={styles.nameRow}>
                <MaterialCommunityIcons name="account-outline" size={20} color={MUTED} />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </View>

              {session ? (
                <>
                  <View style={styles.openVote}>
                    <MaterialCommunityIcons name="account-group-outline" size={20} color={BROWN} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.openVoteTitle}>
                        {session.createdBy} started a vote
                      </Text>
                      <Text style={styles.openVoteMeta}>
                        {voterCount} {voterCount === 1 ? 'person has' : 'people have'} voted
                        {' · '}{hoursLeft(session.expiresAt)}
                      </Text>
                    </View>
                  </View>

                  {alreadyVoted ? (
                    <>
                      <Text style={styles.lead}>You&apos;ve already voted in this one.</Text>
                      <Pressable onPress={() => setStage('results')} style={styles.primaryBtn}>
                        <MaterialCommunityIcons name="poll" size={18} color="#fff" />
                        <Text style={styles.primaryBtnText}>See the results</Text>
                      </Pressable>
                      <Pressable onPress={joinVote} style={styles.secondaryBtn}>
                        <Text style={styles.secondaryBtnText}>Vote again (replaces my votes)</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={joinVote} disabled={!name.trim()} style={[styles.primaryBtn, !name.trim() && styles.disabled]}>
                      <MaterialCommunityIcons name="cards-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Join the vote</Text>
                    </Pressable>
                  )}

                  <Pressable onPress={beginNewVote} disabled={busy || !name.trim()} style={styles.dangerLink}>
                    <Text style={styles.dangerLinkText}>Start a new vote instead (ends this one)</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.lead}>
                    No vote is running. Start one and everyone in your household can vote from
                    their own device — you&apos;ll each see the {Math.min(DECK_SIZE, deck.length)} recipes
                    you&apos;re most overdue to cook. The vote stays open for 24 hours.
                  </Text>
                  {deck.length < 2 ? (
                    <Text style={styles.warn}>You need at least two recipes to hold a vote.</Text>
                  ) : null}
                  <Pressable
                    onPress={beginNewVote}
                    disabled={busy || deck.length < 2 || !name.trim()}
                    style={[styles.primaryBtn, (busy || deck.length < 2 || !name.trim()) && styles.disabled]}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                      <MaterialCommunityIcons name="cards-outline" size={18} color="#fff" />
                    )}
                    <Text style={styles.primaryBtnText}>Start the vote</Text>
                  </Pressable>
                </>
              )}

              <Text style={styles.footnote}>
                Everyone needs access to the same Drive file for this to work — share your
                recipe workbook with them first.
              </Text>
            </ScrollView>
          ) : null}

          {/* --- swiping ------------------------------------------------- */}
          {stage === 'swiping' && deck[cardIndex] ? (
            <View style={styles.body}>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{cardIndex + 1} of {deck.length}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${((cardIndex + 1) / deck.length) * 100}%` }]} />
                </View>
              </View>

              <View style={styles.voteCard}>
                <VoteCardArt recipe={deck[cardIndex]} />
                <Text style={styles.voteName} numberOfLines={2}>{deck[cardIndex].name}</Text>
                {deck[cardIndex].comment ? (
                  <Text style={styles.voteNote} numberOfLines={2}>{deck[cardIndex].comment}</Text>
                ) : null}
                <Text style={styles.voteAge}>
                  {lastCooked[deck[cardIndex].name]
                    ? `last cooked ${Math.floor((Date.now() - new Date(lastCooked[deck[cardIndex].name]).getTime()) / 86400000)} days ago`
                    : 'never cooked'}
                </Text>
              </View>

              <View style={styles.swipeRow}>
                <Pressable onPress={() => swipe(false)} disabled={busy} style={[styles.swipeBtn, styles.swipeNo]}>
                  <MaterialCommunityIcons name="close-thick" size={26} color={ERROR} />
                  <Text style={[styles.swipeLabel, { color: ERROR }]}>Not tonight</Text>
                </Pressable>
                <Pressable onPress={() => swipe(true)} disabled={busy} style={[styles.swipeBtn, styles.swipeYes]}>
                  <MaterialCommunityIcons name="heart" size={26} color="#fff" />
                  <Text style={[styles.swipeLabel, { color: '#fff' }]}>Yes please</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* --- results ------------------------------------------------- */}
          {stage === 'results' && result ? (
            <ScrollView style={styles.body}>
              <View style={styles.voterStrip}>
                <MaterialCommunityIcons name="account-group-outline" size={18} color={MUTED} />
                <Text style={styles.voterStripText} numberOfLines={2}>
                  {voterCount ? voterNames.join(', ') : 'nobody yet'}
                </Text>
                <Pressable onPress={refresh} disabled={busy} style={styles.refreshBtn}>
                  {busy
                    ? <ActivityIndicator size="small" color={BROWN} />
                    : <MaterialCommunityIcons name="refresh" size={18} color={BROWN} />}
                </Pressable>
              </View>

              {result.winner ? (
                <>
                  <View style={[styles.matchBanner, voterCount < 2 && styles.matchBannerSolo]}>
                    <MaterialCommunityIcons
                      name={
                        result.unanimous ? 'heart-multiple'
                          : voterCount < 2 ? 'account-clock-outline'
                          : 'gavel'
                      }
                      size={22}
                      color={BROWN}
                    />
                    <Text style={styles.matchBannerText}>
                      {result.unanimous
                        ? `It's a match! All ${voterCount} said yes.`
                        : voterCount < 2
                          ? "You're the first to vote — this is your pick so far. Share the vote and refresh once the others are in."
                          : 'No clean sweep — majority wins.'}
                    </Text>
                  </View>

                  <View style={styles.winnerCard}>
                    <VoteCardArt recipe={result.winner} />
                    <Text style={styles.winnerName}>{result.winner.name}</Text>
                    <Pressable
                      onPress={() => { onCookIt(result.winner); close(); }}
                      style={styles.primaryBtn}
                    >
                      <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Cook it</Text>
                    </Pressable>
                  </View>

                  {result.ranked.length > 1 ? (
                    <>
                      <Text style={styles.runnersHead}>Runners-up</Text>
                      {result.ranked.slice(1, 6).map(entry => (
                        <View key={entry.recipe.name} style={styles.runnerRow}>
                          <Text style={styles.runnerName} numberOfLines={1}>{entry.recipe.name}</Text>
                          <Text style={styles.runnerVotes}>
                            {entry.yes} {entry.yes === 1 ? 'vote' : 'votes'}
                          </Text>
                        </View>
                      ))}
                    </>
                  ) : null}

                  <Text style={styles.footnote}>
                    Results update as others vote — hit refresh once everyone&apos;s had a go.
                  </Text>

                  <Pressable onPress={goBack} style={styles.secondaryBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={18} color={BROWN} />
                    <Text style={styles.secondaryBtnText}>Back to the vote</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.bodyCentered}>
                  <MaterialCommunityIcons name="clock-outline" size={48} color={MUTED} />
                  <Text style={styles.handoffTitle}>Nothing agreed yet</Text>
                  <Text style={styles.lead}>
                    Either nobody said yes to anything, or the others haven&apos;t voted yet.
                  </Text>
                  <Pressable onPress={goBack} style={styles.secondaryBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={18} color={BROWN} />
                    <Text style={styles.secondaryBtnText}>Back to the vote</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// Plain DOM input: this screen is web-only, and RN's TextInput inside a Modal on
// react-native-web is prone to losing focus mid-typing.
const inputStyle = {
  flex: 1,
  border: '1px solid rgba(90,66,48,0.22)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  color: INK,
  background: '#fffdf6',
  outline: 'none',
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.62)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 560, maxHeight: '92%',
    borderRadius: 18, backgroundColor: CREAM, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PAGE_BG, paddingHorizontal: 20, paddingVertical: 15,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headTitle: { color: CREAM, fontSize: 19, fontWeight: '800' },
  iconBtn: { padding: 6, borderRadius: 8 },

  errorBar: { backgroundColor: '#f8d7d7', paddingHorizontal: 20, paddingVertical: 10 },
  errorText: { color: '#7a1f1f', fontSize: 14, fontWeight: '600' },

  body: { padding: 22 },
  bodyCentered: { padding: 28, alignItems: 'center', gap: 14 },
  lead: { color: MUTED, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 6 },
  footnote: { color: MUTED, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 18 },
  warn: { color: ERROR, fontSize: 14, marginBottom: 10, textAlign: 'center' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },

  openVote: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 12, backgroundColor: '#fffdf6',
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.16)', marginBottom: 16,
  },
  openVoteTitle: { color: BROWN, fontSize: 16, fontWeight: '800' },
  openVoteMeta: { color: MUTED, fontSize: 13, marginTop: 2 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ORANGE, paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 10, marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.25)',
  },
  secondaryBtnText: { color: BROWN, fontSize: 15, fontWeight: '700' },
  dangerLink: { alignItems: 'center', paddingVertical: 14 },
  dangerLinkText: { color: ERROR, fontSize: 13.5, fontWeight: '700' },
  disabled: { opacity: 0.45 },

  handoffTitle: { color: BROWN, fontSize: 21, fontWeight: '800', textAlign: 'center' },

  progressRow: { marginBottom: 16, gap: 8 },
  progressText: { color: MUTED, fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(90,66,48,0.14)' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ORANGE },

  voteCard: {
    backgroundColor: '#fffdf6', borderRadius: 14, padding: 18, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.14)',
  },
  cardArt: { width: '100%', height: 190, borderRadius: 10, marginBottom: 14, backgroundColor: SAND },
  cardArtFallback: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  favicon: { width: 44, height: 44, borderRadius: 8 },
  cardDomain: { color: MUTED, fontSize: 13, fontWeight: '700' },
  voteName: { color: BROWN, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  voteNote: { color: INK, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  voteAge: { color: MUTED, fontSize: 12, fontWeight: '700', marginTop: 10, textTransform: 'uppercase' },

  swipeRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  swipeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 16, borderRadius: 12,
  },
  swipeNo: { backgroundColor: '#fffdf6', borderWidth: 2, borderColor: ERROR },
  swipeYes: { backgroundColor: ORANGE },
  swipeLabel: { fontSize: 15, fontWeight: '800' },

  voterStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
    padding: 12, borderRadius: 10, backgroundColor: 'rgba(90,66,48,0.06)',
  },
  voterStripText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: '600' },
  refreshBtn: { padding: 6, borderRadius: 8 },

  matchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: YELLOW,
    padding: 14, borderRadius: 10, marginBottom: 16,
  },
  matchBannerText: { color: BROWN, fontSize: 15, fontWeight: '800', flex: 1, lineHeight: 21 },
  // Muted treatment while waiting on other voters - the celebratory yellow is
  // reserved for an actual match.
  matchBannerSolo: { backgroundColor: 'rgba(90,66,48,0.10)' },
  winnerCard: {
    backgroundColor: '#fffdf6', borderRadius: 14, padding: 18, alignItems: 'center',
    borderWidth: 2, borderColor: ORANGE,
  },
  winnerName: { color: BROWN, fontSize: 26, fontWeight: '800', textAlign: 'center' },

  runnersHead: { color: BROWN, fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  runnerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(90,66,48,0.10)',
  },
  runnerName: { color: INK, fontSize: 15, flex: 1 },
  runnerVotes: { color: MUTED, fontSize: 13, fontWeight: '700' },
});
