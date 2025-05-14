# Customer Feedback Portal

Web portal для надсилання скарг та пропозицій з авторизацією через Telegram.

## Змінні середовища

Створіть файл `.env` з наступними змінними:

```
TELEGRAM_TOKEN=your_bot_token
MONGODB_URI=your_mongodb_uri
ADMIN_ID=your_telegram_admin_id
WEBAPP_URL=your_render_app_url
SESSION_SECRET=your_session_secret
```

## Розгортання на Render.com

1. Створіть новий аккаунт на [Render.com](https://render.com)

2. Підключіть ваш GitHub репозиторій:
   - Натисніть "New +"
   - Виберіть "Web Service"
   - Підключіть свій GitHub репозиторій
   - Render автоматично визначить налаштування з render.yaml

3. Налаштуйте змінні середовища:
   - Перейдіть в налаштування сервісу
   - У секції "Environment Variables" додайте всі необхідні змінні:
     ```
     TELEGRAM_TOKEN=
     MONGODB_URI=
     ADMIN_ID=
     NODE_ENV=production
     WEBAPP_URL= (ваш URL застосунку на Render)
     ```

4. Налаштуйте Telegram Bot:
   - Створіть бота через @BotFather
   - Отримайте токен і username бота
   - Встановіть токен в змінних середовища
   - В налаштуваннях бота через @BotFather:
     - Дозвольте вхід через бота: /setdomain
     - Додайте ваш Render домен

5. Налаштуйте MongoDB:
   - Створіть базу даних на MongoDB Atlas
   - Додайте connection string у змінну MONGODB_URI

6. Фінальні кроки:
   - Натисніть "Deploy"
   - Дочекайтесь завершення розгортання
   - Перевірте health endpoint: https://your-app.onrender.com/health

## Локальний розвиток

1. Склонуйте репозиторій:
```bash
git clone <your-repo-url>
cd course
```

2. Встановіть залежності:
```bash
npm install
```

3. Створіть файл .env на основі прикладу вище

4. Запустіть у режимі розробки:
```bash
npm run dev
```

## Структура проекту

```
├── controllers/       # Контролери
├── models/           # Моделі даних
├── public/           # Статичні файли
└── index.js          # Точка входу
```