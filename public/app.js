const socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling']
});

let currentLanguage = 'ua';

let currentUser = {
    id: null,
    role: 'user',
    isMainAdmin: false
};

// Authentication state
let isAuthenticated = false;
let userRole = 'user';

let adminManagementModal, addAdminModal;

// Глобальна змінна для зберігання даних користувача Telegram
window.tgUser = null;

// Ініціалізація Telegram WebApp
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded. Initializing application.');
    
    // Ініціалізуємо базові елементи, які не залежать від ролі
    setLanguage('ua'); 
    loadPublicStats();
    // Ініціалізуємо модальні вікна одразу
    adminManagementModal = new bootstrap.Modal(document.getElementById('adminManagementModal'));
    addAdminModal = new bootstrap.Modal(document.getElementById('addAdminModal'));
    // Додаємо обробники подій для кнопок модальних вікон
    document.getElementById('manageAdminsBtn')?.addEventListener('click', openAdminManagementModal);
    document.getElementById('showAddAdminModalBtn')?.addEventListener('click', openAddAdminModal);
    document.getElementById('saveNewAdminBtn')?.addEventListener('click', saveNewAdmin);


    // --- НАДІЙНА ЛОГІКА ЗАПУСКУ ---
    const telegram = window.Telegram?.WebApp;
    const mainContent = document.getElementById('mainContent');
    const requiredMsg = document.getElementById('telegramRequiredMsg');

    // Сховати контент за замовчуванням. Він з'явиться тільки після перевірки.
    mainContent.style.display = 'none';
    requiredMsg.style.display = 'none';

    if (telegram && telegram.initDataUnsafe?.user) {
        console.log('[Init] Telegram WebApp data found. Starting server authentication...');
        
        try {
            telegram.ready();
            telegram.expand();
        } catch (e) {
            console.error('[Init] Error with Telegram SDK:', e);
        }
        
        authenticateWithTelegramUser(telegram.initDataUnsafe.user, telegram.initData);

    } else {
        console.warn("[Init] Telegram WebApp data not found. App cannot start securely.");
        updateUserDataAndUI(null); // Скидаємо будь-які старі дані та ховаємо адмін-кнопку
        showTelegramRequiredMessage();
    }
});

// Функція для ініціалізації Telegram WebApp
function initializeTelegramWebApp() {
    // Отримуємо об'єкт Telegram WebApp
    const telegram = window.Telegram?.WebApp;
    
    // Виводимо діагностичну інформацію
    console.log('Telegram WebApp object:', telegram);
    console.log('Telegram WebApp available:', !!telegram);
    
    // Перевіряємо наявність об'єкта Telegram WebApp
    if (!telegram) {
        console.error('Telegram WebApp is not available');
        
        // Перевіряємо, чи є збережені дані користувача
        if (initializeUserFromStorage()) {
            console.log('User initialized from storage, continuing without Telegram WebApp');
            initializeFilters();
            initializeStatsToggle();
            loadComplaints();
        } else {
            showTelegramRequiredMessage();
        }
        return;
    }
    
    // Повідомляємо Telegram, що додаток готовий
    try {
        telegram.ready();
        console.log('Telegram WebApp ready() called successfully');
    } catch (error) {
        console.error('Error calling Telegram WebApp ready():', error);
    }
    
    // Отримуємо initData (важливо для валідації на сервері)
    const initData = telegram.initData;
    console.log('initData:', initData ? 'Present (length: ' + initData.length + ')' : 'Not available');
    
    // Виводимо діагностичну інформацію про дані користувача
    console.log('initDataUnsafe:', telegram.initDataUnsafe);
    console.log('user from initDataUnsafe:', telegram.initDataUnsafe?.user);
    
    // Отримуємо дані користувача
    const user = telegram.initDataUnsafe?.user;
    
    // Зберігаємо дані користувача у глобальну змінну
    window.tgUser = user;
    console.log('Saved Telegram user to global variable:', window.tgUser);
    
    // Перевіряємо наявність даних користувача
    if (!user) {
        console.warn('User data not found in Telegram WebApp');
        
        // Спроба отримати дані з localStorage
        if (initializeUserFromStorage()) {
            console.log('User initialized from storage, continuing without Telegram user data');
            initializeFilters();
            loadComplaints();
        } else {
            // Показуємо повідомлення про необхідність відкрити через Telegram
            showTelegramRequiredMessage();
        }
    } else {
        // Користувач авторизований через Telegram
        console.log("🔐 Користувач авторизований через Telegram:", user);
        
        // Розгортаємо додаток на весь екран
        try {
            telegram.expand();
            console.log('Telegram WebApp expand() called successfully');
        } catch (error) {
            console.error('Error calling Telegram WebApp expand():', error);
        }
        
        // Створюємо мінімальний об'єкт користувача, якщо initData відсутній
        if (!initData) {
            console.warn('initData is not available, creating mock data for authentication');
            // Автоматично авторизуємо користувача навіть без initData
            authenticateWithTelegramUser(user, 'mock_initdata');
        } else {
            // Автоматично авторизуємо користувача
            authenticateWithTelegramUser(user, initData);
        }
    }
}

// Функція для відображення повідомлення про необхідність відкрити через Telegram
function showTelegramRequiredMessage() {
    console.log('Showing Telegram required message');
    
    // Приховуємо основний контент
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.style.display = 'none';
    }
    
    // Показуємо повідомлення
    let telegramRequiredMsg = document.getElementById('telegramRequiredMsg');
    
    if (!telegramRequiredMsg) {
        telegramRequiredMsg = document.createElement('div');
        telegramRequiredMsg.id = 'telegramRequiredMsg';
        telegramRequiredMsg.className = 'container mt-5 text-center';
        telegramRequiredMsg.innerHTML = `
            <div class="alert alert-warning p-5">
                <h4 class="alert-heading mb-4">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${currentLanguage === 'ua' ? 'Потрібен Telegram' : 'Telegram Required'}
                </h4>
                <p>${currentLanguage === 'ua' 
                    ? 'Будь ласка, відкрийте цей додаток через Telegram, натиснувши відповідну кнопку у боті.' 
                    : 'Please open this application through Telegram by clicking the appropriate button in the bot.'}
                </p>
                <hr>
                <p class="mb-0">
                    ${currentLanguage === 'ua' 
                        ? 'Цей додаток працює тільки як міні-додаток всередині Telegram.' 
                        : 'This application works only as a mini app inside Telegram.'}
                </p>
                <div class="mt-4">
                    <img src="https://telegram.org/img/t_logo.svg" alt="Telegram Logo" width="64" height="64">
                </div>
            </div>
        `;
        document.body.appendChild(telegramRequiredMsg);
    } else {
        telegramRequiredMsg.style.display = 'block';
    }
}

function updateUserDataAndUI(userData) {
    // Ensure we have a single source of truth for whether the UI that depends on
    // the authenticated user has already been initialised (filters, stats etc.)
    if (typeof window._appInitialized === 'undefined') {
        window._appInitialized = false;
    }
    if (userData && userData.id) {
        currentUser.id = userData.id.toString();
        currentUser.role = userData.role || 'user';
        currentUser.isMainAdmin = userData.isMainAdmin || false;
        
        localStorage.setItem('user', JSON.stringify({
            id: currentUser.id,
            role: currentUser.role,
            isMainAdmin: currentUser.isMainAdmin,
            username: userData.username,
            photo_url: userData.photo_url
        }));
        
        console.log('[Auth] User state updated:', currentUser);
        // Оновлюємо глобальну змінну, що визначає роль для рендеру інтерфейсу
        userRole = currentUser.role;
        // Оновлюємо інтерфейс відповідно до нової ролі
        updateUI();
        // Ініціалізуємо фільтри та перемикач статистики лише один раз
        if (!window._appInitialized) {
            initializeFilters();
            initializeStatsToggle();
            window._appInitialized = true;
        }
    } else {
        currentUser = { id: null, role: 'user', isMainAdmin: false };
        localStorage.removeItem('user');
        console.log('[Auth] User state cleared.');
    }

    updateUserProfile();
}

// Функція для автентифікації з даними користувача Telegram

async function authenticateWithTelegramUser(telegramUser, initData) {
    console.log('[Auth] Starting server authentication...');
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramUser, initData }),
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok && data.success && data.user) {
            updateUserDataAndUI(data.user);
            
            // Показуємо контент ТІЛЬКИ ПІСЛЯ успішної аутентифікації
            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('telegramRequiredMsg').style.display = 'none';

            // Завантажуємо дані, специфічні для користувача
            loadComplaints();
            showToast(currentLanguage === 'ua' ? 'Авторизація успішна' : 'Successfully authenticated', 'success');
        } else {
            throw new Error(data.error || 'Authentication failed on server');
        }
    } catch (error) {
        console.error('[Auth] Authentication process failed:', error);
        updateUserDataAndUI(null);
        showTelegramRequiredMessage();
        showToast(error.message, 'error');
    }
}

// Add Telegram login handler
window.onTelegramAuth = function(user) {
    // Зберігаємо дані користувача
    currentUser.id = user.id.toString();
    currentUser.role = user.id.toString() === process.env.ADMIN_ID ? 'admin' : 'user';
    
    // Зберігаємо в localStorage для збереження між сесіями
    localStorage.setItem('user', JSON.stringify({
        id: currentUser.id,
        role: currentUser.role,
        username: user.username || user.first_name,
        photo_url: user.photo_url
    }));
    
    // Оновлюємо UI та список звернень
    updateUI();
    updateFeedbackList();
}

async function checkAuth() {
    try {
        const response = await fetch('/api/user', {
            credentials: 'include'
        });
        if (response.ok) {
            const user = await response.json();
            currentUser.id = user.id;
            currentUser.role = user.role;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const userData = await response.json();
            isAuthenticated = true;
            userRole = userData.role;
            updateUI();
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

function updateUI() {
    const adminControls = document.querySelectorAll('.admin-only');
    adminControls.forEach(el => {
        el.style.display = userRole === 'admin' ? 'block' : 'none';
    });
    
    // Оновлюємо інформацію в профілі користувача
    updateUserProfile();
}

// Функція для оновлення інформації в профілі користувача
function updateUserProfile() {
    console.log('Updating user profile information');
    
    // Отримуємо дані користувача
    let userData;
    
    // Спочатку перевіряємо, чи є дані користувача Telegram
    if (window.tgUser) {
        userData = window.tgUser;
        console.log('Using Telegram user data for profile:', userData);
    } else {
        // Якщо немає даних Telegram, спробуємо отримати з localStorage
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                userData = JSON.parse(storedUser);
                console.log('Using stored user data for profile:', userData);
            }
        } catch (error) {
            console.error('Error getting user data from storage:', error);
        }
    }
    
    // Якщо немає даних користувача, показуємо повідомлення
    if (!userData) {
        console.warn('No user data available for profile');
        document.getElementById('userProfileName').textContent = 
            currentLanguage === 'ua' ? 'Користувач не авторизований' : 'User not authenticated';
        return;
    }
    
    // Оновлюємо фото користувача
    const profilePhoto = document.getElementById('userProfilePhoto');
    if (profilePhoto) {
        if (userData.photo_url) {
            profilePhoto.src = userData.photo_url;
        } else {
            // Використовуємо FontAwesome для аватара за замовчуванням замість зображення
            profilePhoto.style.display = 'none';
            const photoContainer = document.querySelector('.profile-photo-container');
            if (photoContainer) {
                // Перевіряємо, чи вже є іконка за замовчуванням
                if (!photoContainer.querySelector('.default-avatar-icon')) {
                    photoContainer.innerHTML = `
                        <div class="default-avatar-icon">
                            <i class="fas fa-user-circle"></i>
                        </div>
                    `;
                }
            }
        }
    }
    
    // Оновлюємо ім'я користувача
    const profileName = document.getElementById('userProfileName');
    if (profileName) {
        profileName.textContent = userData.first_name || userData.username || 
            (currentLanguage === 'ua' ? 'Невідомий користувач' : 'Unknown user');
    }
    
    // Оновлюємо роль користувача
    const profileRole = document.getElementById('userProfileRole');
    if (profileRole) {
        const role = userData.role || currentUser.role || 'user';
        profileRole.textContent = role;
        
        // Змінюємо колір бейджа в залежності від ролі
        if (role === 'admin') {
            profileRole.className = 'badge bg-danger mb-3';
        } else if (role === 'moderator') {
            profileRole.className = 'badge bg-warning mb-3';
        } else {
            profileRole.className = 'badge bg-primary mb-3';
        }
    }
    
    // Оновлюємо ID користувача
    const profileId = document.getElementById('userProfileId');
    if (profileId) {
        profileId.textContent = userData.id || '-';
    }
    
    // Оновлюємо час авторизації
    const profileAuthTime = document.getElementById('userProfileAuthTime');
    if (profileAuthTime && userData.auth_time) {
        // Форматуємо дату
        const authDate = new Date(userData.auth_time);
        profileAuthTime.textContent = authDate.toLocaleString(
            currentLanguage === 'ua' ? 'uk-UA' : 'en-US'
        );
    } else if (profileAuthTime) {
        profileAuthTime.textContent = '-';
    }

    const manageAdminsBtnContainer = document.getElementById('manageAdminsContainer');
    if (manageAdminsBtnContainer) {
        console.log(`Updating admin button visibility. Role: ${currentUser.role}`);
        manageAdminsBtnContainer.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    }
    
    // Оновлюємо статистику звернень
    updateUserComplaintsStats();
}

// 1. Відкрити головне вікно керування
async function openAdminManagementModal() {
    adminManagementModal.show();
    const container = document.getElementById('adminListContainer');
    container.innerHTML = `<div class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div></div>`;

    try {
        const response = await fetch('/api/admins', {
            headers: { 'Authorization': `Bearer ${currentUser.id}` }
        });

        if (!response.ok) throw new Error('Failed to fetch admins');

        const admins = await response.json();
        renderAdminList(admins);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<li class="list-group-item text-danger">Помилка завантаження списку.</li>`;
    }
}

// 2. Відобразити список адміністраторів
function renderAdminList(admins) {
    const container = document.getElementById('adminListContainer');
    if (admins.length === 0) {
        container.innerHTML = `<li class="list-group-item">Список адміністраторів порожній.</li>`;
        return;
    }

    container.innerHTML = admins.map(admin => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <strong class="me-2">${admin.username || '...'}</strong>
                <small class="text-muted">ID: ${admin.telegramId}</small>
                ${admin.isMainAdmin ? `<span class="badge bg-danger ms-2" data-translate="mainAdmin">Головний адмін</span>` : ''}
            </div>
            ${!admin.isMainAdmin ? `
                <button class="btn btn-outline-danger btn-sm delete-admin-btn" data-id="${admin.telegramId}" data-username="${admin.username}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            ` : ''}
        </li>
    `).join('');

    container.querySelectorAll('.delete-admin-btn').forEach(button => {
        button.addEventListener('click', handleDeleteAdminClick);
    });
}

// 3. Обробник кліку на кнопку видалення
function handleDeleteAdminClick(event) {
    const button = event.currentTarget;
    const adminId = button.dataset.id;
    const adminUsername = button.dataset.username || 'цього користувача';

    const confirmationMessage = currentLanguage === 'ua'
        ? `Ви впевнені, що хочете видалити "${adminUsername}" зі списку адміністраторів?`
        : `Are you sure you want to remove "${adminUsername}" from the administrators list?`;

    if (confirm(confirmationMessage)) {
        deleteAdmin(adminId);
    }
}

// 4. Функція видалення адміністратора
async function deleteAdmin(telegramId) {
    try {
        const response = await fetch(`/api/admins/${telegramId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.id}` }
        });
        
        if (!response.ok) {
             const errorData = await response.json();
             throw new Error(errorData.error || 'Failed to delete admin');
        }
        
        showToast(currentLanguage === 'ua' ? 'Адміністратора видалено.' : 'Admin deleted.', 'success');
        openAdminManagementModal(); // Оновити список
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

// 5. Відкрити вікно додавання адміна
function openAddAdminModal() {
    document.getElementById('addAdminForm').reset();
    adminManagementModal.hide(); // Ховаємо перше вікно
    addAdminModal.show();        // Показуємо друге
}

// 6. Зберегти нового адміністратора
async function saveNewAdmin() {
    const newAdminIdInput = document.getElementById('newAdminId');
    const telegramId = newAdminIdInput.value.trim();

    if (!telegramId) {
        showToast(currentLanguage === 'ua' ? 'Введіть Telegram ID.' : 'Please enter a Telegram ID.', 'error');
        return;
    }

    const saveButton = document.getElementById('saveNewAdminBtn');
    const resetLoadingState = showLoadingState(saveButton, '...');

    try {
        const response = await fetch('/api/admins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.id}`
            },
            body: JSON.stringify({ telegramId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add admin');
        }

        showToast(currentLanguage === 'ua' ? 'Нового адміністратора додано.' : 'New admin added successfully.', 'success');
        addAdminModal.hide(); // Ховаємо вікно додавання
        openAdminManagementModal(); // Відкриваємо та оновлюємо список

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        resetLoadingState();
    }
}

// Функція для оновлення статистики звернень у профілі користувача
function updateUserComplaintsStats() {
    console.log('Updating user complaints statistics');
    
    // Отримуємо елемент контейнера статистики
    const statsContainer = document.querySelector('.complaints-stats-container');
    
    // Перевіряємо, чи є користувач адміністратором
    const isAdmin = currentUser.role === 'admin' || document.querySelector('.badge.bg-danger') !== null;
    
    // Якщо користувач - адміністратор, приховуємо статистику
    if (isAdmin && statsContainer) {
        statsContainer.style.display = 'none';
        return;
    } else if (statsContainer) {
        statsContainer.style.display = 'block';
    }
    
    // Перевіряємо, чи є звернення
    if (!allComplaints || allComplaints.length === 0) {
        console.log('No complaints available for statistics');
        document.getElementById('totalComplaintsCount').textContent = '0';
        document.getElementById('activeComplaintsCount').textContent = '0';
        document.getElementById('answeredComplaintsCount').textContent = '0';
        return;
    }
    
    // Рахуємо кількість активних та відповідених звернень
    const totalComplaints = allComplaints.length;
    const activeComplaints = allComplaints.filter(complaint => !complaint.adminResponse).length;
    const answeredComplaints = allComplaints.filter(complaint => complaint.adminResponse).length;
    
    console.log('Complaints statistics:', {
        total: totalComplaints,
        active: activeComplaints,
        answered: answeredComplaints
    });
    
    // Оновлюємо відображення на сторінці
    document.getElementById('totalComplaintsCount').textContent = totalComplaints;
    document.getElementById('activeComplaintsCount').textContent = activeComplaints;
    document.getElementById('answeredComplaintsCount').textContent = answeredComplaints;
}

// Функція для ініціалізації кнопки розгортання/згортання статистики звернень
function initializeStatsToggle() {
    console.log('Initializing stats toggle button');
    
    const toggleStatsBtn = document.getElementById('toggleStatsBtn');
    const statsDetails = document.getElementById('statsDetails');
    
    if (!toggleStatsBtn || !statsDetails) {
        console.warn('Stats toggle elements not found in the DOM');
        return;
    }
    
    // Ініціалізуємо стан (початково деталі приховані)
    statsDetails.style.display = 'none';
    statsDetails.style.maxHeight = '0';
    statsDetails.style.overflow = 'hidden';
    statsDetails.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    
    function toggleStatsDetails() {
        if (statsDetails.style.display === 'none') {
            // Розгортаємо деталі
            statsDetails.style.display = 'block';
            statsDetails.style.maxHeight = statsDetails.scrollHeight + 'px';
            statsDetails.style.opacity = '1';
            toggleStatsBtn.querySelector('i').classList.remove('fa-chevron-down');
            toggleStatsBtn.querySelector('i').classList.add('fa-chevron-up');
        } else {
            // Згортаємо деталі
            statsDetails.style.maxHeight = '0';
            statsDetails.style.opacity = '0';
            setTimeout(() => {
                statsDetails.style.display = 'none';
            }, 300);
            toggleStatsBtn.querySelector('i').classList.remove('fa-chevron-up');
            toggleStatsBtn.querySelector('i').classList.add('fa-chevron-down');
        }
    }
    
    // Додаємо обробник події
    toggleStatsBtn.addEventListener('click', toggleStatsDetails);
}

const translations = {
    ua: {
        submitFeedback: 'Надіслати звернення',
        feedbackType: 'Тип звернення',
        complaint: 'Скарга',
        suggestion: 'Пропозиція',
        subject: 'Тема',
        message: 'Повідомлення',
        contactInfo: 'Контактна інформація',
        includeContactInfo: 'Додати мою контактну інформацію',
        submit: 'Надіслати',
        feedbackList: 'Список звернень',
        date: 'Дата',
        status: 'Статус',
        new: 'Нове',
        answered: 'Відповідь надано',
        adminResponse: 'Відповідь адміністратора',
        responseDate: 'Дата відповіді',
        answer: 'Відповісти',
        yourResponse: 'Ваша відповідь',
        send: 'Надіслати',
        cancel: 'Скасувати',
        filters: 'Фільтри',
        showAnswered: 'Лише з відповіддю',
        newestFirst: 'Спочатку нові',
        oldestFirst: 'Спочатку старі',
        details: 'Деталі',
        back: 'Назад',
        complaintDetails: 'Деталі звернення',
        noSubject: 'Без теми',
        noContactInfo: 'Не вказано',
        anonymous: 'Анонімно',
        faqTitle: 'Часті запитання',
        howToLeaveComplaint: 'Як залишити скаргу?',
        faqAnswer1: 'Ви можете залишити скаргу через форму зворотного зв\'язку.',
        howToLeaveSuggestion: 'Як залишити пропозицію?',
        faqAnswer2: 'Ви можете залишити пропозицію, використовуючи ту саму форму.',
        howToGetResponse: 'Як отримати відповідь?',
        faqAnswer3: 'Відповідь надається адміністратором після розгляду звернення.',
        profile: 'Профіль користувача',
        userProfile: 'Профіль',
        userId: 'ID користувача',
        authTime: 'Час авторизації',
        complaintsStats: 'Статистика',
        totalComplaints: 'Всього звернень',
        activeComplaints: 'Активні звернення',
        answeredComplaints: 'Звернення з відповіддю',
        showMore: 'Показати більше',
        showLess: 'Згорнути',
        dateFilter: 'Фільтр за датою',
        selectDate: 'Оберіть дату',
        startDate: 'Початкова дата',
        endDate: 'Кінцева дата',
        clearFilter: 'Очистити',
        noFeedback: 'Немає звернень',
        totalComplaintsLabel: 'Загалом скарг',
        totalSuggestionsLabel: 'Загалом пропозицій',
        manageAdmins: 'Керування адміністраторами',
        adminListTitle: 'Список адміністраторів',
        close: 'Закрити',
        addAdminTitle: 'Додати нового адміністратора',
        newAdminIdLabel: 'Telegram ID користувача',
        newAdminIdHelp: 'Ви можете отримати ID користувача за допомогою спеціальних ботів, наприклад, @userinfobot.',
        add: 'Додати',
        delete: 'Видалити',
        mainAdmin: 'Головний адмін'
    },
    en: {
        submitFeedback: 'Submit Feedback',
        feedbackType: 'Feedback Type',
        complaint: 'Complaint',
        suggestion: 'Suggestion',
        subject: 'Subject',
        message: 'Message',
        contactInfo: 'Contact Information',
        includeContactInfo: 'Include my contact information',
        submit: 'Submit',
        feedbackList: 'Feedback List',
        date: 'Date',
        status: 'Status',
        new: 'New',
        answered: 'Answered',
        adminResponse: 'Admin Response',
        responseDate: 'Response Date',
        answer: 'Answer',
        yourResponse: 'Your Response',
        send: 'Send',
        cancel: 'Cancel',
        filters: 'Filters',
        showAnswered: 'Only with response',
        newestFirst: 'Newest first',
        oldestFirst: 'Oldest first',
        details: 'Details',
        back: 'Back',
        complaintDetails: 'Complaint Details',
        noSubject: 'No subject',
        noContactInfo: 'Not specified',
        anonymous: 'Anonymous',
        faqTitle: 'FAQ',
        howToLeaveComplaint: 'How to leave a complaint?',
        faqAnswer1: 'You can leave a complaint through the feedback form.',
        howToLeaveSuggestion: 'How to leave a suggestion?',
        faqAnswer2: 'You can leave a suggestion using the same form.',
        howToGetResponse: 'How to get a response?',
        faqAnswer3: 'The response is provided by the admin after reviewing the submission.',
        profile: 'User Profile',
        userProfile: 'Profile',
        userId: 'User ID',
        authTime: 'Authentication Time',
        complaintsStats: 'Statistics',
        totalComplaints: 'Total Appeal',
        activeComplaints: 'Active Appeal',
        answeredComplaints: 'Appeal with responses',
        showMore: 'Show More',
        showLess: 'Show Less',
        dateFilter: 'Date filter',
        selectDate: 'Select date',
        startDate: 'Start date',
        endDate: 'End date',
        clearFilter: 'Clear',
        noFeedback: 'No feedback',
        totalComplaintsLabel: 'Total Complaints',
        totalSuggestionsLabel: 'Total Suggestions',
        manageAdmins: 'Manage Admins',
        adminListTitle: 'Administrator List',
        close: 'Close',
        addAdminTitle: 'Add New Administrator',
        newAdminIdLabel: 'User Telegram ID',
        newAdminIdHelp: 'You can get a user\'s ID via special bots, e.g., @userinfobot.',
        add: 'Add',
        delete: 'Delete',
        mainAdmin: 'Main Admin',
    }
};

async function loadPublicStats() {
    console.log('Fetching public stats...');
    const statsBlock = document.getElementById('publicStats');
    const complaintsCountEl = document.getElementById('totalComplaintsStat');
    const suggestionsCountEl = document.getElementById('totalSuggestionsStat');

    try {
        const response = await fetch('/api/complaints/stats');
        if (!response.ok) {
            throw new Error(`Failed to fetch stats: ${response.status}`);
        }
        const stats = await response.json();
        
        console.log('Received public stats:', stats);

        if (complaintsCountEl) {
            complaintsCountEl.textContent = stats.complaints || 0;
        }
        if (suggestionsCountEl) {
            suggestionsCountEl.textContent = stats.suggestions || 0;
        }

    } catch (error) {
        console.error('Error loading public stats:', error);
        if (statsBlock) {
             statsBlock.innerHTML = `<p class="text-danger small w-100 text-center">${currentLanguage === 'ua' ? 'Не вдалося завантажити статистику.' : 'Could not load stats.'}</p>`;
        }
    }
}

function setLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[lang][key]) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = translations[lang][key];
            } else {
                element.textContent = translations[lang][key];
            }
        }
    });
    updateFeedbackList();
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString(currentLanguage === 'ua' ? 'uk-UA' : 'en-US');
}

function renderComplaint(complaint) {
    // Визначаємо, як відображати контактну інформацію
    let contactInfoDisplay = '';
    if (complaint.contactInfo) {
        // Перевіряємо, чи це анонімне звернення
        if (complaint.contactInfo === 'Анонімно' || complaint.contactInfo === 'Anonymous') {
            contactInfoDisplay = `<strong>${translations[currentLanguage].contactInfo}:</strong> <em>${translations[currentLanguage].anonymous}</em>`;
        } else {
            contactInfoDisplay = `<strong>${translations[currentLanguage].contactInfo}:</strong> ${complaint.contactInfo}`;
        }
    } else {
        contactInfoDisplay = `<strong>${translations[currentLanguage].contactInfo}:</strong> <em>${translations[currentLanguage].noContactInfo}</em>`;
    }

    return `
        <div class="feedback-item ${complaint.type.toLowerCase()} fade-in">
            <h6>
                <span>
                    <i class="fas fa-${complaint.type === 'complaint' ? 'exclamation-circle' : 'lightbulb'} me-2"></i>
                    ${translations[currentLanguage][complaint.type.toLowerCase()]}
                </span>
                <span class="status ${complaint.status}">${translations[currentLanguage][complaint.status]}</span>
            </h6>
            <div class="feedback-subject"><strong>${translations[currentLanguage].subject}:</strong> ${complaint.subject || translations[currentLanguage].noSubject}</div>
            <div class="feedback-meta">
                ${contactInfoDisplay}
                <span class="ms-2"><i class="far fa-clock me-1"></i>${formatDate(complaint.date || complaint.createdAt)}</span>
                ${complaint.adminResponse ? `<span class="badge bg-success ms-2"><i class="fas fa-reply me-1"></i>${translations[currentLanguage].answered}</span>` : ''}
            </div>
            <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" onclick="showComplaintDetails('${complaint._id || complaint.id}')">
                    <i class="fas fa-eye me-1"></i>
                    ${translations[currentLanguage].details}
                </button>
                ${userRole === 'admin' && !complaint.adminResponse ? `
                    <button class="btn btn-sm btn-primary ms-2" onclick="showResponseModal('${complaint._id || complaint.id}')">
                        <i class="fas fa-reply me-1"></i>
                        ${translations[currentLanguage].answer}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

let allComplaints = [];

async function loadComplaints() {
    try {
        console.log('Loading complaints with user role:', currentUser.role);
        
        // Перевіряємо, чи користувач авторизований
        if (!currentUser.id) {
            console.log('User not authenticated, showing login prompt');
            const feedbackList = document.getElementById('feedbackList');
            feedbackList.innerHTML = `
                <div class="alert alert-warning">
                    ${currentLanguage === 'ua' 
                        ? 'Увійдіть через Telegram, щоб переглянути звернення' 
                        : 'Please login with Telegram to view feedback'}
                </div>
            `;
            return;
        }
        
        // Показуємо індикатор завантаження
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = `
            <div class="d-flex justify-content-center my-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
        
        // Логуємо інформацію про користувача перед запитом
        console.log('User info before request:', {
            id: currentUser.id,
            role: currentUser.role,
            authHeader: `Bearer ${currentUser.id}`
        });
        
        // Надсилаємо запит з авторизацією та явно вказуємо userId в URL
        const response = await fetch(`/api/complaints?userId=${currentUser.id}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.id}`
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch complaints: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        allComplaints = data.complaints || data;
        
        console.log(`Loaded ${allComplaints.length} complaints, user role: ${currentUser.role}`);
        
        // Додаємо атрибут data-id до кожного звернення для подальшого використання
        allComplaints.forEach(complaint => {
            if (!complaint.id && complaint._id) {
                complaint.id = complaint._id;
            }
        });
        
        filterAndDisplayComplaints();
        
        // Оновлюємо статистику звернень у профілі користувача
        updateUserComplaintsStats();
    } catch (error) {
        console.error('Error loading complaints:', error);
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = `
            <div class="alert alert-danger">
                ${currentLanguage === 'ua' 
                    ? 'Помилка при завантаженні звернень' 
                    : 'Failed to load complaints'}
            </div>
        `;
    }
}

function filterAndDisplayComplaints() {
    console.log('Filtering and displaying complaints, total count:', allComplaints.length);
    
    const complaintFilterChecked = document.getElementById('complaintFilter').checked;
    const suggestionFilterChecked = document.getElementById('suggestionFilter').checked;
    const answeredFilterChecked = document.getElementById('answeredFilter').checked;
    const sortOrder = document.getElementById('sortOrder').value;
    
    // Get date filter values
    const singleDateValue = document.getElementById('singleDateFilter').value;
    const startDateValue = document.getElementById('startDateFilter').value;
    const endDateValue = document.getElementById('endDateFilter').value;
    
    console.log('Filter settings:', {
        complaints: complaintFilterChecked,
        suggestions: suggestionFilterChecked,
        answered: answeredFilterChecked,
        sortOrder: sortOrder,
        singleDate: singleDateValue,
        startDate: startDateValue,
        endDate: endDateValue
    });
    
    let filteredComplaints = allComplaints.filter(complaint => {
        if (complaint.type === 'complaint' && !complaintFilterChecked) return false;
        if (complaint.type === 'suggestion' && !suggestionFilterChecked) return false;
        
        if (answeredFilterChecked && !complaint.adminResponse) return false;
        
        // Apply date filtering
        const complaintDate = new Date(complaint.date || complaint.createdAt);
        
        // Format complaint date to YYYY-MM-DD for comparison
        const complaintDateFormatted = complaintDate.toISOString().split('T')[0];
        
        // Single date filter
        if (singleDateValue) {
            return complaintDateFormatted === singleDateValue;
        }
        
        // Date range filter
        if (startDateValue && endDateValue) {
            return complaintDateFormatted >= startDateValue && complaintDateFormatted <= endDateValue;
        }
        
        // Start date only
        if (startDateValue) {
            return complaintDateFormatted >= startDateValue;
        }
        
        // End date only
        if (endDateValue) {
            return complaintDateFormatted <= endDateValue;
        }
        
        return true;
    });
    
    filteredComplaints.sort((a, b) => {
        const dateA = new Date(a.date || a.createdAt);
        const dateB = new Date(b.date || b.createdAt);
        
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    console.log('Filtered complaints count:', filteredComplaints.length);
    
    const feedbackList = document.getElementById('feedbackList');
    
    if (filteredComplaints.length === 0) {
        feedbackList.innerHTML = `<p class="text-muted">${translations[currentLanguage].noFeedback}</p>`;
        return;
    }
    
    // Логуємо перші кілька скарг для діагностики
    if (filteredComplaints.length > 0) {
        console.log('First complaint example:', {
            id: filteredComplaints[0].id || filteredComplaints[0]._id,
            type: filteredComplaints[0].type,
            userId: filteredComplaints[0].userId,
            date: filteredComplaints[0].date || filteredComplaints[0].createdAt,
            hasAdminResponse: !!filteredComplaints[0].adminResponse
        });
    }
    
    feedbackList.innerHTML = filteredComplaints
        .map(renderComplaint)
        .join('');
}

async function updateFeedbackList() {
    console.log('Updating feedback list with user data:', {
        currentUser: currentUser,
        tgUser: window.tgUser
    });
    
    await loadComplaints();
}

function initializeFilters() {
    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const filtersContainer = document.getElementById('filtersContainer');
    
    toggleFiltersBtn.addEventListener('click', () => {
        filtersContainer.style.display = filtersContainer.style.display === 'none' ? 'block' : 'none';
    });
    
    document.getElementById('complaintFilter').addEventListener('change', filterAndDisplayComplaints);
    document.getElementById('suggestionFilter').addEventListener('change', filterAndDisplayComplaints);
    document.getElementById('answeredFilter').addEventListener('change', filterAndDisplayComplaints);
    document.getElementById('sortOrder').addEventListener('change', filterAndDisplayComplaints);
    
    // Initialize date pickers if Flatpickr is available
    if (typeof flatpickr !== 'undefined') {
        // Configure single date picker
        const singleDatePicker = flatpickr('#singleDateFilter', {
            dateFormat: 'Y-m-d',
            locale: currentLanguage === 'ua' ? 'uk' : 'en',
            onChange: function(selectedDates) {
                // Clear range date pickers when single date is selected
                if (selectedDates.length > 0) {
                    startDatePicker.clear();
                    endDatePicker.clear();
                }
                filterAndDisplayComplaints();
            }
        });
        
        // Configure start date picker
        const startDatePicker = flatpickr('#startDateFilter', {
            dateFormat: 'Y-m-d',
            locale: currentLanguage === 'ua' ? 'uk' : 'en',
            onChange: function(selectedDates) {
                // Clear single date picker when range date is selected
                if (selectedDates.length > 0) {
                    singleDatePicker.clear();
                    
                    // Set the minimum date for end date picker
                    endDatePicker.set('minDate', selectedDates[0]);
                }
                filterAndDisplayComplaints();
            }
        });
        
        // Configure end date picker
        const endDatePicker = flatpickr('#endDateFilter', {
            dateFormat: 'Y-m-d',
            locale: currentLanguage === 'ua' ? 'uk' : 'en',
            onChange: function(selectedDates) {
                // Clear single date picker when range date is selected
                if (selectedDates.length > 0) {
                    singleDatePicker.clear();
                    
                    // Set the maximum date for start date picker
                    startDatePicker.set('maxDate', selectedDates[0]);
                }
                filterAndDisplayComplaints();
            }
        });
        
        // Add event listener for clear button
        document.getElementById('clearDateFilter').addEventListener('click', () => {
            singleDatePicker.clear();
            startDatePicker.clear();
            endDatePicker.clear();
            
            // Reset min/max constraints
            startDatePicker.set('maxDate', null);
            endDatePicker.set('minDate', null);
            
            filterAndDisplayComplaints();
        });
    } else {
        // Fallback to native date inputs if Flatpickr is not available
        const singleDateInput = document.getElementById('singleDateFilter');
        const startDateInput = document.getElementById('startDateFilter');
        const endDateInput = document.getElementById('endDateFilter');
        
        // Set input type to date for native date pickers
        singleDateInput.type = 'date';
        startDateInput.type = 'date';
        endDateInput.type = 'date';
        
        // Add event listeners
        singleDateInput.addEventListener('change', () => {
            startDateInput.value = '';
            endDateInput.value = '';
            filterAndDisplayComplaints();
        });
        
        startDateInput.addEventListener('change', () => {
            singleDateInput.value = '';
            filterAndDisplayComplaints();
        });
        
        endDateInput.addEventListener('change', () => {
            singleDateInput.value = '';
            filterAndDisplayComplaints();
        });
        
        document.getElementById('clearDateFilter').addEventListener('click', () => {
            singleDateInput.value = '';
            startDateInput.value = '';
            endDateInput.value = '';
            filterAndDisplayComplaints();
        });
    }
}

document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = window.tgUser?.id || currentUser.id;
    
    if (!userId) {
        showToast(
            currentLanguage === 'ua' 
                ? 'Будь ласка, увійдіть через Telegram, щоб надсилати звернення' 
                : 'Please login with Telegram to submit feedback',
            'warning'
        );
        return;
    }
    
    const type = document.getElementById('type').value;
    const subject = document.getElementById('subject').value.trim();
    const message = document.getElementById('message').value.trim();
    const includeContactInfo = document.getElementById('includeContactInfo').checked;
    
    let contactInfo;
    if (includeContactInfo) {
        contactInfo = window.tgUser?.username || 
                      (window.tgUser?.first_name ? `${window.tgUser.first_name} ${window.tgUser.last_name || ''}`.trim() : null) ||
                      `User ID: ${userId}`;
    } else {
        contactInfo = currentLanguage === 'ua' ? 'Анонімно' : 'Anonymous';
    }
    
    resetFieldHighlights();
    let isValid = true;
    let errorMessages = [];

    if (!subject) {
        isValid = false;
        const errorMsg = currentLanguage === 'ua' ? 'Будь ласка, вкажіть тему звернення' : 'Please enter a subject';
        errorMessages.push(errorMsg);
        highlightField('subject', errorMsg);
    }
    
    if (!message) {
        isValid = false;
        const errorMsg = currentLanguage === 'ua' ? 'Будь ласка, введіть текст повідомлення' : 'Please enter a message';
        errorMessages.push(errorMsg);
        highlightField('message', errorMsg);
    } else if (message.length < 10) {
        isValid = false;
        const errorMsg = currentLanguage === 'ua' ? 'Повідомлення має містити щонайменше 10 символів' : 'Message should be at least 10 characters long';
        errorMessages.push(errorMsg);
        highlightField('message', errorMsg);
    }
    
    if (!isValid) {
        showToast(errorMessages[0], 'error');
        return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    const resetLoadingState = showLoadingState(submitButton, currentLanguage === 'ua' ? 'Надсилання...' : 'Sending...');
    
    const formData = {
        type: type,
        subject: subject,
        message: message,
        contactInfo: contactInfo,
        userId: userId
    };

    try {
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userId}`
            },
            body: JSON.stringify(formData),
            credentials: 'include'
        });
        
        // --- ЗМІНЕНО: Покращена логіка обробки помилок ---
        if (response.ok) { // Успішна відповідь (статус 2xx)
            const responseData = await response.json();
            console.log('Complaint submitted successfully:', responseData);
            
            document.getElementById('feedbackForm').reset();
            resetFieldHighlights();
            
            showToast(
                currentLanguage === 'ua' 
                    ? 'Ваше звернення успішно надіслано!' 
                    : 'Your feedback has been submitted successfully!',
                'success'
            );
            
            setTimeout(() => {
                loadComplaints();
            }, 500);

        } else { // Обробка помилок (статус 4xx або 5xx)
            let errorData;
            try {
                // Намагаємося отримати JSON з тіла відповіді
                errorData = await response.json();
            } catch (e) {
                // Якщо не вдалося, створюємо загальний об'єкт помилки
                errorData = { message: 'Сталася невідома помилка на сервері.' };
            }

            // Перевіряємо, чи це помилка модерації від Gemini (статус 400 і є поле 'reason')
            if (response.status === 400 && errorData.reason) {
                // Формуємо детальне повідомлення для користувача
                const fullErrorMessage = `${errorData.message} <br><strong>${errorData.reason}</strong>`;
                showToast(fullErrorMessage, 'error');
            } else {
                // Це інша помилка (напр. 500 - Internal Server Error)
                const errorMessage = errorData.error || errorData.message || (currentLanguage === 'ua' ? 'Невідома помилка' : 'Unknown error');
                 showToast(
                    (currentLanguage === 'ua' ? 'Помилка: ' : 'Error: ') + errorMessage,
                    'error'
                );
            }
        }
        // --- КІНЕЦЬ ЗМІН ---

    } catch (error) {
        console.error('Error submitting feedback:', error);
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка мережі. Перевірте з\'єднання.' 
                : 'Network error. Please check your connection.',
            'error'
        );
    } finally {
        // Завжди відновлюємо кнопку після запиту
        resetLoadingState();
    }
});

function highlightField(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('is-invalid');
        
        // Додаємо обробник події для зняття виділення при фокусі
        field.addEventListener('focus', function onFocus() {
            field.classList.remove('is-invalid');
            field.removeEventListener('focus', onFocus);
        });
        
        // Додаємо повідомлення про помилку
        const feedbackElement = field.parentNode.querySelector('.invalid-feedback');
        if (feedbackElement) {
            feedbackElement.textContent = message;
        } else {
            const feedbackHtml = `<div class="invalid-feedback">${message}</div>`;
            field.parentNode.insertAdjacentHTML('beforeend', feedbackHtml);
        }
    }
}

// Функція для зняття виділення з усіх полів
function resetFieldHighlights() {
    const fields = ['type', 'subject', 'message', 'contactInfo'];
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.remove('is-invalid');
            const feedbackElement = field.parentNode.querySelector('.invalid-feedback');
            if (feedbackElement) {
                feedbackElement.remove();
            }
        }
    });
}

socket.on('newComplaint', () => {
    updateFeedbackList();
    loadPublicStats();
});

socket.on('complaintUpdated', () => {
    updateFeedbackList();
});

// Функція для показу модального вікна відповіді
function showResponseModal(complaintId) {
    console.log('Showing response modal for complaint:', complaintId);
    
    // Створюємо модальне вікно, якщо його ще немає
    let modal = document.getElementById('responseModal');
    
    if (!modal) {
        console.log('Creating new response modal');
        const modalHtml = `
            <div class="modal fade" id="responseModal" tabindex="-1" aria-labelledby="responseModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="responseModalLabel">${currentLanguage === 'ua' ? 'Відповідь на звернення' : 'Response to Feedback'}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <form id="responseForm">
                                <input type="hidden" id="complaintId">
                                <div class="mb-3">
                                    <label for="responseText" class="form-label">${currentLanguage === 'ua' ? 'Текст відповіді' : 'Response Text'}</label>
                                    <textarea class="form-control" id="responseText" rows="5" required></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${currentLanguage === 'ua' ? 'Скасувати' : 'Cancel'}</button>
                            <button type="button" class="btn btn-primary" id="sendResponseBtn">${currentLanguage === 'ua' ? 'Надіслати' : 'Send'}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('responseModal');
        
        // Додаємо обробник події для кнопки надсилання відповіді
        document.getElementById('sendResponseBtn').addEventListener('click', sendResponse);
    }
    
    // Встановлюємо ID звернення
    document.getElementById('complaintId').value = complaintId;
    
    // Показуємо модальне вікно
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// Функція для надсилання відповіді на звернення
async function sendResponse() {
    const complaintId = document.getElementById('complaintId').value;
    const responseText = document.getElementById('responseText').value;
    
    console.log('Sending response for complaint:', complaintId);
    
    if (!responseText.trim()) {
        console.error('Response text is empty');
        showToast(
            currentLanguage === 'ua' 
                ? 'Будь ласка, введіть текст відповіді' 
                : 'Please enter response text',
            'error'
        );
        return;
    }
    
    // Показуємо індикатор завантаження
    const sendResponseBtn = document.getElementById('sendResponseBtn');
    const originalButtonText = sendResponseBtn.innerHTML;
    const resetLoadingState = showLoadingState(sendResponseBtn, currentLanguage === 'ua' ? 'Надсилання...' : 'Sending...');
    
    try {
        // Показуємо індикатор завантаження
        const response = await fetch(`/api/complaints/${complaintId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.id}`
            },
            body: JSON.stringify({ response: responseText }),
            credentials: 'include'
        });
        
        // Відновлюємо кнопку
        resetLoadingState();
        
        if (response.ok) {
            console.log('Response sent successfully');
            
            // Закриваємо модальне вікно
            const modal = document.getElementById('responseModal');
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
            
            // Оновлюємо список звернень
            updateFeedbackList();
            
            // Якщо відкрита сторінка деталей, оновлюємо її
            const detailsContainer = document.getElementById('complaintDetailsContainer');
            if (detailsContainer.style.display !== 'none') {
                showComplaintDetails(complaintId);
            }
            
            // Показуємо повідомлення про успіх
            showToast(
                currentLanguage === 'ua' 
                    ? 'Відповідь успішно надіслано!' 
                    : 'Response sent successfully!',
                'success'
            );
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Unknown error' };
            }
            
            showToast(
                currentLanguage === 'ua' 
                    ? 'Помилка при надсиланні відповіді: ' + (errorData.error || 'невідома помилка')
                    : 'Error sending response: ' + (errorData.error || 'unknown error'),
                'error'
            );
        }
    } catch (error) {
        console.error('Error sending response:', error);
        
        // Відновлюємо кнопку
        const sendButton = document.getElementById('sendResponseBtn');
        const originalButtonText = sendButton.innerHTML;
        sendButton.disabled = false;
        sendButton.innerHTML = originalButtonText;
        
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка при надсиланні відповіді: ' + error.message 
                : 'Error sending response: ' + error.message,
            'error'
        );
    }
}

// Функція для відображення деталей звернення
function showComplaintDetails(complaintId) {
    console.log('Showing complaint details for:', complaintId);
    
    // Знаходимо звернення за ID
    const complaint = allComplaints.find(c => (c._id || c.id) === complaintId);
    if (!complaint) {
        console.error('Complaint not found:', complaintId);
        showToast(
            currentLanguage === 'ua' 
                ? 'Звернення не знайдено' 
                : 'Complaint not found',
            'error'
        );
        return;
    }
    
    // Приховуємо основний контент і показуємо деталі
    const mainContent = document.getElementById('mainContent');
    const detailsContainer = document.getElementById('complaintDetailsContainer');
    
    // Додаємо анімацію переходу
    mainContent.style.opacity = '0';
    setTimeout(() => {
        mainContent.style.display = 'none';
        
        // Визначаємо, як відображати контактну інформацію
        let contactInfoDisplay = '';
        if (complaint.contactInfo) {
            // Перевіряємо, чи це анонімне звернення
            if (complaint.contactInfo === 'Анонімно' || complaint.contactInfo === 'Anonymous') {
                contactInfoDisplay = `<em>${translations[currentLanguage].anonymous}</em>`;
            } else {
                contactInfoDisplay = complaint.contactInfo;
            }
        } else {
            contactInfoDisplay = `<em>${translations[currentLanguage].noContactInfo}</em>`;
        }
        
        // Визначаємо іконку для типу звернення
        const typeIcon = complaint.type === 'complaint' ? 'exclamation-circle' : 'lightbulb';
        
        // Рендеримо деталі звернення
        detailsContainer.innerHTML = `
            <div class="card fade-in">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-${typeIcon} me-2"></i>
                        ${translations[currentLanguage].complaintDetails}
                    </h5>
                    <button class="btn btn-sm btn-outline-secondary" onclick="hideComplaintDetails()">
                        <i class="fas fa-arrow-left me-1"></i> ${translations[currentLanguage].back}
                    </button>
                </div>
                <div class="card-body">
                    <div class="complaint-details">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <h6><i class="fas fa-tag me-2"></i>${translations[currentLanguage].feedbackType}</h6>
                                <p>${translations[currentLanguage][complaint.type.toLowerCase()]}</p>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="fas fa-info-circle me-2"></i>${translations[currentLanguage].status}</h6>
                                <p><span class="badge ${complaint.status === 'new' ? 'bg-primary' : 'bg-success'}">${translations[currentLanguage][complaint.status]}</span></p>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <h6><i class="fas fa-heading me-2"></i>${translations[currentLanguage].subject}</h6>
                            <p>${complaint.subject || translations[currentLanguage].noSubject}</p>
                        </div>
                        
                        <div class="mb-3">
                            <h6><i class="fas fa-comment me-2"></i>${translations[currentLanguage].message}</h6>
                            <p>${complaint.message}</p>
                        </div>
                        
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <h6><i class="fas fa-user me-2"></i>${translations[currentLanguage].contactInfo}</h6>
                                <p>${contactInfoDisplay}</p>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="far fa-calendar-alt me-2"></i>${translations[currentLanguage].date}</h6>
                                <p>${formatDate(complaint.date || complaint.createdAt)}</p>
                            </div>
                        </div>
                        
                        ${complaint.adminResponse ? `
                            <div class="admin-response mt-4">
                                <h6><i class="fas fa-reply me-2"></i>${translations[currentLanguage].adminResponse}</h6>
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <p>${complaint.adminResponse.text}</p>
                                        <small class="text-muted">
                                            <i class="far fa-clock me-1"></i>
                                            ${translations[currentLanguage].responseDate}: ${formatDate(complaint.adminResponse.date)}
                                        </small>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${userRole === 'admin' && !complaint.adminResponse ? `
                            <div class="mt-4">
                                <button class="btn btn-primary" onclick="showResponseModal('${complaint._id || complaint.id}')">
                                    <i class="fas fa-reply me-2"></i>
                                    ${translations[currentLanguage].answer}
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Показуємо контейнер з деталями з анімацією
        detailsContainer.style.display = 'block';
        detailsContainer.style.opacity = '0';
        
        setTimeout(() => {
            detailsContainer.style.opacity = '1';
        }, 50);
        
        // Прокручуємо сторінку вгору
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }, 300);
}

// Функція для приховування деталей звернення і повернення до списку
function hideComplaintDetails() {
    console.log('Hiding complaint details');
    
    // Приховуємо деталі і показуємо основний контент з анімацією
    const detailsContainer = document.getElementById('complaintDetailsContainer');
    const mainContent = document.getElementById('mainContent');
    
    detailsContainer.style.opacity = '0';
    
    setTimeout(() => {
        detailsContainer.style.display = 'none';
        mainContent.style.display = 'block';
        
        setTimeout(() => {
            mainContent.style.opacity = '1';
        }, 50);
    }, 300);
}

// Функція для показу модального вікна відповіді
function showResponseModal(complaintId) {
    console.log('Showing response modal for complaint:', complaintId);
    
    // Встановлюємо ID звернення в прихованому полі
    document.getElementById('complaintId').value = complaintId;
    
    // Очищаємо поле відповіді
    document.getElementById('responseText').value = '';
    
    // Показуємо модальне вікно
    const responseModal = new bootstrap.Modal(document.getElementById('responseModal'));
    responseModal.show();
}

// Обробник події для кнопки відправки відповіді
document.getElementById('sendResponseBtn').addEventListener('click', async () => {
    const complaintId = document.getElementById('complaintId').value;
    const responseText = document.getElementById('responseText').value;
    
    if (!responseText.trim()) {
        showToast(
            currentLanguage === 'ua' 
                ? 'Будь ласка, введіть текст відповіді' 
                : 'Please enter response text',
            'warning'
        );
        return;
    }
    
    // Показуємо індикатор завантаження
    const sendButton = document.getElementById('sendResponseBtn');
    const originalButtonText = sendButton.innerHTML;
    const resetLoadingState = showLoadingState(sendButton, currentLanguage === 'ua' ? 'Надсилання...' : 'Sending...');
    
    try {
        const response = await fetch(`/api/complaints/${complaintId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.id}`
            },
            body: JSON.stringify({ response: responseText }),
            credentials: 'include'
        });
        
        // Відновлюємо кнопку
        resetLoadingState();
        
        if (response.ok) {
            const responseData = await response.json();
            console.log('Response submitted successfully:', responseData);
            
            // Закриваємо модальне вікно
            const responseModal = bootstrap.Modal.getInstance(document.getElementById('responseModal'));
            responseModal.hide();
            
            // Оновлюємо список звернень
            updateFeedbackList();
            
            // Якщо відкрита сторінка деталей, оновлюємо її
            const detailsContainer = document.getElementById('complaintDetailsContainer');
            if (detailsContainer.style.display !== 'none') {
                showComplaintDetails(complaintId);
            }
            
            // Показуємо повідомлення про успіх
            showToast(
                currentLanguage === 'ua' 
                    ? 'Відповідь успішно надіслано!' 
                    : 'Response submitted successfully!',
                'success'
            );
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Unknown error' };
            }
            
            showToast(
                currentLanguage === 'ua' 
                    ? 'Помилка при надсиланні відповіді: ' + (errorData.error || 'невідома помилка')
                    : 'Error submitting response: ' + (errorData.error || 'unknown error'),
                'error'
            );
        }
    } catch (error) {
        console.error('Error submitting response:', error);
        
        // Відновлюємо кнопку
        const sendButton = document.getElementById('sendResponseBtn');
        const originalButtonText = sendButton.innerHTML;
        sendButton.disabled = false;
        sendButton.innerHTML = originalButtonText;
        
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка при надсиланні відповіді: ' + error.message 
                : 'Error submitting response: ' + error.message,
            'error'
        );
    }
});

// Функція для показу повідомлень, які автоматично зникають
function showToast(message, type = 'success', duration = 4000) {
    console.log(`Showing toast: ${message} (${type})`);
    
    // Створюємо елемент для повідомлення
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="${type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Додаємо елемент на сторінку
    document.body.appendChild(toast);
    
    // Додаємо клас для анімації появи
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Видаляємо повідомлення після вказаного часу
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300); // Час анімації зникнення
    }, duration);
}

// Функція для ініціалізації даних користувача з localStorage
function initializeUserFromStorage() {
    console.log('Initializing user from localStorage');
    
    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const userData = JSON.parse(storedUser);
            console.log('Found stored user data:', userData);
            
            // Оновлюємо дані поточного користувача
            currentUser.id = userData.id;
            currentUser.role = userData.role || 'user';
            
            // Оновлюємо глобальні змінні для сумісності зі старим кодом
            isAuthenticated = true;
            userRole = currentUser.role;
            
            console.log('User initialized from storage:', {
                id: currentUser.id,
                role: currentUser.role
            });
            
            // Оновлюємо UI
            updateUI();
            return true;
        } else {
            console.log('No stored user data found');
            return false;
        }
    } catch (error) {
        console.error('Error initializing user from storage:', error);
        return false;
    }
}

// Функція для показу спливаючих повідомлень
function showToast(message, type = 'info') {
    // Перевіряємо, чи існує контейнер для повідомлень
    let toastContainer = document.getElementById('toastContainer');
    
    // Якщо контейнер не існує, створюємо його
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    // Створюємо унікальний ID для повідомлення
    const toastId = 'toast-' + Date.now();
    
    // Визначаємо іконку для типу повідомлення
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    // Визначаємо клас для типу повідомлення
    let bgClass = 'bg-info';
    if (type === 'success') bgClass = 'bg-success';
    if (type === 'error') bgClass = 'bg-danger';
    if (type === 'warning') bgClass = 'bg-warning';
    
    // Створюємо HTML для повідомлення
    const toastHtml = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header ${bgClass} text-white">
                <i class="${type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'}"></i>
                <strong class="me-auto">${type === 'success' ? 'Успішно' : ''}${type === 'error' ? 'Помилка' : ''}${type === 'warning' ? 'Увага' : ''}${type === 'info' ? 'Інформація' : ''}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    // Додаємо повідомлення до контейнера
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // Ініціалізуємо Bootstrap Toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { 
        autohide: true,
        delay: 3000
    });
    
    // Показуємо повідомлення
    toast.show();
    
    // Додаємо анімацію появи
    toastElement.style.transform = 'translateY(20px)';
    toastElement.style.opacity = '0';
    
    setTimeout(() => {
        toastElement.style.transition = 'all 0.3s ease';
        toastElement.style.transform = 'translateY(0)';
        toastElement.style.opacity = '1';
    }, 50);
    
    // Видаляємо повідомлення після закриття
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

// Додаємо функцію для анімації елементів при завантаженні сторінки
function animateElementsOnLoad() {
    const elements = document.querySelectorAll('.card, .feedback-item, .navbar');
    
    elements.forEach((element, index) => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });
}

// Додаємо функцію для показу стану завантаження на кнопках
function showLoadingState(button, loadingText) {
    const originalContent = button.innerHTML;
    const originalDisabled = button.disabled;
    
    button.disabled = true;
    button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${loadingText}
    `;
    
    return function() {
        button.innerHTML = originalContent;
        button.disabled = originalDisabled;
    };
}

// Функція для ініціалізації мобільних вкладок
function initializeMobileTabs() {
    const mobileTabs = document.querySelectorAll('.mobile-tab');
    
    mobileTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Видаляємо активний клас з усіх вкладок
            mobileTabs.forEach(t => t.classList.remove('active'));
            
            // Додаємо активний клас до поточної вкладки
            this.classList.add('active');
            
            // Отримуємо цільову секцію
            const targetId = this.getAttribute('data-target');
            
            // Приховуємо всі секції
            document.querySelectorAll('.tab-section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Показуємо цільову секцію
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // Оновлюємо вкладки відповідно до ролі користувача
    updateMobileTabsForRole();
}

// Функція для оновлення мобільних вкладок відповідно до ролі користувача
function updateMobileTabsForRole() {
    const adminTab = document.querySelector('.mobile-tab[data-target="feedbackListSection"]');
    if (adminTab) {
        adminTab.style.display = userRole === 'admin' ? 'block' : 'none';
    }
}

// Функція для перемикання між вкладками
function switchTab(tabId) {
    // Приховуємо всі вкладки
    document.querySelectorAll('.tab-section').forEach(section => {
        section.classList.remove('active');
    });

    // Показуємо вибрану вкладку
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
        
        // Якщо це вкладка профілю, ініціалізуємо перемикач статистики
        if (tabId === 'profileSection') {
            // Використовуємо setTimeout, щоб дати DOM час для оновлення
            setTimeout(() => {
                initializeStatsToggle();
            }, 50);
        }
    }
}

// Оновлюємо обробники подій для мобільних вкладок
function initializeMobileTabs() {
    const mobileTabs = document.querySelectorAll('.mobile-tab');
    
    mobileTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Видаляємо активний клас з усіх вкладок
            mobileTabs.forEach(t => t.classList.remove('active'));
            
            // Додаємо активний клас до поточної вкладки
            this.classList.add('active');
            
            // Отримуємо цільову секцію
            const targetId = this.getAttribute('data-target');
            
            // Перемикаємо вкладку
            switchTab(targetId);
        });
    });
    
    // Оновлюємо вкладки відповідно до ролі користувача
    updateMobileTabsForRole();
}

// Оновлюємо функцію ініціалізації перемикача статистики
function initializeStatsToggle() {
    console.log('Initializing stats toggle button');
    
    const toggleStatsBtn = document.getElementById('toggleStatsBtn');
    const statsDetails = document.getElementById('statsDetails');
    
    if (!toggleStatsBtn || !statsDetails) {
        console.warn('Stats toggle elements not found in the DOM');
        return;
    }
    
    // Видаляємо попередні обробники подій, щоб уникнути дублювання
    const newToggleBtn = toggleStatsBtn.cloneNode(true);
    toggleStatsBtn.parentNode.replaceChild(newToggleBtn, toggleStatsBtn);
    
    // Ініціалізуємо стан (початково деталі приховані)
    statsDetails.style.display = 'none';
    statsDetails.style.maxHeight = '0';
    statsDetails.style.overflow = 'hidden';
    statsDetails.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    
    function toggleStatsDetails() {
        if (statsDetails.style.display === 'none') {
            // Розгортаємо деталі
            statsDetails.style.display = 'block';
            // Встановлюємо висоту перед анімацією
            requestAnimationFrame(() => {
                statsDetails.style.maxHeight = statsDetails.scrollHeight + 'px';
                statsDetails.style.opacity = '1';
            });
            newToggleBtn.querySelector('i').classList.remove('fa-chevron-down');
            newToggleBtn.querySelector('i').classList.add('fa-chevron-up');
        } else {
            // Згортаємо деталі
            statsDetails.style.maxHeight = '0';
            statsDetails.style.opacity = '0';
            setTimeout(() => {
                if (statsDetails.style.maxHeight === '0px') {
                    statsDetails.style.display = 'none';
                }
            }, 300);
            newToggleBtn.querySelector('i').classList.remove('fa-chevron-up');
            newToggleBtn.querySelector('i').classList.add('fa-chevron-down');
        }
    }
    
    // Додаємо обробник події для кнопки
    newToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleStatsDetails();
    });
    
    // Додаємо обробник для всього заголовка (для кращого UX)
    const statsHeader = document.getElementById('statsHeader');
    if (statsHeader) {
        statsHeader.addEventListener('click', (e) => {
            // Якщо клік не на кнопці, перемикаємо стан
            if (e.target !== newToggleBtn && !newToggleBtn.contains(e.target)) {
                toggleStatsDetails();
            }
        });
    }
}