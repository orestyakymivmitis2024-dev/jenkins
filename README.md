# Cloudflare pipeline lab

Мінімальний тестовий проєкт, який відтворює **механіку деплою** arctic-crown (без коду компанії):

- Astro 7 SSR + `@astrojs/cloudflare` 14 → Cloudflare Workers;
- три wrangler-оточення: `develop`, `branch`, `release`, які обираються змінною `CLOUDFLARE_ENV` під час збірки;
- **спільний KV** для `develop` і feature-гілок (develop пише через cron, гілки лише читають);
- окремий KV для beta і production (`release`);
- перевірка `targetEnvironment` після збірки.

Сторінка сайту показує: гілку і час збірки, оточення wrangler і останній запис cron у KV.
Так одразу видно, з якого KV читає кожен Worker.

## Структура

```
├── astro.config.mjs            # SSR + адаптер Cloudflare
├── wrangler.jsonc              # оточення develop / branch / release, KV, cron
├── src/
│   ├── worker-entry.ts         # точка входу: Astro (fetch) + cron (scheduled)
│   ├── pages/index.astro       # сторінка, яка показує стан
│   └── env.d.ts                # типи bindings і build-змінних
├── scripts/check-target-env.mjs  # перевірка targetEnvironment після збірки
└── run.sh                      # запуск команд у Docker (Node 22 + pnpm 11.5.2)
```

## Що потрібно

- **Docker** (Node локально не обов'язковий: усе запускається через `./run.sh`);
- домен, доданий у Cloudflare як зона (етап 0);
- API-токен Cloudflare (шаблон "Edit Cloudflare Workers", обмежений твоєю зоною) і Account ID.

```bash
export CLOUDFLARE_API_TOKEN=...     # не комітити!
export CLOUDFLARE_ACCOUNT_ID=...
export DOMAIN=твій-домен.com
```

## Етап 1. Встановлення і перевірка доступу

```bash
./run.sh pnpm install
./run.sh npx wrangler whoami        # має показати твій акаунт
```

## Етап 2. Спільний KV для develop і гілок (один раз)

```bash
./run.sh npx wrangler kv namespace create lab-develop-kv
```

Команда виведе `id`. Встав його в `wrangler.jsonc` **в обидва місця** (`env.branch` і `env.develop`)
замість `REPLACE_WITH_DEVELOP_KV_NAMESPACE_ID` і закоміть.

## Етап 3. Локальна перевірка

```bash
# збірка як для develop + перевірка, що потрапило правильне оточення
CLOUDFLARE_ENV=develop ./run.sh pnpm build
CLOUDFLARE_ENV=develop ./run.sh pnpm check:env

# запуск Worker'а локально (workerd) → http://localhost:8787
./run.sh pnpm preview
```

Cron локально сам не запускається. В іншому терміналі:

```bash
curl http://localhost:8787/cdn-cgi/handler/scheduled
```

Онови сторінку: у рядку "KV heartbeat" має з'явитися запис від `develop (staging)`.

## Етап 4. Ручний деплой

Назви Worker'ів повторюють схему компанії: `<гілка>-lab-xsite-stg`, `lab-xsite-beta`, `lab-xsite-prod`.

### develop (staging, пише в спільний KV)

```bash
CLOUDFLARE_ENV=develop PUBLIC_BUILD_BRANCH=develop PUBLIC_DEPLOY_TIER=stg \
PUBLIC_BUILD_TIME=$(date -u +%FT%TZ) ./run.sh pnpm build
CLOUDFLARE_ENV=develop ./run.sh pnpm check:env
./run.sh npx wrangler deploy -c dist/server/wrangler.json \
  --name develop-lab-xsite-stg --domain develop-lab-xsite-stg.$DOMAIN
```

### feature-гілка (staging, читає спільний KV)

```bash
CLOUDFLARE_ENV=branch PUBLIC_BUILD_BRANCH=feature/hello PUBLIC_DEPLOY_TIER=stg \
PUBLIC_BUILD_TIME=$(date -u +%FT%TZ) ./run.sh pnpm build
CLOUDFLARE_ENV=branch ./run.sh pnpm check:env
./run.sh npx wrangler deploy -c dist/server/wrangler.json \
  --name feature-hello-lab-xsite-stg --domain feature-hello-lab-xsite-stg.$DOMAIN
```

### beta і production (release, власний KV у кожного)

```bash
CLOUDFLARE_ENV=release PUBLIC_BUILD_BRANCH=develop PUBLIC_DEPLOY_TIER=beta \
PUBLIC_BUILD_TIME=$(date -u +%FT%TZ) ./run.sh pnpm build
CLOUDFLARE_ENV=release ./run.sh pnpm check:env
./run.sh npx wrangler deploy -c dist/server/wrangler.json --name lab-xsite-beta --domain beta.$DOMAIN

# production — те саме, але PUBLIC_DEPLOY_TIER=prod, --name lab-xsite-prod, --domain www.$DOMAIN
```

## Що перевірити після деплою

| Адреса | Очікування |
|---|---|
| `develop-lab-xsite-stg.<домен>` | через ~1 хв heartbeat від `develop (staging)` |
| `feature-hello-lab-xsite-stg.<домен>` | **той самий** heartbeat від `develop (staging)` — спільний KV |
| `beta.<домен>` | heartbeat від `release (beta / prod)` — свій KV |
| `www.<домен>` | свій heartbeat, не такий, як на beta |

## Прибирання

```bash
./run.sh npx wrangler delete --name feature-hello-lab-xsite-stg
```

## Корисно знати

- Якщо забути `CLOUDFLARE_ENV`, збірка **не впаде**, а Worker тихо отримає не той KV. Саме тому після кожної збірки йде `check:env`.
- `--name` і `--domain` передаються **завжди**: так кожна гілка отримує свій Worker і свою адресу.
- На безкоштовному плані Cloudflare є ліміти (процесорний час на запит, кількість cron-тригерів на акаунт). Тут cron мають лише develop, beta і prod.
