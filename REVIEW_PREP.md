# 衝動買いストッパー 審査準備チェックリスト

Apple Developer登録前に進められる作業だけを整理します。RevenueCat / IAP 実装は登録後まで保留します。

## 先に進めるタスク

- アプリアイコンを本番用に差し替える
- App Store用スクリーンショットを作成する
- 利用規約URLを用意して設定画面に反映する
- プライバシーポリシーURLを用意して設定画面に反映する
- お問い合わせURLを正式URLに差し替える
- App Store Connect の App Privacy 回答を作る
- 審査メモを作る
- EAS Development Build または実機でCSV共有を確認する

## IAP連携時まで保留

- RevenueCat SDK導入
- RevenueCat API Key設定
- App Store Connect 非消耗型IAP作成
- Product ID `shoudo_stop_pro_lifetime` 連携
- RevenueCat entitlement `pro` 連携
- 購入処理
- 購入復元処理

## App Privacy 回答メモ

- ログインなし
- 広告なし
- AI利用なし
- 履歴データは端末内ローカル保存
- 無料ユーザーも直近5件は端末内に保存
- Android対応はMVP後

## スクリーンショット候補

- ホーム画面
- 3問チェック画面
- 判定結果画面
- 有料ロック表示
- 有料プレビューONでの履歴タイムライン
- 有料プレビューONでの節約カウンター
- 有料プレビューONでのパターン分析
