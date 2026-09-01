// Shopping list, shared by the phone screen and the web screen.
//
// Extracted from WebHome rather than duplicated: the list is plain React Native
// (no DOM, no web-only APIs) and its storage is AsyncStorage, so the same
// component works on both. Keeping one copy means the two can't drift.
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getShoppingList, toggleItem, removeItem, clearChecked, groupByRecipe,
} from '../services/shoppingList';
import { BROWN, ORANGE, CREAM, PAGE_BG, INK, MUTED } from '../theme/webPalette';

export default function ShoppingListDialog({ visible, onClose }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (visible) getShoppingList().then(setItems);
  }, [visible]);

  const groups = groupByRecipe(items);
  const hasChecked = items.some(item => item.checked);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <MaterialCommunityIcons name="cart-outline" size={22} color={CREAM} />
              <Text style={styles.headTitle}>Shopping list</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn}>
              <MaterialCommunityIcons name="close" size={20} color={CREAM} />
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="cart-outline" size={40} color={MUTED} />
              <Text style={styles.emptyText}>
                Nothing on the list yet. Open a recipe and use “Add to list”.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.body}>
              {groups.map(group => (
                <View key={group.recipe} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.recipe}</Text>
                  {group.items.map(item => (
                    <Pressable
                      key={item.id}
                      onPress={async () => setItems(await toggleItem(item.id))}
                      style={styles.row}
                    >
                      <MaterialCommunityIcons
                        name={item.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={20}
                        color={item.checked ? ORANGE : MUTED}
                      />
                      <Text style={[styles.text, item.checked && styles.done]}>{item.text}</Text>
                      <Pressable
                        onPress={async () => setItems(await removeItem(item.id))}
                        hitSlop={8}
                        style={styles.iconBtnDark}
                      >
                        <MaterialCommunityIcons name="close" size={15} color={MUTED} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.foot}>
            {hasChecked ? (
              <Pressable
                onPress={async () => setItems(await clearChecked())}
                style={styles.ghostBtn}
              >
                <Text style={styles.ghostBtnText}>Clear ticked</Text>
              </Pressable>
            ) : <View />}
            <Pressable onPress={onClose} style={styles.primaryBtn}>
              <MaterialCommunityIcons name="check" size={17} color="#fff" />
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  sheet: {
    width: '100%', maxWidth: 560, maxHeight: '88%',
    borderRadius: 16, backgroundColor: CREAM, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PAGE_BG, paddingHorizontal: 18, paddingVertical: 14,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headTitle: { color: CREAM, fontSize: 18, fontWeight: '800' },
  iconBtn: { padding: 6, borderRadius: 8 },
  iconBtnDark: { padding: 6, borderRadius: 8 },

  body: { paddingHorizontal: 18, paddingTop: 14 },
  group: { marginBottom: 16 },
  groupTitle: { color: BROWN, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  text: { flex: 1, color: INK, fontSize: 15, lineHeight: 21 },
  done: { color: MUTED, textDecorationLine: 'line-through' },

  empty: { alignItems: 'center', gap: 12, paddingVertical: 44, paddingHorizontal: 24 },
  emptyText: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, gap: 10,
  },
  ghostBtn: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(90,66,48,0.25)',
  },
  ghostBtnText: { color: BROWN, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: ORANGE, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 9,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
