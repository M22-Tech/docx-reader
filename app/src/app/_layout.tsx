import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OpenErrorProvider } from '../modules/document/open-error';
import { useShareIntentOpen } from '../modules/document/use-share-intent-open';
import { SettingProvider, useSetting } from '../modules/setting/use-setting';
import { fonts } from '../theme/fonts';
import { ThemeProvider, useTheme } from '../theme/theme-provider';

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready } = useSetting();
  const { colors } = useTheme();
  useShareIntentOpen();

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
    <ShareIntentProvider>
      <SafeAreaProvider>
        <SettingProvider>
          <ThemeProvider>
            <OpenErrorProvider>
              <Navigator />
            </OpenErrorProvider>
          </ThemeProvider>
        </SettingProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
