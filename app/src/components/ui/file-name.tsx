import type { StyleProp, TextStyle } from 'react-native';
import { cutName } from '../../modules/recent/format-recent';
import { AppText } from './app-text';

interface FileNameProps {
  name: string;
  bold?: boolean;
  style?: StyleProp<TextStyle>;
}

/** A file name on one line, cut in the middle so the extension stays visible. */
export function FileName({ name, bold, style }: FileNameProps) {
  return (
    <AppText bold={bold} numberOfLines={1} ellipsizeMode="middle" style={style}>
      {cutName(name)}
    </AppText>
  );
}
