import * as DocumentPicker from 'expo-document-picker';
import { SUPPORTED_MIME_TYPES } from '../../config/constants';

/** Opens the system file picker, limited to the supported types. Null when the person cancels. The app makes its own copy. */
export async function pickDocument(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...SUPPORTED_MIME_TYPES],
    copyToCacheDirectory: false,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name } : null;
}
