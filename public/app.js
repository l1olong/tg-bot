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
        
        // Автоматично авторизуємо користувача
        authenticateWithTelegramUser(user, initData);
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
        oldestFirst: 'Спочатку старі'
    },
    en: {
        submitFeedback: 'Submit Feedback',
        feedbackType: 'Feedback Type',
        complaint: 'Complaint',
        suggestion: 'Suggestion',
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
        oldestFirst: 'Oldest first'
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
            <div class="feedback-message">${complaint.message}</div>
            ${complaint.adminResponse ? `
                <div class="admin-response">
                    <strong>${translations[currentLanguage].adminResponse}:</strong>
                    <p>${complaint.adminResponse.text}</p>
                    <small>${translations[currentLanguage].responseDate}: ${formatDate(complaint.adminResponse.date)}</small>
                </div>
            ` : ''}
            <div class="feedback-meta">
                ${translations[currentLanguage].date}: ${formatDate(complaint.date)}
                ${complaint.contactInfo ? `| ${translations[currentLanguage].contactInfo}: ${complaint.contactInfo}` : ''}
            </div>
            ${userRole === 'admin' ? `
                <button class="btn btn-sm btn-primary" onclick="showResponseModal('${complaint.id}')">${translations[currentLanguage].answer}</button>
            ` : ''}
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
        
        // Надсилаємо запит з авторизацією
        const response = await fetch('/api/complaints', {
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
    const complaintFilterChecked = document.getElementById('complaintFilter').checked;
    const suggestionFilterChecked = document.getElementById('suggestionFilter').checked;
    const answeredFilterChecked = document.getElementById('answeredFilter').checked;
    const sortOrder = document.getElementById('sortOrder').value;
    
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
    
    const feedbackList = document.getElementById('feedbackList');
    
    if (filteredComplaints.length === 0) {
        feedbackList.innerHTML = `<p class="text-muted">${translations[currentLanguage].noFeedback}</p>`;
        return;
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
        type: document.getElementById('type').value,
        message: document.getElementById('message').value,
        contactInfo: document.getElementById('contactInfo').value || 'Anonymous',
        userId: userId // Використовуємо ID користувача Telegram
    };

    try {
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userId}` // Використовуємо ID користувача Telegram
            },
            body: JSON.stringify(formData)
        });

        // Відновлюємо кнопку
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;

        if (response.ok) {
            document.getElementById('feedbackForm').reset();
            
            // Переконуємося, що дані користувача збережені перед оновленням списку
            if (!window.tgUser && userId) {
                // Якщо з якоїсь причини window.tgUser відсутній, але userId є,
                // створюємо мінімальний об'єкт користувача
                window.tgUser = { id: userId };
                console.log('Recreated tgUser before updating feedback list:', window.tgUser);
            }
            
            // Оновлюємо список звернень
            updateFeedbackList();
            
            // Показуємо повідомлення про успіх
            showToast(
                currentLanguage === 'ua' 
                    ? 'Звернення успішно надіслано!' 
                    : 'Feedback submitted successfully!',
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