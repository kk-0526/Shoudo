# App Store Connect / RevenueCat 設定チェックリスト

認証情報やAPIキーの値は、このファイルにもリポジトリにも記載しない。

## 1. RevenueCat

- RevenueCatアカウントを作成する
- プロジェクトを作成する
- iOS App: `衝動買いストッパー`
  - Bundle ID: `com.jikoukan.shoudostopper`
- iOS App: `衝動食いストッパー`
  - Bundle ID: `com.jikoukan.shokuistopper`
- Entitlementを作成する
  - Identifier: `pro`
- Offeringを作成する
  - Identifier: `default`
- Lifetime Packageを作成する
- App Store Connect連携を設定する
- iOS AppごとのPublic SDK Keyを `.env.local` に保存する

## 2. App Store Connect

### 衝動買いストッパー

- アプリを作成する
- Bundle ID: `com.jikoukan.shoudostopper`
- 非消耗型IAPを作成する
  - Product ID: `shoudo_stop_pro_lifetime`
  - Price: JPY 250
- IAPをRevenueCatのEntitlement `pro` に紐づける

### 衝動食いストッパー

- アプリを作成する
- Bundle ID: `com.jikoukan.shokuistopper`
- 非消耗型IAPを作成する
  - Product ID: `shokui_stop_pro_lifetime`
  - Price: JPY 250
- IAPをRevenueCatのEntitlement `pro` に紐づける

## 3. ローカル環境変数

`C:\shoudo-stopper\.env.local`

```text
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=ここに衝動買いストッパー用のPublic SDK Keyを設定
```

`C:\shokui-stopper\.env.local`

```text
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=ここに衝動食いストッパー用のPublic SDK Keyを設定
```

`.env*.local` は `.gitignore` 対象。コミットしない。

## 4. 動作確認

- Expo Goでは本番IAP購入確認は行わない
- EAS Development BuildまたはTestFlightで確認する
- RevenueCatのCustomerInfoでEntitlement `pro` がactiveになることを確認する
- 購入復元でEntitlement `pro` がactiveになることを確認する
