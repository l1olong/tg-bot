const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  type: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  contactInfo: {
    type: String,
    default: 'Без контактної інформації'
  },
  status: {
    type: String,
    enum: ['new', 'answered'],
    default: 'new'
  },
  adminResponse: {
    text: String,
    date: Date
  },
  attachments: [{
    type: {
      type: String,
      enum: ['photo', 'video'],
      required: true
    },
    fileId: {
      type: String,
      required: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Complaint', complaintSchema);