const socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling']
});

let currentLanguage = 'ua';
let currentUser = {
    id: null,
    role: 'user'
};

// Authentication state
let isAuthenticated = false;
let userRole = 'user';

// Глобальна змінна для зберігання даних користувача Telegram
window.tgUser = null;

// Ініціалізація Telegram WebApp
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application');
    
    // Встановлюємо українську мову при завантаженні сторінки
    setLanguage('ua');

    // Додаємо затримку для гарантії завантаження Telegram WebApp
    setTimeout(() => {
        initializeTelegramWebApp();
    }, 500);
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

// Функція для автентифікації з даними користувача Telegram
async function authenticateWithTelegramUser(telegramUser, initData) {
    console.log('Authenticating with Telegram user data:', {
        id: telegramUser.id,
        username: telegramUser.username || telegramUser.first_name
    });
    
    try {
        // Показуємо індикатор завантаження
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'authLoadingIndicator';
        loadingIndicator.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center';
        loadingIndicator.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        loadingIndicator.style.zIndex = '9999';
        loadingIndicator.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        `;
        document.body.appendChild(loadingIndicator);
        
        // Надсилаємо запит на авторизацію
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                telegramUser,
                initData
            }),
            credentials: 'include'
        });
        
        // Видаляємо індикатор завантаження
        if (loadingIndicator && loadingIndicator.parentNode) {
            document.body.removeChild(loadingIndicator);
        }
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.user) {
                // Зберігаємо дані користувача
                currentUser.id = data.user.id;
                currentUser.role = data.user.role;
                isAuthenticated = true;
                userRole = data.user.role;
                
                // Переконуємося, що window.tgUser завжди містить актуальні дані
                if (!window.tgUser || window.tgUser.id !== telegramUser.id) {
                    window.tgUser = telegramUser;
                    console.log('Updated window.tgUser with current Telegram user data');
                }
                
                // Зберігаємо в localStorage для збереження між сесіями
                const userDataToStore = {
                    id: data.user.id,
                    username: data.user.username || telegramUser.first_name,
                    photo_url: data.user.photo_url || telegramUser.photo_url,
                    role: data.user.role,
                    auth_time: new Date().toISOString() // Додаємо час автентифікації
                };
                
                localStorage.setItem('user', JSON.stringify(userDataToStore));
                console.log('User data saved to localStorage:', userDataToStore);
                
                console.log('Successfully authenticated with Telegram', {
                    id: data.user.id,
                    role: data.user.role
                });
                
                // Показуємо основний контент
                const mainContent = document.getElementById('mainContent');
                if (mainContent) {
                    mainContent.style.display = 'block';
                }
                
                // Приховуємо повідомлення про Telegram, якщо воно є
                const telegramRequiredMsg = document.getElementById('telegramRequiredMsg');
                if (telegramRequiredMsg) {
                    telegramRequiredMsg.style.display = 'none';
                }
                
                // Оновлюємо UI та завантажуємо дані
                updateUI();
                initializeFilters();
                loadComplaints();
                
                // Показуємо повідомлення про успішну авторизацію
                showToast(
                    currentLanguage === 'ua' 
                        ? 'Успішна авторизація через Telegram' 
                        : 'Successfully authenticated with Telegram',
                    'success'
                );
            }
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Unknown error' };
            }
            
            console.error('Authentication error:', errorData);
            showToast(
                currentLanguage === 'ua' 
                    ? 'Помилка автентифікації: ' + (errorData.error || 'невідома помилка')
                    : 'Authentication error: ' + (errorData.error || 'unknown error'),
                'error'
            );
            
            // Показуємо повідомлення про необхідність відкрити через Telegram
            showTelegramRequiredMessage();
        }
    } catch (error) {
        console.error('Error during authentication:', error);
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка під час автентифікації: ' + error.message
                : 'Error during authentication: ' + error.message,
            'error'
        );
        
        // Показуємо повідомлення про необхідність відкрити через Telegram
        showTelegramRequiredMessage();
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
        submit: 'Надіслати',
        feedbackList: 'Список звернень',
        status: 'Статус',
        new: 'Нове',
        answered: 'Відповідь надано',
        date: 'Дата',
        noFeedback: 'Немає звернень',
        adminResponse: 'Відповідь адміністратора',
        responseDate: 'Дата відповіді',
        loginTitle: 'Увійти через Telegram',
        loginDescription: 'Будь ласка, увійдіть через Telegram щоб надсилати та переглядати звернення',
        logoutBtn: 'Вийти',
        loginRequired: 'Необхідно увійти для надсилання звернень',
        faqTitle: 'Часті питання',
        howToLeaveComplaint: 'Як подати скаргу?',
        howToLeaveSuggestion: 'Як подати пропозицію?',
        howToGetResponse: 'Як отримати відповідь?',
        faqAnswer1: 'Ви можете залишити скаргу через форму зворотного зв\'язку.',
        faqAnswer2: 'Ви можете залишити пропозицію, скориставшись тією ж формою.',
        faqAnswer3: 'Відповідь надається адміністратором після розгляду звернення.',
        answer: 'Відповідь',
        filters: 'Фільтри',
        showAnswered: 'Показати з відповідями',
        newestFirst: 'Спочатку нові',
        oldestFirst: 'Спочатку старі',
        details: 'Деталі',
        complaintDetails: 'Деталі звернення',
        back: 'Назад',
        noSubject: 'Без теми',
        yourResponse: 'Ваша відповідь',
        send: 'Надіслати',
        cancel: 'Скасувати'
    },
    en: {
        submitFeedback: 'Submit Feedback',
        feedbackType: 'Feedback Type',
        complaint: 'Complaint',
        suggestion: 'Suggestion',
        subject: 'Subject',
        message: 'Message',
        contactInfo: 'Contact Information',
        submit: 'Submit',
        feedbackList: 'Feedback List',
        status: 'Status',
        new: 'New',
        answered: 'Answered',
        date: 'Date',
        noFeedback: 'No feedback available',
        adminResponse: 'Admin Response',
        responseDate: 'Response Date',
        loginTitle: 'Login with Telegram',
        loginDescription: 'Please login with Telegram to submit and view feedback',
        logoutBtn: 'Logout',
        loginRequired: 'Login required to submit feedback',
        faqTitle: 'Frequently Asked Questions',
        howToLeaveComplaint: 'How to leave a complaint?',
        howToLeaveSuggestion: 'How to leave a suggestion?',
        howToGetResponse: 'How to get a response?',
        faqAnswer1: 'You can leave a complaint through the feedback form.',
        faqAnswer2: 'You can leave a suggestion using the same form.',
        faqAnswer3: 'The response is provided by the admin after reviewing the submission.',
        answer: 'Answer',
        filters: 'Filters',
        showAnswered: 'Show with responses',
        newestFirst: 'Newest first',
        oldestFirst: 'Oldest first',
        details: 'Details',
        complaintDetails: 'Complaint Details',
        back: 'Back',
        noSubject: 'No subject',
        yourResponse: 'Your Response',
        send: 'Send',
        cancel: 'Cancel'
    }
};

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
    return `
        <div class="feedback-item ${complaint.type.toLowerCase()}">
            <h6>
                ${translations[currentLanguage][complaint.type.toLowerCase()]}
                <span class="status ${complaint.status}">${translations[currentLanguage][complaint.status]}</span>
            </h6>
            <div class="feedback-subject"><strong>${translations[currentLanguage].subject}:</strong> ${complaint.subject || translations[currentLanguage].noSubject}</div>
            <div class="feedback-meta">
                ${complaint.contactInfo ? `<strong>${translations[currentLanguage].contactInfo}:</strong> ${complaint.contactInfo}` : ''}
                ${complaint.adminResponse ? `<span class="badge bg-success ms-2">${translations[currentLanguage].answered}</span>` : ''}
            </div>
            <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" onclick="showComplaintDetails('${complaint._id || complaint.id}')">${translations[currentLanguage].details}</button>
                ${userRole === 'admin' && !complaint.adminResponse ? `
                    <button class="btn btn-sm btn-primary ms-2" onclick="showResponseModal('${complaint._id || complaint.id}')">${translations[currentLanguage].answer}</button>
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
    
    console.log('Filter settings:', {
        complaints: complaintFilterChecked,
        suggestions: suggestionFilterChecked,
        answered: answeredFilterChecked,
        sortOrder: sortOrder
    });
    
    let filteredComplaints = allComplaints.filter(complaint => {
        if (complaint.type === 'complaint' && !complaintFilterChecked) return false;
        if (complaint.type === 'suggestion' && !suggestionFilterChecked) return false;
        
        if (answeredFilterChecked && !complaint.adminResponse) return false;
        
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
}

document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Перевіряємо наявність авторизації
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
    
    // Отримуємо значення полів форми
    const type = document.getElementById('type').value;
    const subject = document.getElementById('subject').value.trim();
    const message = document.getElementById('message').value.trim();
    const contactInfo = document.getElementById('contactInfo').value.trim();
    
    // Валідація полів
    let isValid = true;
    let errorMessages = [];
    
    // Перевіряємо поле "Тип звернення"
    if (!type) {
        isValid = false;
        errorMessages.push(currentLanguage === 'ua' 
            ? 'Будь ласка, виберіть тип звернення' 
            : 'Please select a feedback type');
        highlightField('type');
    }
    
    // Перевіряємо поле "Тема"
    if (!subject) {
        isValid = false;
        errorMessages.push(currentLanguage === 'ua' 
            ? 'Будь ласка, вкажіть тему звернення' 
            : 'Please enter a subject');
        highlightField('subject');
    }
    
    // Перевіряємо поле "Повідомлення"
    if (!message) {
        isValid = false;
        errorMessages.push(currentLanguage === 'ua' 
            ? 'Будь ласка, введіть текст повідомлення' 
            : 'Please enter a message');
        highlightField('message');
    } else if (message.length < 10) {
        isValid = false;
        errorMessages.push(currentLanguage === 'ua' 
            ? 'Повідомлення має містити щонайменше 10 символів' 
            : 'Message should be at least 10 characters long');
        highlightField('message');
    }
    
    // Якщо є помилки валідації, показуємо їх і перериваємо відправку
    if (!isValid) {
        // Показуємо перше повідомлення про помилку
        showToast(errorMessages[0], 'error');
        return;
    }
    
    console.log('Submitting feedback with user data:', {
        currentUser: currentUser,
        tgUser: window.tgUser,
        userId: userId
    });

    // Показуємо індикатор завантаження
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        ${currentLanguage === 'ua' ? 'Надсилання...' : 'Submitting...'}
    `;

    const formData = {
        type: type,
        subject: subject || 'Без теми',
        message: message,
        contactInfo: contactInfo || 'Anonymous',
        userId: userId // Використовуємо ID користувача Telegram
    };

    try {
        console.log('Sending complaint with data:', formData);
        
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userId}` // Використовуємо ID користувача Telegram
            },
            body: JSON.stringify(formData),
            credentials: 'include' // Важливо для передачі сесійних куків
        });

        // Відновлюємо кнопку
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;

        if (response.ok) {
            const responseData = await response.json();
            console.log('Complaint submitted successfully:', responseData);
            
            // Очищаємо форму
            document.getElementById('feedbackForm').reset();
            
            // Знімаємо виділення з полів, якщо вони були виділені
            resetFieldHighlights();
            
            // Показуємо повідомлення про успіх
            showToast(
                currentLanguage === 'ua' 
                    ? 'Ваше звернення успішно надіслано!' 
                    : 'Your feedback has been submitted successfully!',
                'success'
            );
            
            // Переконуємося, що дані користувача збережені перед оновленням списку
            if (!window.tgUser && userId) {
                // Якщо з якоїсь причини window.tgUser відсутній, але userId є,
                // створюємо мінімальний об'єкт користувача
                window.tgUser = { id: userId };
                console.log('Recreated tgUser before updating feedback list:', window.tgUser);
            }
            
            // Оновлюємо список звернень з невеликою затримкою, щоб дати час на оновлення даних у базі
            setTimeout(() => {
                loadComplaints();
            }, 500);
        } else {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Unknown error' };
            }
            
            showToast(
                currentLanguage === 'ua' 
                    ? 'Помилка при надсиланні звернення: ' + (errorData.error || 'невідома помилка')
                    : 'Error submitting feedback: ' + (errorData.error || 'unknown error'),
                'error'
            );
        }
    } catch (error) {
        console.error('Error submitting feedback:', error);
        
        // Відновлюємо кнопку
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
        
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка при надсиланні звернення: ' + error.message
                : 'Error submitting feedback: ' + error.message,
            'error'
        );
    }
});

// Функція для виділення поля з помилкою
function highlightField(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('is-invalid');
        
        // Додаємо обробник події для зняття виділення при фокусі
        field.addEventListener('focus', function onFocus() {
            field.classList.remove('is-invalid');
            field.removeEventListener('focus', onFocus);
        });
    }
}

// Функція для зняття виділення з усіх полів
function resetFieldHighlights() {
    const fields = ['type', 'subject', 'message', 'contactInfo'];
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.remove('is-invalid');
        }
    });
}

socket.on('newComplaint', () => {
    updateFeedbackList();
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
    
    try {
        // Показуємо індикатор завантаження
        const sendResponseBtn = document.getElementById('sendResponseBtn');
        const originalButtonText = sendResponseBtn.innerHTML;
        sendResponseBtn.disabled = true;
        sendResponseBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${currentLanguage === 'ua' ? 'Надсилання...' : 'Sending...'}`;
        
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
        sendResponseBtn.disabled = false;
        sendResponseBtn.innerHTML = originalButtonText;
        
        if (response.ok) {
            console.log('Response sent successfully');
            
            // Закриваємо модальне вікно
            const modal = document.getElementById('responseModal');
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
            
            // Очищаємо форму
            document.getElementById('responseForm').reset();
            
            // Оновлюємо список звернень
            updateFeedbackList();
            
            // Показуємо повідомлення про успіх
            showToast(
                currentLanguage === 'ua' 
                    ? 'Відповідь успішно надіслано!' 
                    : 'Response sent successfully!',
                'success'
            );
        } else {
            console.error('Error sending response, status:', response.status);
            
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: 'Failed to parse error response' };
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
    
    mainContent.style.display = 'none';
    
    // Рендеримо деталі звернення
    detailsContainer.innerHTML = `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">${translations[currentLanguage].complaintDetails}</h5>
                <button class="btn btn-sm btn-outline-secondary" onclick="hideComplaintDetails()">
                    <i class="fas fa-arrow-left"></i> ${translations[currentLanguage].back}
                </button>
            </div>
            <div class="card-body">
                <div class="complaint-details">
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h6>${translations[currentLanguage].feedbackType}</h6>
                            <p>${translations[currentLanguage][complaint.type.toLowerCase()]}</p>
                        </div>
                        <div class="col-md-6">
                            <h6>${translations[currentLanguage].status}</h6>
                            <p><span class="badge ${complaint.status === 'new' ? 'bg-primary' : 'bg-success'}">${translations[currentLanguage][complaint.status]}</span></p>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <h6>${translations[currentLanguage].subject}</h6>
                        <p>${complaint.subject || translations[currentLanguage].noSubject}</p>
                    </div>
                    
                    <div class="mb-3">
                        <h6>${translations[currentLanguage].message}</h6>
                        <p>${complaint.message}</p>
                    </div>
                    
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <h6>${translations[currentLanguage].contactInfo}</h6>
                            <p>${complaint.contactInfo || translations[currentLanguage].noContactInfo}</p>
                        </div>
                        <div class="col-md-6">
                            <h6>${translations[currentLanguage].date}</h6>
                            <p>${formatDate(complaint.date || complaint.createdAt)}</p>
                        </div>
                    </div>
                    
                    ${complaint.adminResponse ? `
                        <div class="admin-response mt-4">
                            <h6>${translations[currentLanguage].adminResponse}</h6>
                            <div class="card bg-light">
                                <div class="card-body">
                                    <p>${complaint.adminResponse.text}</p>
                                    <small class="text-muted">${translations[currentLanguage].responseDate}: ${formatDate(complaint.adminResponse.date)}</small>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${userRole === 'admin' && !complaint.adminResponse ? `
                        <div class="mt-4">
                            <button class="btn btn-primary" onclick="showResponseModal('${complaint._id || complaint.id}')">
                                ${translations[currentLanguage].answer}
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Показуємо контейнер з деталями
    detailsContainer.style.display = 'block';
    
    // Прокручуємо сторінку вгору
    window.scrollTo(0, 0);
}

// Функція для приховування деталей звернення і повернення до списку
function hideComplaintDetails() {
    console.log('Hiding complaint details');
    
    // Приховуємо деталі і показуємо основний контент
    const detailsContainer = document.getElementById('complaintDetailsContainer');
    const mainContent = document.getElementById('mainContent');
    
    detailsContainer.style.display = 'none';
    mainContent.style.display = 'block';
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
    
    console.log('Sending response for complaint:', complaintId);
    
    // Показуємо індикатор завантаження
    const sendButton = document.getElementById('sendResponseBtn');
    const originalButtonText = sendButton.innerHTML;
    sendButton.disabled = true;
    sendButton.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        ${currentLanguage === 'ua' ? 'Надсилання...' : 'Sending...'}
    `;
    
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
        sendButton.disabled = false;
        sendButton.innerHTML = originalButtonText;
        
        if (response.ok) {
            const responseData = await response.json();
            console.log('Response submitted successfully:', responseData);
            
            // Закриваємо модальне вікно
            const responseModal = bootstrap.Modal.getInstance(document.getElementById('responseModal'));
            responseModal.hide();
            
            // Оновлюємо список звернень
            await loadComplaints();
            
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