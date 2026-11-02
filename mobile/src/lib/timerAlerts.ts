// Cook-mode timer alerts: a local notification scheduled for when a timer ends,
// so it still goes off if the app is in the background or the phone is locked.
// Local notifications work in Expo Go (no push setup needed). Everything here is
// best effort: if permission is denied the in-app countdown and vibration still work.
//
// The module is loaded the first time a timer starts, not at app launch: importing
// it in Expo Go logs warnings about remote push (which this doesn't use).
import { AppState, Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL = 'cook-timers';
let ready: Promise<boolean> | null = null;
let Notifications: NotificationsModule | null = null;

function setup(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  ready ??= (async () => {
    try {
      Notifications = await import('expo-notifications');
      // While the app is open, cook mode already shows "Time's up" and vibrates.
      Notifications.setNotificationHandler({
        handleNotification: async () => {
          const open = AppState.currentState === 'active';
          return { shouldShowBanner: !open, shouldShowList: true, shouldPlaySound: !open, shouldSetBadge: false };
        },
      });
      if (Platform.OS === 'android') {
        // Android 13+ only shows the permission prompt once a channel exists.
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: 'Cooking timers',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 400, 200, 400],
        });
      }
      const current = await Notifications.getPermissionsAsync();
      if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
      if (!current.canAskAgain) return false;
      const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      return asked.granted;
    } catch {
      return false;
    }
  })();
  return ready;
}

/** Schedules the "time's up" alert. Returns its id, or null if alerts aren't allowed. */
export async function scheduleTimerAlert(endsAt: number, recipeName: string, step: number): Promise<string | null> {
  if (!(await setup()) || !Notifications) return null;
  const seconds = Math.round((endsAt - Date.now()) / 1000);
  if (seconds < 1) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: "Time's up", body: `Step ${step + 1} of ${recipeName}`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export function cancelTimerAlert(id: string | null | undefined) {
  if (!id || !Notifications) return;
  Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
