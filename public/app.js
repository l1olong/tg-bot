const socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling']
});
let currentLanguage = 'ua';
let currentUser = null;

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

// Initialize Telegram login widget
window.onload = function() {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', process.env.BOT_USERNAME || 'YourBotUsername');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-auth-url', `${window.location.origin}/api/login`);
    document.getElementById('telegramLoginWidget').appendChild(script);
};

// Telegram auth callback
async function onTelegramAuth(user) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: user.id.toString(),
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                photoUrl: user.photo_url,
                authDate: user.auth_date,
                hash: user.hash
            })
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = {
                ...user,
                role: data.role
            };
            onLoginSuccess();
        }
    } catch (error) {
        console.error('Login error:', error);
        alert(currentLanguage === 'ua' ? 'Помилка входу' : 'Login error');
    }
}

function onLoginSuccess() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('contactInfo').value = currentUser.username || currentUser.first_name;
    if (currentUser.role === 'admin') {
        document.body.classList.add('admin-mode');
    }
    updateFeedbackList();
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
    if (!currentUser) {
        document.getElementById('feedbackList').innerHTML = 
            `<p class="text-muted">${translations[currentLanguage].loginRequired}</p>`;
        return;
    }

    try {
        const response = await fetch('/api/complaints', {
            headers: {
                'Authorization': `Bearer ${currentUser.id}`
            }
        });
        if (response.ok) {
            const complaints = await response.json();
            const feedbackList = document.getElementById('feedbackList');
            
            if (complaints.length === 0) {
                feedbackList.innerHTML = `<p class="text-muted">${translations[currentLanguage].noFeedback}</p>`;
                return;
            }

            feedbackList.innerHTML = complaints.map(renderComplaint).join('');
        }
    } catch (error) {
        console.error('Error fetching feedback:', error);
    }
}

document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        alert(translations[currentLanguage].loginRequired);
        return;
    }

    const formData = {
        type: document.getElementById('type').value,
        message: document.getElementById('message').value,
        contactInfo: currentUser.username || currentUser.first_name,
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
            document.getElementById('contactInfo').value = currentUser.username || currentUser.first_name;
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

// Check if user is already logged in
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            onLoginSuccess();
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

// Initialize the app
checkLoginStatus();
setLanguage('ua');