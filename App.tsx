import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useFonts } from 'expo-font';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_700Bold,
} from '@expo-google-fonts/noto-sans-jp';
import {
  Alert,
  Animated,
  Image,
  ImageSourcePropType,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

declare const process: {
  env?: Record<string, string | undefined>;
};

type Screen =
  | 'check'
  | 'history'
  | 'savings'
  | 'analysis'
  | 'settings';
type Category = 'food' | 'fashion' | 'gadget' | 'hobby' | 'other';
type PriceRange =
  | 'under_500'
  | '501_1000'
  | '1001_2000'
  | '2001_5000'
  | '5001_10000'
  | '10001_20000'
  | '20001_30000'
  | 'over_30001';
type Trigger =
  | 'sale'
  | 'sns'
  | 'impulse'
  | 'wanted_long_time'
  | 'necessary';
type Action = 'buy' | 'skip' | 'hold';

type ResultLabel =
  | '後悔しにくい買い物'
  | '少し時間を置くとよい買い物'
  | '保留推奨'
  | '後悔リスク高め';

type ResultComment =
  | '後悔しにくい買い物です。予算内で、使う場面が思い浮かぶなら前向きに考えてよさそうです。'
  | '少し時間を置くとよい買い物です。今日すぐ必要か、明日も欲しいと思うかだけ確認しましょう。'
  | '保留推奨です。欲しい理由より、使う場面と置き場所を先に確認してみましょう。'
  | '後悔リスク高めです。今は買わず、24時間置いてからもう一度考えるのがおすすめです。';

type CheckInput = {
  category: Category | null;
  customCategory: string;
  customPriceAmount: string;
  priceRange: PriceRange | null;
  customTrigger: string;
  trigger: Trigger | null;
};

type CheckResult = {
  score: number;
  label: ResultLabel;
  comment: ResultComment;
};

type PurchaseCheck = {
  id: string;
  createdAt: string;
  category: Category;
  customCategory?: string;
  customPriceAmount?: number;
  customTrigger?: string;
  priceRange: PriceRange;
  trigger: Trigger;
  score: number;
  label: ResultLabel;
  comment: ResultComment;
  action: Action;
  estimatedSavedAmount: number;
};

type Option<T extends string> = {
  label: string;
  value: T;
};

const BASE_SCORE = 70;
const STORAGE_KEY = 'shoudo_stop_purchase_checks';
const APP_VERSION = '1.0.0';
const TERMS_URL = 'https://kk-0526.github.io/Shoudo/TERMS';
const PRIVACY_URL = 'https://kk-0526.github.io/Shoudo/PRIVACY';
const CONTACT_URL = 'https://forms.gle/ZPp87XxuSK6pNpTX6';
const REVENUECAT_ENTITLEMENT_ID = 'pro';
const REVENUECAT_PRODUCT_ID = 'shoudo_stop_pro_lifetime';
const REVENUECAT_IOS_API_KEY =
  process.env?.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';

const COLORS = {
  main: '#3E5C76',
  sub: '#C8D6E5',
  background: '#FCFBF8',
  text: '#222222',
  accent: '#C97B63',
} as const;

const FONTS = {
  heading: 'NotoSansJP_700Bold',
  body: 'NotoSansJP_400Regular',
  number: 'NotoSansJP_500Medium',
} as const;

const BASE_RADIUS = 12;
const BASE_SPACE = 16;
const LOGO_SOURCE = require('./assets/logo-quiet-ledger.png') as ImageSourcePropType;
const TAB_HOME_SOURCE = require('./assets/tab-home-clean.png') as ImageSourcePropType;
const TAB_HISTORY_SOURCE = require('./assets/tab-history-clean.png') as ImageSourcePropType;
const TAB_ANALYSIS_SOURCE = require('./assets/tab-analysis-clean.png') as ImageSourcePropType;
const TAB_SETTINGS_SOURCE = require('./assets/tab-settings-clean.png') as ImageSourcePropType;
const FEATURE_RECEIPT_SOURCE = require('./assets/feature-receipt-clean.png') as ImageSourcePropType;
const FEATURE_YEN_SOURCE = require('./assets/feature-yen-clean.png') as ImageSourcePropType;

type RevenueCatCustomerInfo = Awaited<ReturnType<typeof Purchases.getCustomerInfo>>;
type RevenueCatPackage = Parameters<typeof Purchases.purchasePackage>[0];

const categories: Option<Category>[] = [
  { label: '食品', value: 'food' },
  { label: 'ファッション', value: 'fashion' },
  { label: 'ガジェット', value: 'gadget' },
  { label: '趣味', value: 'hobby' },
  { label: 'その他', value: 'other' },
];

const priceRanges: Option<PriceRange>[] = [
  { label: '〜500円', value: 'under_500' },
  { label: '501〜1,000円', value: '501_1000' },
  { label: '1,001〜2,000円', value: '1001_2000' },
  { label: '2,001〜5,000円', value: '2001_5000' },
  { label: '5,001〜10,000円', value: '5001_10000' },
  { label: '10,001〜20,000円', value: '10001_20000' },
  { label: '20,001〜30,000円', value: '20001_30000' },
  { label: '30,001円以上', value: 'over_30001' },
];

const triggers: Option<Trigger>[] = [
  { label: 'セール', value: 'sale' },
  { label: 'SNS', value: 'sns' },
  { label: '衝動', value: 'impulse' },
  { label: 'ずっと欲しかった', value: 'wanted_long_time' },
  { label: '必要になった', value: 'necessary' },
];

const categoryScores: Record<Category, number> = {
  food: 5,
  fashion: -5,
  gadget: -5,
  hobby: 0,
  other: 0,
};

const priceScores: Record<PriceRange, number> = {
  under_500: 5,
  '501_1000': 5,
  '1001_2000': 0,
  '2001_5000': 0,
  '5001_10000': -10,
  '10001_20000': -10,
  '20001_30000': -20,
  over_30001: -20,
};

const triggerScores: Record<Trigger, number> = {
  sale: -15,
  sns: -20,
  impulse: -25,
  wanted_long_time: 15,
  necessary: 20,
};

const estimatedSavedAmounts: Record<PriceRange, number> = {
  under_500: 500,
  '501_1000': 1000,
  '1001_2000': 2000,
  '2001_5000': 5000,
  '5001_10000': 10000,
  '10001_20000': 20000,
  '20001_30000': 30000,
  over_30001: 30000,
};

const actionLabels: Record<Action, string> = {
  buy: '買う',
  skip: 'やめる',
  hold: '保留',
};

const historyActionLabels: Record<Action, string> = {
  buy: '買った',
  skip: '我慢した',
  hold: '保留した',
};

const historyActionColors: Record<Action, string> = {
  buy: COLORS.main,
  skip: '#2F7D5C',
  hold: COLORS.accent,
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function calculateScore(input: {
  category: Category;
  priceRange: PriceRange;
  trigger: Trigger;
}): number {
  return clampScore(
    BASE_SCORE +
      categoryScores[input.category] +
      priceScores[input.priceRange] +
      triggerScores[input.trigger],
  );
}

function getResult(score: number): CheckResult {
  if (score >= 80) {
    return {
      score,
      label: '後悔しにくい買い物',
      comment:
        '後悔しにくい買い物です。予算内で、使う場面が思い浮かぶなら前向きに考えてよさそうです。',
    };
  }

  if (score >= 60) {
    return {
      score,
      label: '少し時間を置くとよい買い物',
      comment:
        '少し時間を置くとよい買い物です。今日すぐ必要か、明日も欲しいと思うかだけ確認しましょう。',
    };
  }

  if (score >= 40) {
    return {
      score,
      label: '保留推奨',
      comment:
        '保留推奨です。欲しい理由より、使う場面と置き場所を先に確認してみましょう。',
    };
  }

  return {
    score,
    label: '後悔リスク高め',
    comment:
      '後悔リスク高めです。今は買わず、24時間置いてからもう一度考えるのがおすすめです。',
  };
}

function getOptionLabel<T extends string>(options: Option<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getCategoryLabel(category: Category, customCategory?: string): string {
  const trimmedCustomCategory = customCategory?.trim();
  if (category === 'other' && trimmedCustomCategory) {
    return trimmedCustomCategory;
  }
  return getOptionLabel(categories, category);
}

function parseCustomPriceAmount(value: string): number | null {
  const normalizedValue = value.replace(/[^\d]/g, '');
  if (!normalizedValue) return null;
  const amount = Number(normalizedValue);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getPriceRangeFromAmount(amount: number): PriceRange {
  if (amount <= 500) return 'under_500';
  if (amount <= 1000) return '501_1000';
  if (amount <= 2000) return '1001_2000';
  if (amount <= 5000) return '2001_5000';
  if (amount <= 10000) return '5001_10000';
  if (amount <= 20000) return '10001_20000';
  if (amount <= 30000) return '20001_30000';
  return 'over_30001';
}

function getEffectivePriceRange(input: CheckInput): PriceRange | null {
  const customAmount = parseCustomPriceAmount(input.customPriceAmount);
  if (customAmount !== null) return getPriceRangeFromAmount(customAmount);
  return input.priceRange;
}

function getPriceLabel(priceRange: PriceRange, customPriceAmount?: number): string {
  if (customPriceAmount !== undefined) {
    return `${customPriceAmount.toLocaleString()}円`;
  }
  return getOptionLabel(priceRanges, priceRange);
}

function getTriggerLabel(trigger: Trigger, customTrigger?: string): string {
  void customTrigger;
  return getOptionLabel(triggers, trigger);
}

async function loadChecks(): Promise<PurchaseCheck[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveFreeCheck(check: PurchaseCheck): Promise<number> {
  const checks = await loadChecks();
  const nextChecks = [check, ...checks];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextChecks));
  return nextChecks.length;
}

function hasActiveProEntitlement(customerInfo: RevenueCatCustomerInfo): boolean {
  return customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID] !== undefined;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    [FONTS.body]: NotoSansJP_400Regular,
    [FONTS.number]: NotoSansJP_500Medium,
    [FONTS.heading]: NotoSansJP_700Bold,
  });
  const [screen, setScreen] = useState<Screen>('check');
  const [input, setInput] = useState<CheckInput>({
    category: null,
    customCategory: '',
    customPriceAmount: '',
    priceRange: 'under_500',
    customTrigger: '',
    trigger: null,
  });
  const [customPriceDraft, setCustomPriceDraft] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [checks, setChecks] = useState<PurchaseCheck[]>([]);
  const [isProPreview, setIsProPreview] = useState(false);
  const [isRevenueCatPro, setIsRevenueCatPro] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<RevenueCatPackage | null>(
    null,
  );
  const resultSlideY = useRef(new Animated.Value(24)).current;

  const hasProAccess = isProPreview || isRevenueCatPro;

  useEffect(() => {
    void refreshChecks();
    void initializeRevenueCat();
  }, []);

  useEffect(() => {
    if (!result) return;
    resultSlideY.setValue(24);
    Animated.timing(resultSlideY, {
      duration: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [result, resultSlideY]);

  const effectivePriceRange = getEffectivePriceRange(input);
  const hasCustomPrice = parseCustomPriceAmount(input.customPriceAmount) !== null;
  const hasCustomPriceDraft = customPriceDraft.replace(/[^\d]/g, '').length > 0;
  const isCustomPricePriority = hasCustomPrice || hasCustomPriceDraft;
  const canJudge = Boolean(input.category && effectivePriceRange && input.trigger);

  const estimatedSavedAmount = useMemo(() => {
    if (effectivePriceRange === null) return 0;
    const customAmount = parseCustomPriceAmount(input.customPriceAmount);
    return customAmount ?? estimatedSavedAmounts[effectivePriceRange];
  }, [effectivePriceRange, input.customPriceAmount]);

  const savingsStats = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const skippedChecks = checks.filter((check) => check.action === 'skip');
    const monthlySkippedChecks = skippedChecks.filter((check) =>
      check.createdAt.startsWith(currentMonth),
    );
    const totalSaved = skippedChecks.reduce(
      (sum, check) => sum + check.estimatedSavedAmount,
      0,
    );
    const monthlySaved = monthlySkippedChecks.reduce(
      (sum, check) => sum + check.estimatedSavedAmount,
      0,
    );
    const averageScore =
      checks.length === 0
        ? 0
        : Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);

    return {
      averageScore,
      monthlySaved,
      skipCount: skippedChecks.length,
      totalSaved,
    };
  }, [checks]);

  const patternStats = useMemo(() => {
    const categoryCounts = countBy(checks, 'category');
    const triggerCounts = countBy(checks, 'trigger');
    const highRiskCount = checks.filter((check) => check.score < 40).length;
    const topTrigger = getTopCount(triggerCounts);

    return {
      categoryCounts,
      highRiskCount,
      topTrigger,
      triggerCounts,
    };
  }, [checks]);

  async function refreshChecks() {
    const storedChecks = await loadChecks();
    setChecks(storedChecks);
    setSavedCount(storedChecks.length);
  }

  async function initializeRevenueCat() {
    if (Platform.OS === 'web') {
      setPurchaseMessage('WebではIAPを実行できません。Development Buildで確認します。');
      return;
    }

    if (Platform.OS !== 'ios') {
      setPurchaseMessage('Android対応はMVP後に追加します。');
      return;
    }

    if (!REVENUECAT_IOS_API_KEY) {
      setPurchaseMessage('RevenueCat iOS APIキー未設定です。');
      return;
    }

    try {
      await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
      const customerInfo = await Purchases.getCustomerInfo();
      setIsRevenueCatPro(hasActiveProEntitlement(customerInfo));

      const offerings = await Purchases.getOfferings();
      const currentOffering = offerings.current;
      const packageToPurchase =
        currentOffering?.availablePackages.find(
          (candidatePackage) =>
            candidatePackage.product.identifier === REVENUECAT_PRODUCT_ID,
        ) ??
        currentOffering?.lifetime ??
        currentOffering?.availablePackages[0] ??
        null;

      setLifetimePackage(packageToPurchase);
      setPurchaseMessage(
        packageToPurchase
          ? 'RevenueCat連携準備完了'
          : 'RevenueCat Offeringに購入商品がありません。',
      );
    } catch {
      setPurchaseMessage('RevenueCat初期化に失敗しました。設定を確認してください。');
    }
  }

  async function purchaseLifetime() {
    if (!lifetimePackage) {
      setPurchaseMessage('購入商品を取得できていません。');
      return;
    }

    setIsPurchasing(true);
    setPurchaseMessage(null);
    try {
      const { customerInfo } = await Purchases.purchasePackage(lifetimePackage);
      const nextIsPro = hasActiveProEntitlement(customerInfo);
      setIsRevenueCatPro(nextIsPro);
      setPurchaseMessage(
        nextIsPro ? '有料版が有効になりました。' : '購入状態を確認できませんでした。',
      );
    } catch (error: unknown) {
      const purchaseError = error as { message?: string; userCancelled?: boolean };
      setPurchaseMessage(
        purchaseError.userCancelled
          ? '購入をキャンセルしました。'
          : '購入に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setIsPurchasing(false);
    }
  }

  async function restoreLifetimePurchase() {
    setIsPurchasing(true);
    setPurchaseMessage(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const nextIsPro = hasActiveProEntitlement(customerInfo);
      setIsRevenueCatPro(nextIsPro);
      setPurchaseMessage(
        nextIsPro
          ? '購入を復元しました。'
          : '復元できる購入が見つかりませんでした。',
      );
    } catch {
      setPurchaseMessage('購入復元に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsPurchasing(false);
    }
  }

  function resetCheck() {
    setInput({
      category: null,
      customCategory: '',
      customPriceAmount: '',
      priceRange: 'under_500',
      customTrigger: '',
      trigger: null,
    });
    setCustomPriceDraft('');
    setResult(null);
    setSelectedAction(null);
    setScreen('check');
  }

  function confirmCustomPrice() {
    const normalizedAmount = parseCustomPriceAmount(customPriceDraft);
    if (normalizedAmount === null) {
      setCustomPriceDraft('');
      setInput((current) => ({ ...current, customPriceAmount: '' }));
      return;
    }
    const normalizedPrice = String(normalizedAmount);
    setCustomPriceDraft(normalizedPrice);
    setInput((current) => ({
      ...current,
      customPriceAmount: normalizedPrice,
      priceRange: getPriceRangeFromAmount(normalizedAmount),
    }));
  }

  function judge() {
    if (!input.category || !effectivePriceRange || !input.trigger) return;
    const score = calculateScore({
      category: input.category,
      priceRange: effectivePriceRange,
      trigger: input.trigger,
    });
    setResult(getResult(score));
    setSelectedAction(null);
  }

  function recordAction(action: Action) {
    if (!result || !input.category || !effectivePriceRange || !input.trigger) return;
    const customPriceAmount = parseCustomPriceAmount(input.customPriceAmount);
    const check: PurchaseCheck = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      category: input.category,
      customCategory:
        input.category === 'other' ? input.customCategory.trim() || undefined : undefined,
      customPriceAmount: customPriceAmount ?? undefined,
      priceRange: effectivePriceRange,
      trigger: input.trigger,
      customTrigger: undefined,
      score: result.score,
      label: result.label,
      comment: result.comment,
      action,
      estimatedSavedAmount: action === 'skip' ? estimatedSavedAmount : 0,
    };
    void saveFreeCheck(check)
      .then(() => refreshChecks())
      .then(() => resetCheck());
  }

  if (!fontsLoaded) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {screen === 'check' && (
        <ScrollView contentContainerStyle={styles.container}>
          <BrandHeader onSettingsPress={() => setScreen('settings')} />
          <Header title="衝動買いチェック" />
          <View style={styles.ledgerPanel}>
            <QuestionStep
              number="1"
              title="カテゴリ"
              value={
                input.category
                  ? getCategoryLabel(input.category, input.customCategory)
                  : ''
              }
            >
              <OptionChips
                options={categories}
                selected={input.category}
                onSelect={(category) =>
                  setInput((current) => ({
                    ...current,
                    category,
                    customCategory: category === 'other' ? current.customCategory : '',
                  }))
                }
              />
              {input.category === 'other' && (
                <>
                  <TextInput
                    style={styles.ledgerInput}
                    value={input.customCategory}
                    onChangeText={(customCategory) =>
                      setInput((current) => ({ ...current, customCategory }))
                    }
                  />
                </>
              )}
            </QuestionStep>

            <QuestionStep
              number="2"
              title="金額"
              value={
                input.customPriceAmount
                  ? `${input.customPriceAmount}円`
                  : input.priceRange
                    ? getOptionLabel(priceRanges, input.priceRange)
                    : ''
              }
            >
              <View style={[styles.pickerFrame, isCustomPricePriority && styles.disabledPickerFrame]}>
                <Picker
                  itemStyle={styles.pickerItem}
                  selectedValue={input.priceRange ?? 'under_500'}
                  enabled={!isCustomPricePriority}
                  onValueChange={(priceRange) =>
                    setInput((current) => ({
                      ...current,
                      priceRange,
                    }))
                  }
                >
                  {priceRanges.map((priceRange) => (
                    <Picker.Item
                      key={priceRange.value}
                      label={priceRange.label}
                      value={priceRange.value}
                    />
                  ))}
                </Picker>
              </View>
              <TextInput
                inputMode="numeric"
                keyboardType="number-pad"
                style={styles.ledgerInput}
                value={customPriceDraft}
                onChangeText={(customPriceAmount) => {
                  const nextDraft = customPriceAmount.replace(/[^\d]/g, '');
                  setCustomPriceDraft(nextDraft);
                  if (!nextDraft) {
                    setInput((current) => ({ ...current, customPriceAmount: '' }));
                  }
                }}
                placeholder="例：1500"
                placeholderTextColor={COLORS.main}
              />
              <Pressable style={styles.inlineConfirmButton} onPress={confirmCustomPrice}>
                <Text style={styles.inlineConfirmButtonText}>確定</Text>
              </Pressable>
            </QuestionStep>

            <QuestionStep
              number="3"
              title="きっかけ"
              value={
                input.trigger
                  ? getTriggerLabel(input.trigger, input.customTrigger)
                  : ''
              }
            >
              <OptionChips
                options={triggers}
                selected={input.trigger}
                onSelect={(trigger) =>
                  setInput((current) => ({
                    ...current,
                    trigger,
                  }))
                }
              />
            </QuestionStep>

            <Pressable
              disabled={!canJudge}
              style={[styles.primaryButton, !canJudge && styles.disabledButton]}
              onPress={judge}
            >
              <Text style={styles.primaryButtonText}>記録する</Text>
            </Pressable>
          </View>
          {result && input.category && effectivePriceRange && input.trigger && (
            <Animated.View
              style={[
                styles.inlineResult,
                {
                  opacity: resultSlideY.interpolate({
                    inputRange: [0, 24],
                    outputRange: [1, 0],
                  }),
                  transform: [{ translateY: resultSlideY }],
                },
              ]}
            >
              <View style={styles.resultCard}>
                <Image source={FEATURE_RECEIPT_SOURCE} style={styles.resultIcon} resizeMode="contain" />
                <Text style={styles.scoreLabel}>後悔しない確率</Text>
                <Text style={styles.score}>{result.score}%</Text>
                <Text style={styles.resultLabel}>{result.label}</Text>
                <Text style={styles.resultComment}>{result.comment}</Text>
              </View>

              <View style={styles.detailCard}>
                <DetailRow
                  label="カテゴリ"
                  value={getCategoryLabel(input.category, input.customCategory)}
                />
                <DetailRow
                  label="金額"
                  value={getPriceLabel(
                    effectivePriceRange,
                    parseCustomPriceAmount(input.customPriceAmount) ?? undefined,
                  )}
                />
                <DetailRow
                  label="きっかけ"
                  value={getTriggerLabel(input.trigger, input.customTrigger)}
                />
              </View>

              <View style={styles.actionRow}>
                <ActionButton label="買う" active={selectedAction === 'buy'} onPress={() => recordAction('buy')} />
                <ActionButton label="やめる" active={selectedAction === 'skip'} onPress={() => recordAction('skip')} />
                <ActionButton label="保留" active={selectedAction === 'hold'} onPress={() => recordAction('hold')} />
              </View>
            </Animated.View>
          )}
          <HomeSavingsCard stats={savingsStats} />
        </ScrollView>
      )}

      {screen === 'settings' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="設定" />
          <View style={styles.settingsList}>
            <SettingsButton
              disabled={isPurchasing || !lifetimePackage}
              label="有料版を購入"
              onPress={() => {
                void purchaseLifetime();
              }}
            />
            <SettingsButton
              disabled={isPurchasing}
              label="購入を復元"
              onPress={() => {
                void restoreLifetimePurchase();
              }}
            />
            <SettingsLinkRow label="利用規約" url={TERMS_URL} />
            <SettingsLinkRow label="プライバシーポリシー" url={PRIVACY_URL} />
            <SettingsLinkRow label="お問い合わせ" url={CONTACT_URL} />
            <SettingsRow label="アプリバージョン" value={APP_VERSION} />
          </View>
        </ScrollView>
      )}

      {screen === 'history' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="履歴" />
          {!hasProAccess ? (
            <HistoryTeaser checks={checks} onPurchase={purchaseLifetime} />
          ) : (
            <HistoryList checks={checks} stats={savingsStats} />
          )}
        </ScrollView>
      )}

      {screen === 'savings' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="節約カウンター" onBack={() => setScreen('settings')} />
          {checks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>まだ記録がありません</Text>
            </View>
          ) : (
            <SavingsCounter stats={savingsStats} />
          )}
        </ScrollView>
      )}

      {screen === 'analysis' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="パターン分析" />
          {!hasProAccess ? (
            <AnalysisTeaser stats={patternStats} onPurchase={purchaseLifetime} />
          ) : (
            <PatternAnalysis stats={patternStats} />
          )}
        </ScrollView>
      )}

      <BottomTabs screen={screen} onSelect={setScreen} />
    </SafeAreaView>
  );
}

function BrandHeader({ onSettingsPress }: { onSettingsPress: () => void }) {
  return (
    <View style={styles.brandHeader}>
      <Image source={LOGO_SOURCE} style={styles.brandLogo} resizeMode="contain" />
      <Pressable style={styles.iconButton} onPress={onSettingsPress}>
        <Image source={TAB_SETTINGS_SOURCE} style={styles.smallIcon} resizeMode="contain" />
      </Pressable>
    </View>
  );
}

function HomeSavingsCard({
  stats,
}: {
  stats: {
    averageScore: number;
    monthlySaved: number;
    skipCount: number;
    totalSaved: number;
  };
}) {
  return (
    <View style={styles.savingsCard}>
      <Text style={styles.cardLabel}>今月の節約額</Text>
      <View style={styles.savingsTopRow}>
        <Text style={styles.savingsBigValue}>
          ¥{stats.monthlySaved.toLocaleString()}
        </Text>
        <MiniGraph />
      </View>
      <View style={styles.savingsDivider} />
      <DetailRow
        label="累計節約額"
        value={`¥${stats.totalSaved.toLocaleString()}`}
      />
      <DetailRow
        label="「やめる」を選んだ回数"
        value={`${stats.skipCount}回`}
      />
    </View>
  );
}

function QuestionStep({
  children,
  number,
  title,
  value,
}: {
  children: ReactNode;
  number: string;
  title: string;
  value: string;
}) {
  return (
    <View style={styles.questionStep}>
      <View style={styles.questionLine}>
        <Text style={styles.stepBadge}>{number}</Text>
        <Text style={styles.previewTitle}>{title}</Text>
        {value ? <Text style={styles.previewValue}>{value}</Text> : <View style={styles.previewSpacer} />}
      </View>
      {children}
    </View>
  );
}

function OptionChips<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: Option<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.optionWrap}>
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <Pressable
            key={option.value}
            style={[styles.optionButton, isSelected && styles.selectedOption]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={[styles.optionButtonText, isSelected && styles.selectedOptionText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MiniGraph() {
  const points = [18, 34, 26, 48, 42, 68, 62, 84];
  return (
    <View style={styles.miniGraph}>
      {points.map((height, index) => (
        <View key={`${height}-${index}`} style={styles.graphPointWrap}>
          <View style={[styles.graphPoint, { marginTop: 90 - height }]} />
          {index > 0 && <View style={styles.graphConnector} />}
        </View>
      ))}
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>
      )}
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

function OptionGroup<T extends string>({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: Option<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.questionTitle}>{title}</Text>
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.optionButton, isSelected && styles.selectedOption]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  isSelected && styles.selectedOptionText,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.actionButton, active && styles.activeActionButton]}
      onPress={onPress}
    >
      <Text style={[styles.actionButtonText, active && styles.activeActionText]}>
        {label}
      </Text>
    </Pressable>
  );
}

type TabScreen = 'check' | 'history' | 'analysis' | 'settings';

const bottomTabs: { icon: ImageSourcePropType; label: string; screen: TabScreen }[] = [
  { icon: TAB_HOME_SOURCE, label: 'ホーム', screen: 'check' },
  { icon: TAB_HISTORY_SOURCE, label: '履歴', screen: 'history' },
  { icon: TAB_ANALYSIS_SOURCE, label: '分析', screen: 'analysis' },
  { icon: TAB_SETTINGS_SOURCE, label: '設定', screen: 'settings' },
];

function BottomTabs({
  screen,
  onSelect,
}: {
  screen: Screen;
  onSelect: (screen: Screen) => void;
}) {
  return (
    <View style={styles.bottomTabs}>
      {bottomTabs.map((tab) => {
        const active = screen === tab.screen;
        return (
          <Pressable
            key={tab.screen}
            style={styles.bottomTab}
            onPress={() => onSelect(tab.screen)}
          >
            <Image
              source={tab.icon}
              style={[styles.bottomTabIcon, !active && styles.inactiveBottomTabIcon]}
              resizeMode="contain"
            />
            <Text style={[styles.bottomTabText, active && styles.activeBottomTabText]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value}</Text>
    </View>
  );
}

function SettingsButton({
  disabled,
  label,
  onPress,
  value,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[styles.settingsRow, disabled && styles.disabledSettingsRow]}
      onPress={onPress}
    >
      <Text style={styles.settingsLabel}>{label}</Text>
      {value && <Text style={styles.settingsValue}>{value}</Text>}
    </Pressable>
  );
}

function SettingsLinkRow({ label, url }: { label: string; url: string }) {
  const hasUrl = url.trim().length > 0;

  return (
    <Pressable
      disabled={!hasUrl}
      style={[styles.settingsRow, !hasUrl && styles.disabledSettingsRow]}
      onPress={() => {
        if (!hasUrl) return;
        Alert.alert('ブラウザで開きます', '', [
          { text: 'アプリに戻る', style: 'cancel' },
          {
            text: 'OK',
            onPress: () => {
              void Linking.openURL(url);
            },
          },
        ]);
      }}
    >
      <Text style={styles.settingsLabel}>{label}</Text>
    </Pressable>
  );
}

function PurchaseTeaserButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.purchaseTeaserButton} onPress={onPress}>
      <Text style={styles.purchaseTeaserButtonText}>{label}</Text>
    </Pressable>
  );
}

function HistoryTeaser({
  checks,
  onPurchase,
}: {
  checks: PurchaseCheck[];
  onPurchase: () => void;
}) {
  const sampleCheck: PurchaseCheck = {
    action: 'skip',
    category: 'fashion',
    comment:
      '少し時間を置くとよい買い物です。今日すぐ必要か、明日も欲しいと思うかだけ確認しましょう。',
    createdAt: new Date().toISOString(),
    estimatedSavedAmount: estimatedSavedAmounts['501_1000'],
    id: 'history-teaser-sample',
    label: '少し時間を置くとよい買い物',
    priceRange: '501_1000',
    score: 65,
    trigger: 'sns',
  };
  const lockedChecks = checks.slice(0, 2);

  return (
    <View style={styles.listStack}>
      <HistoryRecordCard check={sampleCheck} sample />
      <PurchaseTeaserButton
        label="全履歴を見るには有料版（250円買い切り）"
        onPress={onPurchase}
      />
      {lockedChecks.map((check) => (
        <View key={check.id} style={styles.historyItem}>
          <View style={styles.historyHeader}>
            <MaskedTextBlock width={84} />
            <MaskedTextBlock width={52} />
          </View>
          <View style={styles.historyMeta}>
            <MaskedTextBlock width={68} />
            <MaskedTextBlock width={92} />
            <MaskedTextBlock width={74} />
            <MaskedTextBlock width={58} />
          </View>
        </View>
      ))}
    </View>
  );
}

function AnalysisTeaser({
  stats,
  onPurchase,
}: {
  stats: {
    categoryCounts: Record<string, number>;
    topTrigger: { key: string; count: number } | null;
    triggerCounts: Record<string, number>;
  };
  onPurchase: () => void;
}) {
  const totalChecks = Object.values(stats.categoryCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <View style={styles.listStack}>
      <View style={styles.analysisSummaryRow}>
        <StatCard label="これまでにチェックした件数" value={`${totalChecks}件`} />
        <StatCard
          label="最も多いきっかけ"
          value={
            stats.topTrigger
              ? `${getOptionLabel(triggers, stats.topTrigger.key as Trigger)} ${stats.topTrigger.count}回`
              : '0回'
          }
        />
      </View>
      <PurchaseTeaserButton
        label="詳しい内訳を見るには有料版（250円買い切り）"
        onPress={onPurchase}
      />
      <View style={styles.analysisCard}>
        <Text style={styles.sectionTitle}>カテゴリ別件数</Text>
        <MaskedCountList counts={stats.categoryCounts} options={categories} />
      </View>
      <View style={styles.analysisCard}>
        <Text style={styles.sectionTitle}>きっかけ別件数</Text>
        <MaskedCountList counts={stats.triggerCounts} options={triggers} />
      </View>
    </View>
  );
}

function MaskedCountList<T extends string>({
  counts,
  options,
}: {
  counts: Record<string, number>;
  options: Option<T>[];
}) {
  void counts;

  return (
    <View style={styles.maskedCountList}>
      {options.map((option) => (
        <View key={option.value} style={styles.maskedCountRow}>
          <Text style={styles.countLabel}>{option.label}</Text>
          <MaskedTextBlock width={48} />
        </View>
      ))}
    </View>
  );
}

function MaskedTextBlock({ width }: { width: number }) {
  return <View style={[styles.maskedTextBlock, { width }]} />;
}

function LockedFeature({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <View style={styles.lockedFeatureCard}>
      <Text style={styles.lockedFeatureTitle}>{title}</Text>
      <Text style={styles.lockedFeatureDescription}>{description}</Text>
      <Text style={styles.lockedFeaturePrice}>250円 買い切り</Text>
    </View>
  );
}

function HistorySavingsSummary({
  stats,
}: {
  stats: {
    monthlySaved: number;
    totalSaved: number;
  };
}) {
  return (
    <View style={styles.historySummaryCard}>
      <View style={styles.historySummaryRow}>
        <Text style={styles.historySummaryLabel}>今月の節約額</Text>
        <Text style={styles.historySummaryValue}>
          ¥{stats.monthlySaved.toLocaleString()}
        </Text>
      </View>
      <View style={styles.historySummaryDivider} />
      <View style={styles.historySummaryRow}>
        <Text style={styles.historySummaryLabel}>累計節約額</Text>
        <Text style={styles.historySummaryValue}>
          ¥{stats.totalSaved.toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

function HistoryList({
  checks,
  stats,
}: {
  checks: PurchaseCheck[];
  stats: {
    monthlySaved: number;
    totalSaved: number;
  };
}) {
  if (checks.length === 0) {
    return (
      <View style={styles.listStack}>
        <HistorySavingsSummary stats={stats} />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            まだ履歴がありません。買う前に衝動買いチェックしてみましょう。
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.listStack}>
      <HistorySavingsSummary stats={stats} />
      {checks.map((check) => (
        <HistoryRecordCard key={check.id} check={check} />
      ))}
    </View>
  );
}

function HistoryRecordCard({
  check,
  sample = false,
}: {
  check: PurchaseCheck;
  sample?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const actionColor = historyActionColors[check.action];

  return (
    <Pressable style={styles.historyItem} onPress={() => setIsExpanded((current) => !current)}>
      {sample && (
        <View style={styles.sampleHeader}>
          <Text style={styles.sampleBadge}>サンプル</Text>
        </View>
      )}
      <View style={styles.historyPrimaryRow}>
        <View>
          <Text style={styles.historyPrimaryLabel}>行動結果</Text>
          <Text style={[styles.historyAction, { color: actionColor }]}>
            {historyActionLabels[check.action]}
          </Text>
        </View>
        <View style={styles.historyAmountBlock}>
          <Text style={styles.historyPrimaryLabel}>金額</Text>
          <Text style={[styles.historyAmount, { color: actionColor }]}>
            {getPriceLabel(check.priceRange, check.customPriceAmount)}
          </Text>
        </View>
      </View>
      <View style={styles.historyMeta}>
        <Text style={styles.metaPill}>{formatDate(check.createdAt)}</Text>
        <Text style={styles.metaPill}>
          {getCategoryLabel(check.category, check.customCategory)}
        </Text>
        <Text style={styles.metaPill}>
          {getTriggerLabel(check.trigger, check.customTrigger)}
        </Text>
      </View>
      {check.action === 'skip' && (
        <Text style={[styles.historySaved, { color: historyActionColors.skip }]}>
          推定節約額 +{check.estimatedSavedAmount.toLocaleString()}円
        </Text>
      )}
      {isExpanded && (
        <View style={styles.historyPredictionBox}>
          <Text style={styles.historyPredictionText}>
            購入前の予測：買って後悔しない確率 {check.score}%（{check.label}）
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function SavingsCounter({
  stats,
}: {
  stats: {
    averageScore: number;
    monthlySaved: number;
    skipCount: number;
    totalSaved: number;
  };
}) {
  return (
    <View style={styles.statsGrid}>
      <StatCard label="今月の節約額" value={`${stats.monthlySaved.toLocaleString()}円`} />
      <StatCard label="累計節約額" value={`${stats.totalSaved.toLocaleString()}円`} />
      <StatCard label="「やめる」を選んだ回数" value={`${stats.skipCount}回`} />
      <StatCard label="平均スコア" value={`${stats.averageScore}%`} />
    </View>
  );
}

function PatternAnalysis({
  stats,
}: {
  stats: {
    categoryCounts: Record<string, number>;
    highRiskCount: number;
    topTrigger: { key: string; count: number } | null;
    triggerCounts: Record<string, number>;
  };
}) {
  return (
    <View style={styles.listStack}>
      <View style={styles.analysisSummaryRow}>
        <StatCard label="後悔リスク高め" value={`${stats.highRiskCount}回`} />
        <StatCard
          label="最も多いきっかけ"
          value={
            stats.topTrigger
              ? `${getOptionLabel(triggers, stats.topTrigger.key as Trigger)} ${stats.topTrigger.count}回`
              : '0回'
          }
        />
      </View>
      <CountList
        title="カテゴリ別件数"
        counts={stats.categoryCounts}
        options={categories}
      />
      <CountList title="きっかけ別件数" counts={stats.triggerCounts} options={triggers} />
    </View>
  );
}

function CountList<T extends string>({
  title,
  counts,
  options,
}: {
  title: string;
  counts: Record<string, number>;
  options: Option<T>[];
}) {
  return (
    <View style={styles.countCard}>
      <Text style={styles.countTitle}>{title}</Text>
      {options.map((option) => (
        <View key={option.value} style={styles.countRow}>
          <Text style={styles.countLabel}>{option.label}</Text>
          <Text style={styles.countValue}>{counts[option.value] ?? 0}件</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function countBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function getTopCount(counts: Record<string, number>): { key: string; count: number } | null {
  return Object.entries(counts).reduce<{ key: string; count: number } | null>(
    (top, [key, count]) => {
      if (!top || count > top.count) return { key, count };
      return top;
    },
    null,
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: BASE_SPACE,
    paddingBottom: 112,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingTop: 8,
  },
  brandLogo: {
    height: 54,
    width: 216,
    transform: [{ translateX: -24 }],
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  smallIcon: {
    height: 28,
    width: 28,
  },
  ledgerPanel: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  homeSubcopy: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
    textAlign: 'center',
  },
  previewQuestion: {
    marginBottom: 10,
  },
  questionStep: {
    borderBottomColor: COLORS.sub,
    borderBottomWidth: 1,
    marginBottom: 12,
    paddingBottom: 12,
  },
  questionLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 38,
  },
  stepBadge: {
    backgroundColor: COLORS.main,
    borderRadius: 14,
    color: COLORS.background,
    fontFamily: FONTS.number,
    fontSize: 14,
    fontWeight: '900',
    height: 28,
    lineHeight: 28,
    overflow: 'hidden',
    textAlign: 'center',
    width: 28,
  },
  previewTitle: {
    color: COLORS.text,
    flexShrink: 0,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '900',
  },
  previewValue: {
    color: COLORS.main,
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14,
    textAlign: 'right',
  },
  previewSpacer: {
    flex: 1,
  },
  chevron: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 26,
    lineHeight: 28,
  },
  previewHint: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: 6,
    borderWidth: 1,
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 11,
    marginLeft: 38,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  timelineSection: {
    marginTop: 18,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionLink: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
  },
  timelineCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  timelineRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.sub,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timelineDateDot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    width: 62,
  },
  timelineDate: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 12,
    width: 34,
  },
  dot: {
    backgroundColor: COLORS.main,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  timelineIcon: {
    height: 34,
    marginRight: 10,
    width: 34,
  },
  timelineBody: {
    flex: 1,
  },
  timelineTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '900',
  },
  timelineMeta: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 11,
    marginTop: 2,
  },
  timelineAmount: {
    color: COLORS.text,
    fontFamily: FONTS.number,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },
  savingsCard: {
    backgroundColor: COLORS.sub,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 18,
    padding: BASE_SPACE,
  },
  premiumPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.main,
    borderRadius: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  premiumPillText: {
    color: COLORS.background,
    fontFamily: FONTS.heading,
    fontSize: 11,
    fontWeight: '900',
  },
  savingsTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  savingsBigValue: {
    color: COLORS.main,
    flex: 1,
    fontFamily: FONTS.number,
    fontSize: 32,
    fontWeight: '900',
  },
  miniGraph: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    height: 94,
    justifyContent: 'flex-end',
    width: 118,
  },
  graphPointWrap: {
    alignItems: 'center',
    height: 94,
    width: 14,
  },
  graphPoint: {
    backgroundColor: COLORS.main,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  graphConnector: {
    backgroundColor: COLORS.main,
    height: 2,
    marginTop: 3,
    opacity: 0.65,
    width: 14,
  },
  savingsDivider: {
    backgroundColor: COLORS.main,
    height: 1,
    marginVertical: 10,
    opacity: 0.35,
  },
  hero: {
    paddingTop: BASE_SPACE,
    paddingBottom: BASE_SPACE,
  },
  kicker: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
    marginBottom: 14,
  },
  lead: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 16,
    lineHeight: 25,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLORS.main,
    borderRadius: BASE_RADIUS,
    minHeight: 54,
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: BASE_SPACE,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    backgroundColor: COLORS.sub,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: COLORS.accent,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: BASE_SPACE,
  },
  secondaryButtonText: {
    color: COLORS.accent,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: COLORS.text,
    borderRadius: BASE_RADIUS,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: BASE_SPACE,
  },
  shareButtonText: {
    color: COLORS.background,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 18,
    padding: BASE_SPACE,
  },
  cardLabel: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  lockedValue: {
    color: COLORS.text,
    fontFamily: FONTS.number,
    fontSize: 24,
    fontWeight: '800',
  },
  cardDescription: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  navGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  navTile: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    padding: 10,
  },
  lockedTile: {
    opacity: 0.78,
  },
  navText: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  savingsLink: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  savingsLinkText: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  lockText: {
    color: COLORS.accent,
    fontFamily: FONTS.heading,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    paddingTop: 12,
  },
  backButton: {
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  optionGroup: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginBottom: 14,
    padding: BASE_SPACE,
  },
  questionTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  optionButton: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedOption: {
    backgroundColor: COLORS.main,
    borderColor: COLORS.main,
  },
  optionButtonText: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
  },
  selectedOptionText: {
    color: COLORS.background,
  },
  customCategoryField: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginBottom: 14,
    padding: BASE_SPACE,
  },
  customCategoryLabel: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  customCategoryInput: {
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: BASE_SPACE,
  },
  ledgerInput: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: 8,
    borderWidth: 1,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 15,
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  pickerFrame: {
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  disabledPickerFrame: {
    backgroundColor: COLORS.sub,
    opacity: 0.45,
  },
  pickerItem: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  inlineConfirmButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: COLORS.main,
    borderRadius: BASE_RADIUS,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 40,
    paddingHorizontal: BASE_SPACE,
  },
  inlineConfirmButtonText: {
    color: COLORS.background,
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: 22,
  },
  inlineResult: {
    marginTop: 18,
  },
  resultIcon: {
    height: 54,
    marginBottom: 8,
    width: 54,
  },
  scoreLabel: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  score: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 58,
    fontWeight: '900',
    marginVertical: 8,
  },
  resultLabel: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  resultComment: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 14,
    padding: BASE_SPACE,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  detailLabel: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  detailValue: {
    color: COLORS.text,
    fontFamily: FONTS.number,
    fontSize: 14,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  activeActionButton: {
    backgroundColor: COLORS.main,
    borderColor: COLORS.main,
  },
  actionButtonText: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  activeActionText: {
    color: COLORS.background,
  },
  upgradeCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.accent,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    marginTop: 14,
    padding: BASE_SPACE,
  },
  upgradeTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  upgradeText: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 22,
  },
  savedText: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
  },
  settingsList: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
  },
  settingsRow: {
    borderBottomColor: COLORS.sub,
    borderBottomWidth: 1,
    padding: BASE_SPACE,
  },
  settingsLabel: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  settingsValue: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 13,
    marginTop: 4,
  },
  disabledSettingsRow: {
    opacity: 0.55,
  },
  purchaseTeaserButton: {
    alignItems: 'center',
    backgroundColor: COLORS.main,
    borderRadius: BASE_RADIUS,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: BASE_SPACE,
    paddingVertical: 12,
  },
  purchaseTeaserButtonText: {
    color: COLORS.background,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  lockedFeatureCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.accent,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  lockedFeatureTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  lockedFeatureDescription: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 24,
  },
  lockedFeaturePrice: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  emptyText: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 24,
  },
  listStack: {
    gap: 12,
  },
  historyItem: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  historyPrimaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyPrimaryLabel: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyAction: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 28,
    fontWeight: '900',
  },
  historyAmountBlock: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  historyAmount: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'right',
  },
  historyPredictionBox: {
    borderTopColor: COLORS.sub,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  historyPredictionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  historyPredictionLabel: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '700',
  },
  historyPredictionScore: {
    color: COLORS.main,
    fontFamily: FONTS.number,
    fontSize: 12,
    fontWeight: '900',
  },
  historyPredictionText: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 6,
  },
  sampleHeader: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  sampleBadge: {
    backgroundColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    color: COLORS.main,
    fontFamily: FONTS.heading,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyDate: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
  },
  historyScore: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 20,
    fontWeight: '900',
  },
  historyLabel: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  historyMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  metaPill: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  historySaved: {
    color: COLORS.accent,
    fontFamily: FONTS.number,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 10,
  },
  maskedTextBlock: {
    backgroundColor: COLORS.sub,
    borderColor: COLORS.sub,
    borderRadius: 7,
    borderWidth: 1,
    height: 24,
    opacity: 0.75,
  },
  historySummaryCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  historySummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historySummaryLabel: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '800',
  },
  historySummaryValue: {
    color: historyActionColors.skip,
    fontFamily: FONTS.number,
    fontSize: 24,
    fontWeight: '900',
  },
  historySummaryDivider: {
    backgroundColor: COLORS.sub,
    height: 1,
    marginVertical: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  analysisCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  analysisIcon: {
    height: 36,
    width: 36,
  },
  analysisSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  maskedCountList: {
    gap: 0,
    marginTop: 8,
  },
  maskedCountRow: {
    alignItems: 'center',
    borderTopColor: COLORS.sub,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  barChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    minHeight: 168,
    paddingTop: 18,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  barTrack: {
    alignItems: 'center',
    backgroundColor: COLORS.sub,
    borderRadius: 8,
    height: 118,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 18,
  },
  teaserBarTrack: {
    alignItems: 'center',
    backgroundColor: COLORS.sub,
    borderRadius: 8,
    height: 118,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
    width: 18,
  },
  barFill: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    width: 18,
  },
  teaserBarFill: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    opacity: 0.7,
    width: 18,
  },
  blurMask: {
    backgroundColor: COLORS.background,
    bottom: 0,
    left: 0,
    opacity: 0.62,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  barValue: {
    color: COLORS.main,
    fontFamily: FONTS.number,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
  barLabel: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  statCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 110,
    justifyContent: 'center',
    padding: BASE_SPACE,
  },
  statValue: {
    color: COLORS.text,
    fontFamily: FONTS.number,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  countCard: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.sub,
    borderRadius: BASE_RADIUS,
    borderWidth: 1,
    padding: BASE_SPACE,
  },
  countTitle: {
    color: COLORS.text,
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  countRow: {
    alignItems: 'center',
    borderTopColor: COLORS.sub,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  countLabel: {
    color: COLORS.main,
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
  },
  countValue: {
    color: COLORS.text,
    fontFamily: FONTS.number,
    fontSize: 14,
    fontWeight: '900',
  },
  bottomTabs: {
    backgroundColor: COLORS.background,
    borderTopColor: COLORS.sub,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    minHeight: 78,
    paddingBottom: 10,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
  },
  bottomTab: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  bottomTabIcon: {
    height: 22,
    width: 22,
  },
  inactiveBottomTabIcon: {
    opacity: 0.55,
  },
  bottomTabText: {
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  activeBottomTabText: {
    color: COLORS.main,
    fontFamily: FONTS.heading,
  },
});
