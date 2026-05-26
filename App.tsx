import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import {
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  Pressable,
  View,
} from 'react-native';

declare const process: {
  env?: Record<string, string | undefined>;
};

type Screen =
  | 'home'
  | 'check'
  | 'result'
  | 'history'
  | 'savings'
  | 'analysis'
  | 'export'
  | 'settings';
type Category = 'food' | 'fashion' | 'gadget' | 'hobby' | 'other';
type PriceRange =
  | 'under_1000'
  | '1001_5000'
  | '5001_20000'
  | 'over_20001';
type Trigger = 'sale' | 'sns' | 'impulse' | 'wanted_long_time' | 'necessary';
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
  priceRange: PriceRange | null;
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
const FREE_HISTORY_LIMIT = 5;
const APP_VERSION = '1.0.0';
const PRO_PRICE_LABEL = '250円 買い切り';
const TERMS_URL = 'https://kk-0526.github.io/Shoudo/TERMS';
const PRIVACY_URL = 'https://kk-0526.github.io/Shoudo/PRIVACY';
const CONTACT_URL = '';
const REVENUECAT_ENTITLEMENT_ID = 'pro';
const REVENUECAT_PRODUCT_ID = 'shoudo_stop_pro_lifetime';
const REVENUECAT_IOS_API_KEY =
  process.env?.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';

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
  { label: '〜1000円', value: 'under_1000' },
  { label: '1001〜5000円', value: '1001_5000' },
  { label: '5001〜20000円', value: '5001_20000' },
  { label: '20001円〜', value: 'over_20001' },
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
  under_1000: 5,
  '1001_5000': 0,
  '5001_20000': -10,
  over_20001: -20,
};

const triggerScores: Record<Trigger, number> = {
  sale: -15,
  sns: -20,
  impulse: -25,
  wanted_long_time: 15,
  necessary: 20,
};

const estimatedSavedAmounts: Record<PriceRange, number> = {
  under_1000: 500,
  '1001_5000': 3000,
  '5001_20000': 12500,
  over_20001: 25000,
};

const actionLabels: Record<Action, string> = {
  buy: '買う',
  skip: 'やめる',
  hold: '保留',
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

async function saveFreeCheck(
  check: PurchaseCheck,
  hasProAccess: boolean,
): Promise<number> {
  const checks = await loadChecks();
  const nextChecks = hasProAccess
    ? [check, ...checks]
    : [check, ...checks].slice(0, FREE_HISTORY_LIMIT);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextChecks));
  return nextChecks.length;
}

function hasActiveProEntitlement(customerInfo: RevenueCatCustomerInfo): boolean {
  return customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID] !== undefined;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [input, setInput] = useState<CheckInput>({
    category: null,
    priceRange: null,
    trigger: null,
  });
  const [result, setResult] = useState<CheckResult | null>(null);
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [checks, setChecks] = useState<PurchaseCheck[]>([]);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isProPreview, setIsProPreview] = useState(false);
  const [isRevenueCatPro, setIsRevenueCatPro] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [lifetimePackage, setLifetimePackage] = useState<RevenueCatPackage | null>(
    null,
  );

  const hasProAccess = isProPreview || isRevenueCatPro;

  useEffect(() => {
    void refreshChecks();
    void initializeRevenueCat();
  }, []);

  const canJudge = Boolean(input.category && input.priceRange && input.trigger);

  const estimatedSavedAmount = useMemo(() => {
    if (input.priceRange === null) return 0;
    return estimatedSavedAmounts[input.priceRange];
  }, [input.priceRange]);

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
    setInput({ category: null, priceRange: null, trigger: null });
    setResult(null);
    setLastAction(null);
    setScreen('check');
  }

  function judge() {
    if (!input.category || !input.priceRange || !input.trigger) return;
    const score = calculateScore({
      category: input.category,
      priceRange: input.priceRange,
      trigger: input.trigger,
    });
    setResult(getResult(score));
    setLastAction(null);
    setScreen('result');
  }

  function recordAction(action: Action) {
    if (!result || !input.category || !input.priceRange || !input.trigger) return;
    const check: PurchaseCheck = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      category: input.category,
      priceRange: input.priceRange,
      trigger: input.trigger,
      score: result.score,
      label: result.label,
      comment: result.comment,
      action,
      estimatedSavedAmount: action === 'skip' ? estimatedSavedAmount : 0,
    };
    setLastAction(action);
    void saveFreeCheck(check, hasProAccess).then(() => refreshChecks());
  }

  async function exportCsv() {
    setExportMessage(null);
    if (checks.length === 0) {
      setExportMessage('エクスポートできる履歴がありません。');
      return;
    }

    const csv = buildCsv(checks);

    if (Platform.OS === 'web') {
      setExportMessage(
        'Web確認では共有シートを使えません。実機ビルドでCSV保存/共有を確認します。',
      );
      return;
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      setExportMessage('この端末では共有シートを利用できません。');
      return;
    }

    const file = new FileSystem.File(
      FileSystem.Paths.cache,
      'shoudo_stop_history.csv',
    );
    if (file.exists) {
      file.delete();
    }
    file.create({ overwrite: true });
    file.write(csv, { encoding: 'utf8' });
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: '購入履歴CSVを保存',
      UTI: 'public.comma-separated-values-text',
    });
    setExportMessage('CSVエクスポートを実行しました。');
  }

  async function shareStoppedPurchase(action: Action) {
    if (!result || !input.category || !input.priceRange || !input.trigger) return;
    if (action === 'buy') return;

    const actionText = action === 'skip' ? '衝動買いを止めました' : '衝動買いを保留しました';
    const savedText =
      action === 'skip'
        ? `\n推定節約額: ${estimatedSavedAmount.toLocaleString()}円`
        : '';
    const message = `${actionText}。\nカテゴリ: ${getOptionLabel(categories, input.category)}\n金額: ${getOptionLabel(priceRanges, input.priceRange)}\nきっかけ: ${getOptionLabel(triggers, input.trigger)}\n判定: ${result.label}${savedText}\n\n#衝動買いストッパー #節約`;

    try {
      await Share.share({ message });
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('エラー', 'シェアに失敗しました。');
      }
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>衝動買いの前に3問チェック</Text>
            <Text style={styles.title}>衝動買いストッパー</Text>
            <Text style={styles.lead}>
              欲しい気持ちを否定せず、買う前に一度だけ立ち止まるための小さな道具です。
            </Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={resetCheck}>
            <Text style={styles.primaryButtonText}>3問チェックを始める</Text>
          </Pressable>

          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>今月の推定節約額</Text>
            <Text style={styles.lockedValue}>有料版で表示</Text>
            <Text style={styles.cardDescription}>
              やめた買い物を記録すると、節約できた金額を自動で集計します。
            </Text>
          </View>

          <View style={styles.navGrid}>
            <NavTile
              label="履歴"
              locked={!hasProAccess}
              onPress={() => setScreen('history')}
            />
            <NavTile
              label="分析"
              locked={!hasProAccess}
              onPress={() => setScreen('analysis')}
            />
            <Pressable style={styles.navTile} onPress={() => setScreen('settings')}>
              <Text style={styles.navText}>設定</Text>
            </Pressable>
          </View>

          <Pressable style={styles.savingsLink} onPress={() => setScreen('savings')}>
            <Text style={styles.savingsLinkText}>節約カウンターを見る</Text>
          </Pressable>

          <Pressable style={styles.savingsLink} onPress={() => setScreen('export')}>
            <Text style={styles.savingsLinkText}>CSVエクスポート</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === 'check' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="3問チェック" onBack={() => setScreen('home')} />
          <OptionGroup
            title="Q1. カテゴリ"
            options={categories}
            selected={input.category}
            onSelect={(category) => setInput((current) => ({ ...current, category }))}
          />
          <OptionGroup
            title="Q2. 金額"
            options={priceRanges}
            selected={input.priceRange}
            onSelect={(priceRange) =>
              setInput((current) => ({ ...current, priceRange }))
            }
          />
          <OptionGroup
            title="Q3. きっかけ"
            options={triggers}
            selected={input.trigger}
            onSelect={(trigger) => setInput((current) => ({ ...current, trigger }))}
          />
          <Pressable
            disabled={!canJudge}
            style={[styles.primaryButton, !canJudge && styles.disabledButton]}
            onPress={judge}
          >
            <Text style={styles.primaryButtonText}>判定する</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === 'result' && result && input.category && input.priceRange && input.trigger && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="判定結果" onBack={() => setScreen('check')} />
          <View style={styles.resultCard}>
            <Text style={styles.scoreLabel}>買って後悔しない確率</Text>
            <Text style={styles.score}>{result.score}%</Text>
            <Text style={styles.resultLabel}>{result.label}</Text>
            <Text style={styles.resultComment}>{result.comment}</Text>
          </View>

          <View style={styles.detailCard}>
            <DetailRow
              label="カテゴリ"
              value={getOptionLabel(categories, input.category)}
            />
            <DetailRow
              label="金額"
              value={getOptionLabel(priceRanges, input.priceRange)}
            />
            <DetailRow label="きっかけ" value={getOptionLabel(triggers, input.trigger)} />
          </View>

          <View style={styles.actionRow}>
            <ActionButton label="買う" active={lastAction === 'buy'} onPress={() => recordAction('buy')} />
            <ActionButton label="やめる" active={lastAction === 'skip'} onPress={() => recordAction('skip')} />
            <ActionButton label="保留" active={lastAction === 'hold'} onPress={() => recordAction('hold')} />
          </View>

          {lastAction && (
            <View style={styles.upgradeCard}>
              <Text style={styles.upgradeTitle}>記録と分析は有料版で解放</Text>
              <Text style={styles.upgradeText}>
                無料版では直近5件だけ端末内に保存します。現在の保存件数は{savedCount}件です。履歴、節約カウンター、分析、CSV出力は250円の買い切りで使えます。
              </Text>
              {lastAction === 'skip' && (
                <Text style={styles.savedText}>
                  今回の推定節約額: {estimatedSavedAmount.toLocaleString()}円
                </Text>
              )}
            </View>
          )}

          {lastAction && lastAction !== 'buy' && (
            <Pressable
              style={styles.shareButton}
              onPress={() => {
                void shareStoppedPurchase(lastAction);
              }}
            >
              <Text style={styles.shareButtonText}>
                {lastAction === 'skip' ? '止めたことをシェア' : '保留したことをシェア'}
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.secondaryButton} onPress={resetCheck}>
            <Text style={styles.secondaryButtonText}>もう一度チェックする</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === 'settings' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="設定" onBack={() => setScreen('home')} />
          <View style={styles.settingsList}>
            <SettingsButton
              disabled={isPurchasing || !lifetimePackage}
              label="有料版を購入"
              value={
                isRevenueCatPro
                  ? '購入済み'
                  : `${PRO_PRICE_LABEL} / ${isPurchasing ? '処理中' : '購入する'}`
              }
              onPress={() => {
                void purchaseLifetime();
              }}
            />
            <SettingsButton
              disabled={isPurchasing}
              label="購入を復元"
              value={isPurchasing ? '処理中' : '復元する'}
              onPress={() => {
                void restoreLifetimePurchase();
              }}
            />
            <SettingsRow label="RevenueCat状態" value={purchaseMessage ?? '確認中'} />
            <Pressable
              style={styles.settingsRow}
              onPress={() => setIsProPreview((current) => !current)}
            >
              <Text style={styles.settingsLabel}>開発用 有料プレビュー</Text>
              <Text style={styles.settingsValue}>
                {isProPreview ? 'ON: 有料画面を表示中' : 'OFF: ロック表示'}
              </Text>
            </Pressable>
            <SettingsLinkRow label="利用規約" url={TERMS_URL} />
            <SettingsLinkRow label="プライバシーポリシー" url={PRIVACY_URL} />
            <SettingsLinkRow label="お問い合わせ" url={CONTACT_URL} />
            <SettingsRow label="バージョン" value={APP_VERSION} />
          </View>
        </ScrollView>
      )}

      {screen === 'history' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="履歴" onBack={() => setScreen('home')} />
          {!hasProAccess ? (
            <LockedFeature
              title="購入履歴タイムライン"
              description="3問チェックの履歴は端末内に保存されています。表示するには有料版が必要です。"
            />
          ) : (
            <HistoryList checks={checks} />
          )}
        </ScrollView>
      )}

      {screen === 'savings' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="節約カウンター" onBack={() => setScreen('home')} />
          {!hasProAccess ? (
            <LockedFeature
              title="節約できた金額カウンター"
              description="「やめる」を選んだ買い物の推定節約額を集計します。表示するには有料版が必要です。"
            />
          ) : (
            <SavingsCounter stats={savingsStats} />
          )}
        </ScrollView>
      )}

      {screen === 'analysis' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="パターン分析" onBack={() => setScreen('home')} />
          {!hasProAccess ? (
            <LockedFeature
              title="カテゴリ別パターン分析"
              description="カテゴリやきっかけごとの傾向を表示します。表示するには有料版が必要です。"
            />
          ) : (
            <PatternAnalysis stats={patternStats} />
          )}
        </ScrollView>
      )}

      {screen === 'export' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Header title="CSVエクスポート" onBack={() => setScreen('home')} />
          {!hasProAccess ? (
            <LockedFeature
              title="CSVエクスポート"
              description="端末内に保存した購入前チェック履歴をCSVで保存できます。利用するには有料版が必要です。"
            />
          ) : (
            <CsvExportPanel
              count={checks.length}
              message={exportMessage}
              onExport={() => {
                void exportCsv().catch(() => {
                  setExportMessage('CSVエクスポートに失敗しました。');
                  if (Platform.OS !== 'web') {
                    Alert.alert('エラー', 'CSVエクスポートに失敗しました。');
                  }
                });
              }}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>戻る</Text>
      </Pressable>
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

function NavTile({
  label,
  locked,
  onPress,
}: {
  label: string;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.navTile, locked && styles.lockedTile]} onPress={onPress}>
      <Text style={styles.navText}>{label}</Text>
      {locked && <Text style={styles.lockText}>有料版</Text>}
    </Pressable>
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
  value: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={[styles.settingsRow, disabled && styles.disabledSettingsRow]}
      onPress={onPress}
    >
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value}</Text>
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
        void Linking.openURL(url);
      }}
    >
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{hasUrl ? url : '準備中'}</Text>
    </Pressable>
  );
}

function LockedFeature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.lockedFeatureCard}>
      <Text style={styles.lockedFeatureTitle}>{title}</Text>
      <Text style={styles.lockedFeatureDescription}>{description}</Text>
      <Text style={styles.lockedFeaturePrice}>{PRO_PRICE_LABEL}</Text>
    </View>
  );
}

function HistoryList({ checks }: { checks: PurchaseCheck[] }) {
  if (checks.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          まだ履歴がありません。買う前に3問チェックしてみましょう。
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listStack}>
      {checks.map((check) => (
        <View key={check.id} style={styles.historyItem}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyDate}>{formatDate(check.createdAt)}</Text>
            <Text style={styles.historyScore}>{check.score}%</Text>
          </View>
          <Text style={styles.historyLabel}>{check.label}</Text>
          <View style={styles.historyMeta}>
            <Text style={styles.metaPill}>{getOptionLabel(categories, check.category)}</Text>
            <Text style={styles.metaPill}>{getOptionLabel(priceRanges, check.priceRange)}</Text>
            <Text style={styles.metaPill}>{getOptionLabel(triggers, check.trigger)}</Text>
            <Text style={styles.metaPill}>{actionLabels[check.action]}</Text>
          </View>
          {check.action === 'skip' && (
            <Text style={styles.historySaved}>
              推定節約額: {check.estimatedSavedAmount.toLocaleString()}円
            </Text>
          )}
        </View>
      ))}
    </View>
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
      <StatCard label="今月の推定節約額" value={`${stats.monthlySaved.toLocaleString()}円`} />
      <StatCard label="累計推定節約額" value={`${stats.totalSaved.toLocaleString()}円`} />
      <StatCard label="やめた回数" value={`${stats.skipCount}回`} />
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
      <View style={styles.summaryCard}>
        <Text style={styles.cardLabel}>後悔リスク高め</Text>
        <Text style={styles.lockedValue}>{stats.highRiskCount}回</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.cardLabel}>最も多いきっかけ</Text>
        <Text style={styles.lockedValue}>
          {stats.topTrigger
            ? `${getOptionLabel(triggers, stats.topTrigger.key as Trigger)} ${stats.topTrigger.count}回`
            : 'まだデータがありません'}
        </Text>
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

function CsvExportPanel({
  count,
  message,
  onExport,
}: {
  count: number;
  message: string | null;
  onExport: () => void;
}) {
  return (
    <View style={styles.listStack}>
      <View style={styles.summaryCard}>
        <Text style={styles.cardLabel}>エクスポート対象</Text>
        <Text style={styles.lockedValue}>{count}件</Text>
        <Text style={styles.cardDescription}>
          カテゴリ、金額、きっかけ、判定、行動、推定節約額をCSV形式で出力します。
        </Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={onExport}>
        <Text style={styles.primaryButtonText}>CSVを保存/共有する</Text>
      </Pressable>
      {message && <Text style={styles.exportMessage}>{message}</Text>}
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

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(items: PurchaseCheck[]): string {
  const headers = [
    'createdAt',
    'category',
    'priceRange',
    'trigger',
    'score',
    'label',
    'action',
    'estimatedSavedAmount',
  ];
  const rows = items.map((item) => [
    item.createdAt,
    getOptionLabel(categories, item.category),
    getOptionLabel(priceRanges, item.priceRange),
    getOptionLabel(triggers, item.trigger),
    item.score,
    item.label,
    actionLabels[item.action],
    item.estimatedSavedAmount,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
    .join('\n');
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8f5',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    paddingTop: 28,
    paddingBottom: 24,
  },
  kicker: {
    color: '#9f4637',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    color: '#2f2421',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
    marginBottom: 14,
  },
  lead: {
    color: '#6d5d58',
    fontSize: 16,
    lineHeight: 25,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#d95d47',
    borderRadius: 8,
    minHeight: 54,
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    backgroundColor: '#cdbfba',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#d95d47',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#b64b39',
    fontSize: 16,
    fontWeight: '800',
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: '#2f2421',
    borderRadius: 8,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
  },
  cardLabel: {
    color: '#6d5d58',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  lockedValue: {
    color: '#2f2421',
    fontSize: 24,
    fontWeight: '800',
  },
  cardDescription: {
    color: '#7c6b66',
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
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
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
    color: '#2f2421',
    fontSize: 15,
    fontWeight: '800',
  },
  savingsLink: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  savingsLinkText: {
    color: '#9f4637',
    fontSize: 15,
    fontWeight: '800',
  },
  lockText: {
    color: '#9f4637',
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
    borderColor: '#e5cbc4',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#9f4637',
    fontSize: 14,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#2f2421',
    fontSize: 22,
    fontWeight: '800',
  },
  optionGroup: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  questionTitle: {
    color: '#2f2421',
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
    backgroundColor: '#fff8f5',
    borderColor: '#edd8d1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedOption: {
    backgroundColor: '#d95d47',
    borderColor: '#d95d47',
  },
  optionButtonText: {
    color: '#4c3d38',
    fontSize: 14,
    fontWeight: '700',
  },
  selectedOptionText: {
    color: '#fff',
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  scoreLabel: {
    color: '#6d5d58',
    fontSize: 14,
    fontWeight: '700',
  },
  score: {
    color: '#d95d47',
    fontSize: 58,
    fontWeight: '900',
    marginVertical: 8,
  },
  resultLabel: {
    color: '#2f2421',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  resultComment: {
    color: '#6d5d58',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  detailLabel: {
    color: '#7c6b66',
    fontSize: 14,
    fontWeight: '700',
  },
  detailValue: {
    color: '#2f2421',
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
    backgroundColor: '#ffffff',
    borderColor: '#e5cbc4',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  activeActionButton: {
    backgroundColor: '#4c3d38',
    borderColor: '#4c3d38',
  },
  actionButtonText: {
    color: '#4c3d38',
    fontSize: 15,
    fontWeight: '800',
  },
  activeActionText: {
    color: '#ffffff',
  },
  upgradeCard: {
    backgroundColor: '#fff0e9',
    borderColor: '#f0c8bc',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  upgradeTitle: {
    color: '#2f2421',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  upgradeText: {
    color: '#6d5d58',
    fontSize: 14,
    lineHeight: 22,
  },
  savedText: {
    color: '#9f4637',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
  },
  settingsList: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
  },
  settingsRow: {
    borderBottomColor: '#f2e4df',
    borderBottomWidth: 1,
    padding: 16,
  },
  settingsLabel: {
    color: '#2f2421',
    fontSize: 16,
    fontWeight: '800',
  },
  settingsValue: {
    color: '#7c6b66',
    fontSize: 13,
    marginTop: 4,
  },
  disabledSettingsRow: {
    opacity: 0.55,
  },
  lockedFeatureCard: {
    backgroundColor: '#fff0e9',
    borderColor: '#f0c8bc',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  lockedFeatureTitle: {
    color: '#2f2421',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  lockedFeatureDescription: {
    color: '#6d5d58',
    fontSize: 15,
    lineHeight: 24,
  },
  lockedFeaturePrice: {
    color: '#9f4637',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    color: '#6d5d58',
    fontSize: 15,
    lineHeight: 24,
  },
  listStack: {
    gap: 12,
  },
  historyItem: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyDate: {
    color: '#7c6b66',
    fontSize: 13,
    fontWeight: '700',
  },
  historyScore: {
    color: '#d95d47',
    fontSize: 20,
    fontWeight: '900',
  },
  historyLabel: {
    color: '#2f2421',
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
    backgroundColor: '#fff8f5',
    borderColor: '#edd8d1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#4c3d38',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  historySaved: {
    color: '#9f4637',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 110,
    justifyContent: 'center',
    padding: 16,
  },
  statValue: {
    color: '#2f2421',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  countCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f0ded8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  countTitle: {
    color: '#2f2421',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  countRow: {
    alignItems: 'center',
    borderTopColor: '#f2e4df',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  countLabel: {
    color: '#6d5d58',
    fontSize: 14,
    fontWeight: '700',
  },
  countValue: {
    color: '#2f2421',
    fontSize: 14,
    fontWeight: '900',
  },
  exportMessage: {
    color: '#6d5d58',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
});
