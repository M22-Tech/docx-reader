import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingProvider, useSetting } from '../modules/setting/use-setting';
import { fonts } from '../theme/fonts';
import { ThemeProvider, useTheme } from '../theme/theme-provider';

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready } = useSetting();
  const { colors } = useTheme();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        title: '',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingProvider>
        <ThemeProvider>
          <Navigator />
        </ThemeProvider>
      </SettingProvider>
    </SafeAreaProvider>
  );
}
