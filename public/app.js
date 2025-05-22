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

// Ініціалізація Telegram WebApp
document.addEventListener('DOMContentLoaded', () => {
    // Перевіряємо, чи запущений додаток в Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        console.log('Telegram WebApp detected');
        
        // Виводимо дані Telegram WebApp для дебагу
        console.log('WebApp initData:', window.Telegram.WebApp.initData);
        console.log('WebApp initDataUnsafe:', window.Telegram.WebApp.initDataUnsafe);
        
        // Якщо є дані користувача, виводимо їх
        if (window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
            const user = window.Telegram.WebApp.initDataUnsafe.user;
            console.log('Telegram user data:', {
                id: user.id,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name
            });
        }
        
        // Налаштовуємо WebApp
        const webApp = window.Telegram.WebApp;
        webApp.expand();
        
        // Отримуємо дані користувача з WebApp
        const initData = webApp.initData;
        
        if (initData) {
            console.log('Init data available, authenticating...');
            authenticateWithTelegram(initData);
        } else {
            console.warn('No init data available from Telegram WebApp');
            // Додаємо елемент для відображення помилки
            const debugInfo = document.createElement('div');
            debugInfo.className = 'alert alert-warning';
            debugInfo.innerHTML = 'Telegram WebApp initData is empty. Authentication may fail.';
            document.body.prepend(debugInfo);
        }
    } else {
        console.log('Not running in Telegram WebApp');
        // Перевіряємо, чи є збережені дані користувача
        initializeUserFromStorage();
        initializeFilters();
        loadComplaints();
        checkAuthStatus();
    }
});

// Функція для автентифікації через Telegram WebApp
async function authenticateWithTelegram(initData) {
    try {
        const response = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ initData }),
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.user) {
                // Зберігаємо дані користувача
                currentUser.id = data.user.id;
                currentUser.role = data.user.role;
                isAuthenticated = true;
                userRole = data.user.role;
                
                // Зберігаємо в localStorage для збереження між сесіями
                localStorage.setItem('user', JSON.stringify({
                    id: data.user.id,
                    username: data.user.username,
                    photo_url: data.user.photo_url,
                    role: data.user.role
                }));
                
                console.log('Successfully authenticated with Telegram', {
                    id: data.user.id,
                    role: data.user.role
                });
                
                // Оновлюємо UI та завантажуємо дані
                updateUI();
                loadComplaints();
            }
        } else {
            const errorData = await response.json();
            console.error('Authentication error:', errorData);
            showToast(
                currentLanguage === 'ua' 
                    ? 'Помилка автентифікації: ' + errorData.error 
                    : 'Authentication error: ' + errorData.error,
                'error'
            );
        }
    } catch (error) {
        console.error('Error during authentication:', error);
        showToast(
            currentLanguage === 'ua' 
                ? 'Помилка під час автентифікації' 
                : 'Error during authentication',
            'error'
        );
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

async function loadComplaints() {
    try {
        const response = await fetch('/api/complaints');
        if (!response.ok) throw new Error('Failed to fetch complaints');
        
        const data = await response.json();
        allComplaints = data.complaints || data;
        
        filterAndDisplayComplaints();
    } catch (error) {
        console.error('Error:', error);
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = `<div class="alert alert-danger">${
            currentLanguage === 'ua' 
                ? 'Помилка при завантаженні звернень' 
                : 'Failed to load complaints'
        }</div>`;
    }
}

async function updateFeedbackList() {
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

    const formData = {
        type: document.getElementById('type').value,
        message: document.getElementById('message').value,
        contactInfo: document.getElementById('contactInfo').value || 'Anonymous',
        userId: currentUser.id
    };

    try {
        const response = await fetch('/api/complaints', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.id}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            document.getElementById('feedbackForm').reset();
            updateFeedbackList();
            alert(
                currentLanguage === 'ua' 
                    ? 'Звернення успішно надіслано!' 
                    : 'Feedback submitted successfully!'
            );
        } else {
            alert(
                currentLanguage === 'ua' 
                    ? 'Помилка при надсиланні звернення' 
                    : 'Error submitting feedback'
            );
        }
    } catch (error) {
        console.error('Error:', error);
        alert(
            currentLanguage === 'ua' 
                ? 'Помилка при надсиланні звернення' 
                : 'Error submitting feedback'
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