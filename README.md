# Telegram Web Rewriting Proxy

Реверсивный rewriting-прокси для Telegram Web. Сервер выступает прослойкой между браузером пользователя и `web.telegram.org`: забирает HTML/JS/CSS, переписывает все адреса Telegram-доменов на свой домен и отдает пользователю. Рендеринг происходит в браузере, куки и DOM живут локально.

Работают: вход по QR и номеру, текстовые сообщения, медиа и файлы. Не работают: звонки (WebRTC через такую схему не прокинуть).

## Как это устроено

```
Браузер --HTTPS/WSS--> nginx --HTTP--> node-сервис --HTTPS/WSS--> web.telegram.org
```

- `src/server.js` — точки входа: `/` редиректит на `/a/`, `/k/` и `/a/` мапятся 1:1, `/proxy/<host>/...` — явный прокси, `/__proxy__/*` — служебные маршруты
- `src/proxy.js` — HTTP-прокси: форвард, рерайт HTML/CSS/JS, чистка CSP-заголовков и `Set-Cookie Domain`, рерайт редиректов, стриминг бинаря без буферизации
- `src/rewriter.js` — перезапись адресов в HTML (`src`, `href`, `srcset`, инлайн-скрипты), CSS (`url()`, `@import`), JS (основные паттерны абсолютных URL), снос `<meta CSP>`, инъекция client-патча
- `src/ws-proxy.js` — WebSocket-ретрансляция с очередью сообщений до установки upstream-соединения
- `src/workerPatch.js` — рантайм-патч для Web Worker'ов (там живет MTProto), вшивается в отдаваемые `*worker*.js` статически
- `public/client-patch.js` — клиентский патч: гасит ServiceWorker, перехватывает `fetch`/`XHR`/`WebSocket`/`EventSource`/`Worker`/`SharedWorker` в рантайме

## Быстрый старт

```bash
cp .env.example .env
docker build -t tg-web-proxy .
docker run -d --name tg-web-proxy --restart unless-stopped \
  -p 127.0.0.1:5050:5050 --env-file .env tg-web-proxy
curl -s http://127.0.0.1:5050/__proxy__/health
```

## Конфигурация

| Переменная    | Пример                            |
| ------------- | --------------------------------- |
| `PORT`        | `5050`                            |
| `PUBLIC_DOMAIN` | `https://example.relay.org`     |
| `TELEGRAM_ROOT` | `https://web.telegram.org`      |

## Nginx и TLS

Пример — в `nginx.example.conf`. Ключевое: `proxy_http_version 1.1` и заголовки `Upgrade`/`Connection` для WebSocket, таймауты под долгоживущие соединения, `client_max_body_size` под медиа.

Сертификат через webroot (не ломает конфиг, в отличие от `--nginx` плагина):

```bash
certbot certonly --webroot -w /var/www/html -d gram.defstrange.ru
```

Замечание: в примере HTTPS-блок слушает `10443`, а не `443` — так нужно, если порт `443` на сервере уже занят мультиплексором `nginx stream` (`ssl_preread`, например ради параллельного VPN на том же IP). На обычном сервере меняйте на `443`.

## Обновление

```bash
docker build -t tg-web-proxy .
docker rm -f tg-web-proxy
docker run -d --name tg-web-proxy --restart unless-stopped \
  -p 127.0.0.1:5050:5050 --env-file .env tg-web-proxy
```

## Сопровождение

Telegram обновляет веб-клиент без предупреждения и может сломать рерайт. Ориентиры:

- `/a/` (WebA): https://github.com/TelegramOrg/Telegram-web-z
- `/k/` (WebK): https://github.com/TelegramOrg/Telegram-web-k
- Маркер продакшен-обновления: `https://web.telegram.org/a/version.txt` (и `/k/version.txt`) — смена хэша значит выкатили новое, пора проверять прокси

## Ограничения

- Звонки не поддерживаются архитектурно
- Эвристические антифишинг-фильтры браузеров (например, Яндекс Нейропротект) могут помечать зеркало страницы логина — это ложное срабатывание, в Chrome предупреждения нет
- Только Telegram-хосты проксируются (`403` для остальных), открытым ретранслятором сервис не является

## Дисклеймер

Проект в личных/образовательных целях. Используя его, вы принимаете условия Telegram и отвечаете за соблюдение законодательства своей страны.
