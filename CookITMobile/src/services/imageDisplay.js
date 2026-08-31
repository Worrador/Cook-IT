// Turns a stored image reference into something an <Image> can actually render.
//
// On native this is trivial: recipeImageService stores images as real files, and
// `imageRef.localFile` is already a URI the Image component understands.
//
// On web it is not. The web filesystem backend (webFileSystem.js) keeps images in
// OPFS/IndexedDB under a *virtual* path like `/CookITWeb/recipe_images/<id>.jpg`.
// That string is a key, not a URL - the browser cannot fetch it, so binding it to
// an <Image> renders nothing. The bytes have to be read out and wrapped in a blob
// URL first, which is what this module does.
//
// Blob URLs are cached per image id, because creating one per render would leak a
// new object URL on every pass. They are revoked by releaseImageUrl/releaseAll.
import { Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import fileSystem from './crossPlatformFileSystem';
import recipeImageService from './recipeImageService';

const IS_WEB = Platform.OS === 'web';

// id -> object URL
const urlCache = new Map();

function base64ToBlob(base64, mime = 'image/jpeg') {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  return new Blob([bytes], { type: mime });
}

/**
 * Resolve a displayable URL for an image reference.
 *
 * Goes through recipeImageService.ensureLocal(), so an image that only exists in
 * Drive (e.g. synced from the phone, never opened here) is downloaded on demand
 * before being displayed.
 *
 * @param {{id: string, localFile?: string, driveFileId?: string}} imageRef
 * @returns {Promise<string|null>} A URI usable by <Image>, or null if unavailable.
 */
export async function getDisplayUrl(imageRef) {
  if (!imageRef) return null;

  if (!IS_WEB) {
    return recipeImageService.ensureLocal(imageRef);
  }

  const cached = urlCache.get(imageRef.id);
  if (cached) return cached;

  try {
    const localPath = await recipeImageService.ensureLocal(imageRef);
    if (!localPath) return null;

    const base64 = await fileSystem.readFile(localPath, 'base64');
    if (!base64) return null;

    const url = URL.createObjectURL(base64ToBlob(base64));
    urlCache.set(imageRef.id, url);
    return url;
  } catch (error) {
    console.error('Could not build a display URL for image', imageRef?.id, error);
    return null;
  }
}

export function releaseImageUrl(id) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

export function releaseAll() {
  for (const id of Array.from(urlCache.keys())) releaseImageUrl(id);
}

/**
 * Hook form for components. Returns null until the URL resolves, so callers
 * should render a placeholder while it is pending.
 */
export function useImageUrl(imageRef) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!imageRef) { setUrl(null); return undefined; }

    getDisplayUrl(imageRef).then(resolved => {
      if (!cancelled) setUrl(resolved);
    });

    // The URL is intentionally NOT revoked here: it is cached and shared between
    // components (a thumbnail and the gallery can show the same image). Revoking
    // on unmount would break the other holder. releaseImageUrl is called when an
    // image is actually deleted instead.
    return () => { cancelled = true; };
  }, [imageRef]);

  return url;
}
