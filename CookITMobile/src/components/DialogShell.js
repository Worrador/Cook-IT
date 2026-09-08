// The single dialog chrome for the whole app.
//
// The vote, calendar and shopping-list dialogs had converged on one treatment -
// a dark header bar with an icon, title, and close button, over a cream body -
// while Help, Buy-Coffee and the web Sheet each did something slightly
// different. That reads as three apps rather than one. This is that treatment,
// extracted, so every dialog shares it and new ones can't drift.
//
// Plain React Native throughout, so it works on both the phone and the web build.
import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CREAM, PAGE_BG, YELLOW } from '../theme/webPalette';

/**
 * @param {string}  [icon]     MaterialCommunityIcons name shown left of the title.
 * @param {node}    [footer]   Action row pinned below the body.
 * @param {node}    [onBack]   When supplied, a back arrow replaces the header icon.
 * @param {number}  [width]    Max width; the default suits most dialogs.
 */
export default function DialogShell({
  visible, onClose, title, icon, children, footer, onBack, width = 560,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { maxWidth: width }]}>
          <View style={styles.head}>
            <View style={styles.headLeft}>
              {onBack ? (
                <Pressable onPress={onBack} style={styles.iconBtn} hitSlop={8}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color={CREAM} />
                </Pressable>
              ) : icon ? (
                <MaterialCommunityIcons name={icon} size={22} color={YELLOW} />
              ) : null}
              <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={20} color={CREAM} />
            </Pressable>
          </View>

          <View style={styles.body}>{children}</View>

          {footer ? <View style={styles.foot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(46,34,22,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  sheet: {
    width: '100%', maxHeight: '90%',
    borderRadius: 18, backgroundColor: CREAM, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PAGE_BG, paddingHorizontal: 18, paddingVertical: 14, gap: 10,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headTitle: { color: CREAM, fontSize: 18, fontWeight: '800', flex: 1 },
  iconBtn: { padding: 5, borderRadius: 8 },
  // flexShrink lets a long body scroll inside maxHeight instead of pushing the
  // footer off-screen - the bug that made the Help dialog unscrollable.
  body: { flexShrink: 1 },
  // Wraps because a dialog can carry three or more actions, which is wider than
  // a phone-width sheet - and the sheet's overflow: hidden clips whatever spills
  // rather than letting it scroll into view.
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, padding: 16, flexWrap: 'wrap',
  },
});
