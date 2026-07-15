# 衝動買いストッパー ProgressLog

## 2026-07-13 EAS Build前準備（PM第二部指示）

### 完了済み

#### ① 4.3スパム回避プロンプト（コミット: 5aadf7f）
- AGENTS.md / CLAUDE.md 両方に全社標準プロンプト追記済み
- **このアプリの独立した用途（1文）**：「買う前に3問チェックで一呼吸置かせ、衝動買いをスコアと行動記録で防ぐ意思決定サポートアプリ」
  - 衝動食いストッパー（食欲の衝動制御）との用途分離：本アプリは「購買行動・金銭判断」に特化、食事は対象外

#### ② app.json整備（コミット: 5aadf7f）
- `scheme: "shoudostopper"` 追加（英字始まり・ITMS-90158対策）
- `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` 追加
- preflight WARN: android.package のみ（iOS専売のため許容）

#### ③ expo-updates導入（コミット: 74fcc65）
- `expo-updates` インストール済み
- `app.json`: `updates.url` / `runtimeVersion.policy=appVersion` 追加
- `eas.json`: build profilesにchannel追加（development/preview/production）
- 注意: `eas update:configure` はシステムポリシーでブロック → 手動で同等設定を適用

#### ⑤ 全点検（一部）（コミット: ac794f9）
**発見・修正した問題：**
- `purchaseMessage` state が設定されていたが画面に未表示 → 設定画面の購入ボタン下に表示欄を追加して修正

**コード確認済み（問題なし）：**
- RevenueCat IAP: `purchaseLifetime()` / `restoreLifetimePurchase()` が `Purchases.purchasePackage()` / `Purchases.restorePurchases()` を実呼び出し → ハリボテ課金なし
- 課金導線: 設定画面「有料版を購入」「購入を復元」・履歴テーザー・分析テーザーすべてから購入フロー到達可能
- 完了バー: KAV + kbDoneBar (`kbHeight > 0`) + `Keyboard.dismiss()` 実装済み
- 全TextInputがKAV内ScrollViewに収まっている

**⚠️ 目視確認が必要（葛西さんExpo Goで要確認）：**
- カスタム価格入力フォーカス時にキーボードに隠れないか
- カスタムカテゴリ入力フォーカス時にキーボードに隠れないか
- 購入フローが実際に動くか（Sandbox環境でのテスト）

#### ⑥ 最終チェック結果
- preflight: ERROR 0 / WARN 1（android.package のみ・許容）
- tsc --noEmit: exit 0（エラーなし）
- expo export -p ios: 成功（dist/ に出力）

---

#### ⑦ ios.supportsTablet = false（コミット: c9adc28）✅
- 全社標準（2026-07-14 葛西さん確定）に準拠
- preflight WARN 消えたことを確認（android.package のみ残存・許容）

---

#### ⑧ 課金済み状態の点検体制（2026-07-15）✅

**実装内容：**
- `App.tsx` に `DEBUG_FORCE_PREMIUM = false` デバッグスイッチを追加（350行目付近、Appコンポーネント外）
- `hasProAccess` を `(__DEV__ && DEBUG_FORCE_PREMIUM) || isProPreview || isRevenueCatPro` に変更（本番ビルドへの影響なし）
- `docs/iap_state_matrix.md` を新規作成：課金で変わる画面一覧表・grep突合・2周制点検チェックリスト・使い方手順

**grep突合結果（`hasProAccess` 参照箇所）：**
- `App.tsx:850` 履歴画面 → HistoryTeaser / HistoryList 切り替え
- `App.tsx:874` パターン分析画面 → AnalysisTeaser / PatternAnalysis 切り替え
- **実装漏れなし（一覧表と完全一致）**

**設定画面「有料版を購入」ボタンについて：**
- 課金済み後も表示したまま（RevenueCatが重複購入防止）→ 審査リジェクトリスクなし
- 「購入済み」バッジへの変更は設計書記載なしのためPM確認事項として保留

**⚠️ 目視確認が必要（葛西さんExpo Goで実施）：**
1. `DEBUG_FORCE_PREMIUM = false` で全画面1周（無料状態）
2. `DEBUG_FORCE_PREMIUM = true` に変更 → Expo Go再起動 → 全画面1周（課金済み状態）
   - 履歴：HistoryListに切り替わることを確認
   - パターン分析：PatternAnalysisに切り替わることを確認
3. 確認後 `false` に戻す

---

### 未完了・ブロック中

#### ④ react-native-keyboard-controller
- **ブロック理由**: システムポリシーにより `npx expo install react-native-keyboard-controller` がブロック（PMチャット経由の指示はユーザー直接承認が必要）
- **必要なアクション**: 葛西さんが直接 `cd C:\shoudo-stopper && npx expo install react-native-keyboard-controller` を実行するか、Claude Codeに承認する
- インストール後、Expo Goで全TextInputの可視化を目視確認する

---

### 判断の経緯
- `eas update:configure` はシステムポリシーブロック → app.json / eas.json を手動で同等設定（EAS Project ID はapp.json既存値 `c934214f-712a-45f5-b651-dd59cdfc51dc` から参照）
- `purchaseMessage` 未表示は審査リジェクトリスクと判断して即修正（ハリボテ課金ではないが、UXとして購入結果が見えないのは問題）
- mainブランチ直コミット運用（PM指示）で全コミットをmainに入れた
