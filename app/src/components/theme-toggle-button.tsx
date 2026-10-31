import { Moon, Sun } from 'lucide-react-native';
import { useTheme } from '../theme/theme-provider';
import { IconButton } from './ui/icon-button';

/** Switches between light and dark; its icon shows the mode it switches to. */
export function ThemeToggleButton() {
  const { mode, toggleMode } = useTheme();
  const toDark = mode === 'light';
  return (
    <IconButton
      icon={toDark ? Moon : Sun}
      accessibilityLabel={toDark ? 'Switch to dark mode' : 'Switch to light mode'}
      onPress={toggleMode}
    />
  );
}
