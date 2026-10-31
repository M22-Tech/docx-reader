import { Image } from 'react-native';
import { APP_NAME } from '../config/constants';
import { useTheme } from '../theme/theme-provider';

const light = require('../../assets/brand/wordmark-light.png') as number;
const dark = require('../../assets/brand/wordmark-dark.png') as number;

// Both images are 1200 x 142 px.
const ASPECT_RATIO = 1200 / 142;

export function Wordmark({ height }: { height: number }) {
  const { mode } = useTheme();
  return (
    <Image
      source={mode === 'dark' ? dark : light}
      accessibilityRole="image"
      accessibilityLabel={APP_NAME}
      resizeMode="contain"
      style={{ height, width: height * ASPECT_RATIO }}
    />
  );
}
