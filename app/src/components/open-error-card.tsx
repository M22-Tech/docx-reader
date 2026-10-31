import { X } from 'lucide-react-native';
import { View } from 'react-native';
import type { OpenError } from '../modules/document/open-error';
import { AppText } from './ui/app-text';
import { Card } from './ui/card';
import { FileName } from './ui/file-name';
import { IconButton } from './ui/icon-button';

/** The error from opening a file: the file name, the message and, when `onDismiss` is given, a dismiss button. */
export function OpenErrorCard({ error, onDismiss }: { error: OpenError; onDismiss?: () => void }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }} accessibilityRole="alert">
          <FileName name={error.fileName} bold />
          <AppText>{error.message}</AppText>
        </View>
        {onDismiss ? (
          <IconButton icon={X} accessibilityLabel="Dismiss error" labelAlign="left" onPress={onDismiss} />
        ) : null}
      </View>
    </Card>
  );
}
