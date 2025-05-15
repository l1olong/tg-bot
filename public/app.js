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

// Add Telegram login handler
window.onTelegramAuth = function(user) {
    currentUser.id = user.id.toString();
    currentUser.role = user.id.toString() === process.env.ADMIN_ID ? 'admin' : 'user';
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
        answer: 'Відповідь'
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
        answer: 'Answer'
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
        </div>
    `;
}

async function updateFeedbackList() {
    try {
        const response = await fetch('/api/complaints');
        if (response.ok) {
            const complaints = await response.json();
            const feedbackList = document.getElementById('feedbackList');
            
            if (complaints.length === 0) {
                feedbackList.innerHTML = `<p class="text-muted">${translations[currentLanguage].noFeedback}</p>`;
                return;
            }

            feedbackList.innerHTML = complaints
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(renderComplaint)
                .join('');
        } else {
            document.getElementById('feedbackList').innerHTML = 
                `<div class="alert alert-warning">${translations[currentLanguage].loginRequired}</div>`;
        }
    } catch (error) {
        console.error('Error fetching feedback:', error);
    }
}

async function loadComplaints() {
    try {
        const response = await fetch('/api/complaints');
        if (!response.ok) throw new Error('Failed to fetch complaints');
        const complaints = await response.json();
        updateFeedbackList(complaints);
    } catch (error) {
        console.error('Error:', error);
        alert(
            currentLanguage === 'ua' 
                ? 'Помилка при завантаженні звернень' 
                : 'Failed to load complaints'
        );
    }
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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    loadComplaints(); // Load complaints immediately without requiring auth
    checkAuthStatus(); // Optional - check if user is logged in
});

updateFeedbackList();
setLanguage('ua');