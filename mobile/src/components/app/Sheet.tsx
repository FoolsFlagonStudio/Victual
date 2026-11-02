import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/themeContext';

/** Height of the on-screen keyboard, 0 when it's hidden. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Bottom sheet over a dimmed backdrop. Tapping the backdrop closes it. While the
 * keyboard is up the sheet grows to the full screen and its content sits above the
 * keyboard, so what you type into (and its results) stay visible.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { height: screen } = useWindowDimensions();
  const typing = visible && keyboard > 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
        </Pressable>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: typing ? keyboard + 8 : insets.bottom + 16 },
            typing && { height: screen - insets.top - 8, maxHeight: undefined },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text variant="h3" color="selected" accessibilityRole="header" style={{ flex: 1, fontFamily: fontFamily('ui', 600) }}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon.close size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1, flexGrow: typing ? 1 : 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Two-button confirm inside a Sheet. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirm,
  onConfirm,
  onClose,
  danger,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Text variant="body" color="text">
        {body}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 22, marginTop: 24, alignItems: 'center' }}>
        <Text variant="buttonLarge" color="subtle" onPress={onClose} accessibilityRole="button">
          CANCEL
        </Text>
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: danger ? colors.danger : colors.primary }]}
        >
          <Text variant="buttonLarge" style={{ color: danger ? '#FFFFFF' : colors.onPrimary }}>
            {confirm.toUpperCase()}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)', marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  confirm: { height: 36, paddingHorizontal: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
