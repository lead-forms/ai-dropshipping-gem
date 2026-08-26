# AI Dropshipping Gem

Cloudflare Workers + D1 + R2 + Queues を制御面、FFmpeg rendererを動画処理面にした、複数アカウント対応のショート動画運用OSです。

## 実装済み

- Instagram / TikTok素材アカウント登録と権利ゲート
- Account / Product / Source / Clip / Creative / Publication / Metrics / JobのD1スキーマ
- 100アカウント以上を前提にしたQueue/Cron非同期実行
- 複数ソースClipのテーマ構成、Creative recipe、QA
- 縦型1080x1920、元音声除去、新規音声、複数動画再構成のFFmpeg renderer
- スマホ向けApproval Queue（承認、却下、再生成、投稿）
- 公式投稿adapterを接続するまで公開を止める安全ゲート

## ローカル検証

```bash
npm test
npm run e2e
```

`e2e-result.mp4` は4つの別ソースから生成されます。

## Cloudflare初回構築

```bash
npx wrangler login
npx wrangler d1 create ai-dropshipping-gem
npx wrangler r2 bucket create ai-dropshipping-gem-media
npx wrangler queues create ai-dropshipping-gem-jobs
npx wrangler queues create ai-dropshipping-gem-dlq
npx wrangler d1 migrations apply ai-dropshipping-gem --remote
npx wrangler deploy
```

D1作成時に返るdatabase_idを`wrangler.jsonc`へ設定します。Instagram Graph API / TikTok Content Posting APIは審査済みアプリと対象アカウントOAuthをSecretsへ接続し、投稿adapterを有効化します。素材取得は許諾済み素材のアップロードまたは公式・契約済みprovider adapterのみを使用します。
