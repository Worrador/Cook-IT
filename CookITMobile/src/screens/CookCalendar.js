// A month calendar of what was cooked when, built from the cook-event log in
// storage.js (getCookHistory).
//
// A caveat worth knowing when reading this screen: history before the log
// existed was backfilled from LAST_COOKED_DATES, which only ever held the most
// recent date per recipe. So older months show at most one entry per recipe even
// if it was cooked many times. Backfilled entries are marked so the UI can be
// honest about it rather than implying a complete record.
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import DialogShell from '../components/DialogShell';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCookHistory } from '../utils/storage';
import { BROWN, ORANGE, YELLOW, CREAM, PAGE_BG, INK, MUTED } from '../theme/webPalette';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Local date key (not toISOString, which would shift an evening cook into the
// next day for anyone east of UTC).
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday-first offset for the 1st of the month.
function leadingBlanks(year, month) {
  const weekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (weekday + 6) % 7;
}

export default function CookCalendar({ visible, onClose }) {
  const [history, setHistory] = useState([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (visible) {
      getCookHistory().then(setHistory);
      setSelected(null);
    }
  }, [visible]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const entry of history) {
      if (!entry?.date) continue;
      const key = dayKey(entry.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    return map;
  }, [history]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = leadingBlanks(year, month);
  const todayKey = dayKey(new Date());

  const monthCount = useMemo(() => {
    let total = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      total += (byDay.get(dayKey(new Date(year, month, day))) || []).length;
    }
    return total;
  }, [byDay, year, month, daysInMonth]);

  const step = (delta) => {
    setCursor(new Date(year, month + delta, 1));
    setSelected(null);
  };

  const selectedEntries = selected ? (byDay.get(selected) || []) : [];

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title="Cooking history"
      icon="calendar-month-outline"
    >
          <ScrollView style={styles.body}>
            <View style={styles.monthBar}>
              <Pressable onPress={() => step(-1)} style={styles.monthBtn}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={BROWN} />
              </Pressable>
              <View style={styles.monthLabelWrap}>
                <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
                <Text style={styles.monthMeta}>
                  {monthCount === 0 ? 'nothing cooked' : `${monthCount} ${monthCount === 1 ? 'meal' : 'meals'}`}
                </Text>
              </View>
              <Pressable onPress={() => step(1)} style={styles.monthBtn}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={BROWN} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map(day => (
                <Text key={day} style={styles.weekday}>{day}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {Array.from({ length: blanks }).map((_, i) => (
                <View key={`blank-${i}`} style={styles.cell} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = dayKey(new Date(year, month, day));
                const entries = byDay.get(key) || [];
                const isToday = key === todayKey;
                const isSelected = key === selected;

                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelected(entries.length ? key : null)}
                    style={[
                      styles.cell,
                      entries.length > 0 && styles.cellCooked,
                      isToday && styles.cellToday,
                      isSelected && styles.cellSelected,
                    ]}
                  >
                    <Text style={[styles.cellDay, entries.length > 0 && styles.cellDayCooked]}>
                      {day}
                    </Text>
                    {entries.length > 0 ? (
                      <View style={styles.dotRow}>
                        {entries.slice(0, 3).map((_, d) => <View key={d} style={styles.dot} />)}
                        {entries.length > 3 ? <Text style={styles.more}>+</Text> : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {selected ? (
              <View style={styles.dayPanel}>
                <Text style={styles.dayPanelTitle}>
                  {new Date(selected).toLocaleDateString(undefined, {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </Text>
                {selectedEntries.map((entry, i) => (
                  <View key={`${entry.name}-${i}`} style={styles.entryRow}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={ORANGE} />
                    <Text style={styles.entryName}>{entry.name}</Text>
                    {entry.backfilled ? (
                      <Text style={styles.entryTag}>approx.</Text>
                    ) : (
                      <Text style={styles.entryTime}>
                        {new Date(entry.date).toLocaleTimeString(undefined, {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>
                {history.length === 0
                  ? 'Nothing recorded yet. Cook something and it will show up here.'
                  : 'Tap a highlighted day to see what was cooked.'}
              </Text>
            )}

            {history.some(e => e.backfilled) ? (
              <Text style={styles.footnote}>
                Entries marked “approx.” were reconstructed from the single most recent
                date the app used to keep per recipe — the only history that existed
                before this view. Everything cooked from now on is logged exactly.
              </Text>
            ) : null}
          </ScrollView>
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.62)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 560, maxHeight: '90%',
    borderRadius: 18, backgroundColor: CREAM, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PAGE_BG, paddingHorizontal: 20, paddingVertical: 15,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headTitle: { color: CREAM, fontSize: 19, fontWeight: '800' },
  iconBtn: { padding: 6, borderRadius: 8 },

  body: { padding: 18 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthBtn: { padding: 8, borderRadius: 999 },
  monthLabelWrap: { alignItems: 'center' },
  monthLabel: { color: BROWN, fontSize: 19, fontWeight: '800' },
  monthMeta: { color: MUTED, fontSize: 13, marginTop: 2 },

  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', color: MUTED, fontSize: 12, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Fixed height rather than aspectRatio: 1. Square cells at this dialog width
  // made each row ~85px, so six rows plus the month bar and day panel overflowed
  // the viewport on a laptop. A month should fit without scrolling.
  cell: {
    width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, gap: 2,
  },
  cellCooked: { backgroundColor: 'rgba(216,106,58,0.14)' },
  cellToday: { borderWidth: 2, borderColor: YELLOW },
  cellSelected: { backgroundColor: ORANGE },
  cellDay: { color: MUTED, fontSize: 14, fontWeight: '600' },
  cellDayCooked: { color: BROWN, fontWeight: '800' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ORANGE },
  more: { color: ORANGE, fontSize: 10, fontWeight: '800' },

  dayPanel: {
    marginTop: 18, padding: 16, borderRadius: 12, backgroundColor: '#fffdf6',
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.14)',
  },
  dayPanelTitle: { color: BROWN, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  entryName: { flex: 1, color: INK, fontSize: 15 },
  entryTime: { color: MUTED, fontSize: 13, fontWeight: '600' },
  entryTag: { color: MUTED, fontSize: 12, fontStyle: 'italic' },

  hint: { color: MUTED, fontSize: 14, textAlign: 'center', marginTop: 20, lineHeight: 21 },
  footnote: { color: MUTED, fontSize: 12.5, lineHeight: 19, marginTop: 18, textAlign: 'center' },
});
