import { Alert } from 'react-native';

/** A confirmation dialog: text buttons are allowed here, where an icon can't say it. */
export function confirm(title: string, confirmLabel: string, onConfirm: () => void): void {
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
