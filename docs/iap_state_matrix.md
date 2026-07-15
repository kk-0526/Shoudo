# 課金状態で表示・挙動が変わる画面と変化内容の一覧表

（全社標準 directive_iap_state_inspection_2026-07-15 準拠）

## 課金フラグの定義

```ts
// App.tsx 行 384（定義）
const hasProAccess = (__DEV__ && DEBUG_FORCE_PREMIUM) || isProPreview || isRevenueCatPro;
//                   ↑ 開発時デバッグスイッチ         ↑ 社内Preview     ↑ RevenueCat実購入
```

---

## 画面別変化一覧

| 画面 | 無料状態 | 課金済み状態 | 変化の性質 | `hasProAccess`参照行 |
|------|----------|------------|-----------|---------------------|
| **履歴**（history） | `HistoryTeaser`：サンプル1件＋マスクされた過去2件＋「全履歴を見るには有料版」ボタン | `HistoryList`：全履歴一覧＋節約サマリ | コンポーネント丸ごと切り替え | App.tsx:850 |
| **パターン分析**（analysis） | `AnalysisTeaser`：件数・最多きっかけ2枚のみ表示、カテゴリ/きっかけ別件数はマスク＋「詳しい内訳を見るには有料版」ボタン | `PatternAnalysis`：カテゴリ別・きっかけ別グラフ全表示 | コンポーネント丸ごと切り替え | App.tsx:874 |
| **ホーム**（home） | 変化なし | 変化なし | ― | なし |
| **設定**（settings） | 「有料版を購入」ボタン表示 | 「有料版を購入」ボタンが残ったまま（意図的：復元用途のため） | なし（設計上の意図） | なし |
| **節約カウンター**（savings） | 変化なし | 変化なし | ― | なし |
| **チェック画面**（check） | 変化なし | 変化なし | ― | なし |

---

## grep突合結果

```
grep -n "hasProAccess" App.tsx（定義除く）

App.tsx:850  {!hasProAccess ? <HistoryTeaser ...> : <HistoryList ...>}
App.tsx:874  {!hasProAccess ? <AnalysisTeaser ...> : <PatternAnalysis ...>}
```

**突合結果：一覧表の課金ゲート画面2件とgrep結果2件が完全一致。実装漏れなし。**

---

## 設定画面の「有料版を購入」ボタンについて

- 現状：`hasProAccess` による非表示・変更は行っていない
- 理由：機種変更時の「購入を復元」と同じ列に置いており、購入済みユーザーも操作できる必要がある
- リスク評価：RevenueCatが重複購入を防ぐ（既購入 → 「すでに購入済みです」旨のメッセージ + 復元処理）ため審査リジェクトリスクはない
- 判断留保：UI上「購入済み」バッジに変更すると体験が向上するが、現設計書に記載がないため独自判断しない。**PM確認事項**として残す。

---

## 2周制点検チェックリスト

### 第1周：無料状態（`DEBUG_FORCE_PREMIUM = false`）

- [ ] ホーム：チェックフォーム・スコア結果・節約カード表示OK
- [ ] 履歴：`HistoryTeaser`が表示される（サンプル＋マスク＋購入ボタン）
- [ ] パターン分析：`AnalysisTeaser`が表示される（件数2枚＋マスク＋購入ボタン）
- [ ] 設定：「有料版を購入」「購入を復元」ボタン表示OK、`purchaseMessage`欄あり
- [ ] 節約カウンター：記録なし時の空状態OK

### 第2周：課金済み状態（`DEBUG_FORCE_PREMIUM = true` でExpo Go起動）

- [ ] ホーム：変化なし（同一表示）
- [ ] 履歴：`HistoryList`に切り替わり、全履歴＋節約サマリが表示される
- [ ] パターン分析：`PatternAnalysis`に切り替わり、カテゴリ別・きっかけ別グラフが表示される
- [ ] 設定：変化なし（購入ボタンが残っている状態を確認）
- [ ] 節約カウンター：変化なし

**⚠️ Expo Goでの目視確認は葛西さんに依頼（デバッグスイッチONに変更 → Expo Go再起動 → 全画面巡回）**

---

## デバッグスイッチの使い方

1. `App.tsx` の `const DEBUG_FORCE_PREMIUM = false;` を `true` に変更
2. Expo Goで起動（開発ビルド = `__DEV__ === true`）
3. 課金済みUIが表示されることを確認
4. 確認後 `false` に戻してコミット（`true` のままコミット禁止）

> **注意**: `npm run build:production` / EAS Build production では `__DEV__ === false` のため `DEBUG_FORCE_PREMIUM` は評価されず、本番コードへの影響はゼロ。
