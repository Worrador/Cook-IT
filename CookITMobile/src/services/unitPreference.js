// Whether to show recipe amounts in metric, remembered across sessions.
//
// This is a property of the person, not of the recipe: someone who thinks in
// grams thinks in grams for every recipe. Making it a per-recipe toggle meant
// flipping the same switch over and over, so the preference lives here and every
// recipe follows it automatically.
//
// A recipe view can still override it for a single sitting (useful when you want
// to check the original amounts), but the override isn't persisted - reopening
// returns to your default.
import AsyncStorage from '@react-native-async-storage/async-storage';

const UNIT_PREFERENCE_KEY = '@cookit_unit_preference';

export const METRIC = 'metric';
export const ORIGINAL = 'original';

/** @returns {Promise<'metric'|'original'>} */
export async function getUnitPreference() {
  try {
    const stored = await AsyncStorage.getItem(UNIT_PREFERENCE_KEY);
    return stored === METRIC ? METRIC : ORIGINAL;
  } catch (error) {
    console.error('Error reading unit preference:', error);
    return ORIGINAL;
  }
}

export async function setUnitPreference(preference) {
  const value = preference === METRIC ? METRIC : ORIGINAL;
  try {
    await AsyncStorage.setItem(UNIT_PREFERENCE_KEY, value);
  } catch (error) {
    console.error('Error saving unit preference:', error);
  }
  return value;
}

export async function toggleUnitPreference() {
  const current = await getUnitPreference();
  return setUnitPreference(current === METRIC ? ORIGINAL : METRIC);
}
