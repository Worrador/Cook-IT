// Cross-device vote sessions, stored as a small JSON file in Google Drive.
//
// WHY A SEPARATE FILE, NOT THE WORKBOOK
// Votes are short-lived, small, and written concurrently by several people. The
// recipe workbook is the opposite: large, long-lived, and synced as a whole file
// (last-writer-wins). Putting votes in it would mean a full xlsx upload per swipe
// and would put dinner-voting in the way of the actual recipe data. A tiny
// sidecar JSON keeps the two failure domains apart.
//
// WHY THIS DOESN'T NEED A BACKEND
// A vote doesn't need to be precise or instant - it needs to be roughly right
// within an evening. Each device merges only its OWN entry into the file, so
// concurrent writers touch disjoint keys. Read-modify-write immediately before
// upload keeps the race window to the length of one HTTP round trip; losing that
// race costs one vote, which can simply be recast. That's an acceptable trade for
// not running a server.
//
// Sessions expire after 24 hours, so a stale vote never gets mistaken for
// tonight's, and the file never needs cleaning up.
//
// NOTE: googleDriveService.createFile() cannot be reused here - it hardcodes the
// spreadsheet mime type and calls setDriveFileId(), which would overwrite the
// stored ID of the user's recipe workbook. Hence the direct Drive calls below.
import AsyncStorage from '@react-native-async-storage/async-storage';
import googleDriveService from './googleDriveService';

const VOTE_FILE_NAME = 'CookIT_Vote.json';
const VOTE_FILE_ID_KEY = '@cookit_vote_file_id';
const VOTER_ID_KEY = '@cookit_voter_id';
const VOTER_NAME_KEY = '@cookit_voter_name';

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// --- identity -------------------------------------------------------------
// There is no account system, so a voter is identified by a random ID stored on
// their device. Stable across reloads, distinct per person, and needs no login
// beyond the Drive sign-in they already have.
export async function getVoterId() {
  let id = await AsyncStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await AsyncStorage.setItem(VOTER_ID_KEY, id);
  }
  return id;
}

export async function getVoterName() {
  return (await AsyncStorage.getItem(VOTER_NAME_KEY)) || '';
}

export async function setVoterName(name) {
  await AsyncStorage.setItem(VOTER_NAME_KEY, name);
}

// --- Drive plumbing -------------------------------------------------------

async function findVoteFileId() {
  const cached = await AsyncStorage.getItem(VOTE_FILE_ID_KEY);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: `name = '${VOTE_FILE_NAME}' and trashed = false`,
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
    pageSize: '5',
    orderBy: 'modifiedTime desc',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    corpora: 'allDrives',
  });

  const response = await googleDriveService.makeAuthenticatedRequest(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`
  );
  if (!response.ok) throw new Error(`Vote file lookup failed: ${response.statusText}`);

  const data = await response.json();
  const id = data.files?.[0]?.id || null;
  if (id) await AsyncStorage.setItem(VOTE_FILE_ID_KEY, id);
  return id;
}

// Multipart rather than resumable upload: the payload is a couple of kilobytes,
// and resumable needs the Location response header exposed through CORS, which
// is an unnecessary thing to depend on in a browser for a file this small.
async function createVoteFile(session) {
  const boundary = `cookit${Date.now().toString(36)}`;
  const metadata = { name: VOTE_FILE_NAME, mimeType: 'application/json', parents: ['root'] };

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(session)}\r\n` +
    `--${boundary}--`;

  const response = await googleDriveService.makeAuthenticatedRequest(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!response.ok) throw new Error(`Could not create the vote file: ${response.statusText}`);

  const result = await response.json();
  await AsyncStorage.setItem(VOTE_FILE_ID_KEY, result.id);
  return result.id;
}

async function overwriteVoteFile(fileId, session) {
  const response = await googleDriveService.makeAuthenticatedRequest(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }
  );
  if (!response.ok) throw new Error(`Could not save the vote: ${response.statusText}`);
}

/**
 * Read the current session, or null when there isn't one, it can't be parsed, or
 * it has expired. An expired session is treated as absent so a new vote simply
 * replaces it.
 */
export async function fetchSession() {
  const fileId = await findVoteFileId();
  if (!fileId) return null;

  const response = await googleDriveService.makeAuthenticatedRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`
  );
  if (!response.ok) {
    // A 404 means the file was deleted or unshared - drop the cached ID so the
    // next call searches again rather than failing forever.
    if (response.status === 404) await AsyncStorage.removeItem(VOTE_FILE_ID_KEY);
    return null;
  }

  let session;
  try {
    session = JSON.parse(await response.text());
  } catch (_error) {
    return null; // Corrupt file: treat as no session, next create overwrites it.
  }

  if (!session?.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

/**
 * Start a new vote, replacing any existing one. The deck is fixed at creation so
 * every device votes on the same cards in the same order.
 */
export async function createSession(deck, creatorName) {
  const now = Date.now();
  const session = {
    sessionId: `s_${now.toString(36)}`,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    createdBy: creatorName || 'Someone',
    deck: deck.map(r => r.name),
    votes: {},
  };

  const fileId = await findVoteFileId();
  if (fileId) {
    await overwriteVoteFile(fileId, session);
  } else {
    await createVoteFile(session);
  }
  return session;
}

/**
 * Record this device's votes into the shared session.
 *
 * Re-reads the file immediately before writing and merges only this voter's key,
 * so a concurrent submission from another device is preserved rather than
 * overwritten. Not atomic - two submissions landing inside the same round trip
 * can still lose one - but the loser can just vote again.
 */
export async function submitVotes(sessionId, approved, voterName) {
  const [fileId, voterId] = await Promise.all([findVoteFileId(), getVoterId()]);
  if (!fileId) throw new Error('That vote has ended.');

  const latest = await fetchSession();
  if (!latest || latest.sessionId !== sessionId) {
    throw new Error('That vote has ended or been replaced by a newer one.');
  }

  latest.votes = {
    ...latest.votes,
    [voterId]: {
      name: voterName || 'Someone',
      approved,
      updatedAt: new Date().toISOString(),
    },
  };

  await overwriteVoteFile(fileId, latest);
  return latest;
}

/** Convert a stored session's votes into the shape tallyVotes() expects. */
export function votesForTally(session) {
  const out = {};
  for (const [voterId, entry] of Object.entries(session?.votes || {})) {
    // Keyed by voter ID, not display name, so two people called "Mum" stay distinct.
    out[`${voterId}:${entry.name}`] = entry.approved || [];
  }
  return out;
}
