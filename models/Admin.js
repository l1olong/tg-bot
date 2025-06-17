const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    telegramId: {
        type: String,
        required: true,
        unique: true // Кожен ID адміністратора має бути унікальним
    },
    username: {
        type: String,
        default: 'N/A' // Ім'я користувача буде додано, коли він вперше увійде в систему
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
});

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;