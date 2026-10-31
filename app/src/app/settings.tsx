import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { AArrowDown, AArrowUp, ArrowLeft, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';
import { SettingRow } from '../components/settings/setting-row';
import { ThemeToggleButton } from '../components/theme-toggle-button';
import { AppText } from '../components/ui/app-text';
import { Card } from '../components/ui/card';
import { IconButton } from '../components/ui/icon-button';
import { Screen } from '../components/ui/screen';
import { Toggle } from '../components/ui/toggle';
import { APP_NAME } from '../config/constants';
import { canStepTextSize, stepTextSize } from '../modules/setting/reading-text-size';
import { useSetting } from '../modules/setting/use-setting';
import { deviceFonts } from '../theme/fonts';
import { spacing } from '../theme/theme';
import { useTheme } from '../theme/theme-provider';

const SAMPLE_LINE = 'The quick brown fox jumps over the lazy dog.';

export default function SettingsScreen() {
  const router = useRouter();
  const { mode } = useTheme();
  const { setting, update } = useSetting();
  const fontFamily = deviceFonts[setting.readingFontStyle];

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <IconButton icon={ArrowLeft} accessibilityLabel="Back" labelAlign="left" onPress={() => router.back()} />
          ),
        }}
      />
      <Screen>
        <Card title="Theme">
          <SettingRow label={mode === 'dark' ? 'Dark mode' : 'Light mode'}>
            <ThemeToggleButton />
          </SettingRow>
        </Card>

        <Card title="Default mode">
          <Toggle
            accessibilityLabel="Default mode"
            options={[
              { value: 'layout', label: 'Layout' },
              { value: 'reading', label: 'Reading' },
            ]}
            value={setting.defaultMode}
            onChange={(defaultMode) => update({ defaultMode })}
          />
        </Card>

        <Card title="Reading text">
          <Toggle
            accessibilityLabel="Reading font style"
            options={[
              { value: 'sans', label: 'Sans-serif', labelStyle: { fontFamily: deviceFonts.sans } },
              { value: 'serif', label: 'Serif', labelStyle: { fontFamily: deviceFonts.serif } },
            ]}
            value={setting.readingFontStyle}
            onChange={(readingFontStyle) => update({ readingFontStyle })}
          />
          <SettingRow label={`Text size: ${setting.readingTextSize} px`}>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <IconButton
                icon={AArrowDown}
                accessibilityLabel="Smaller text"
                disabled={!canStepTextSize(setting.readingTextSize, 'smaller')}
                onPress={() => update({ readingTextSize: stepTextSize(setting.readingTextSize, 'smaller') })}
              />
              <IconButton
                icon={AArrowUp}
                accessibilityLabel="Larger text"
                disabled={!canStepTextSize(setting.readingTextSize, 'larger')}
                onPress={() => update({ readingTextSize: stepTextSize(setting.readingTextSize, 'larger') })}
              />
            </View>
          </SettingRow>
          {/* A sample at the real size in px, so it doesn't follow the system font scale. */}
          <AppText allowFontScaling={false} style={{ fontFamily, fontSize: setting.readingTextSize }}>
            {SAMPLE_LINE}
          </AppText>
        </Card>

        <Card title="Recent files">
          <AppText>Keep recent files</AppText>
          <Toggle
            accessibilityLabel="Keep recent files"
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={setting.keepRecentFiles ? 'on' : 'off'}
            onChange={(value) => update({ keepRecentFiles: value === 'on' })}
          />
          <SettingRow label="Clear recent files">
            <IconButton
              icon={Trash2}
              accessibilityLabel="Clear recent files"
              onPress={() => {
                // Clearing recent files, with its confirmation, comes in task 12.
              }}
            />
          </SettingRow>
        </Card>

        <Card title="About">
          <AppText bold>{APP_NAME}</AppText>
          <AppText muted>Version {Constants.expoConfig?.version ?? ''}</AppText>
          <AppText>Your documents never leave this phone.</AppText>
        </Card>
      </Screen>
    </>
  );
}
