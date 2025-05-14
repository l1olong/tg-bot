const mongoose = require('mongoose');
const Complaint = require('../models/complaint');
const messages = require('./messages');
const ADMIN_ID = process.env.ADMIN_ID;

function getMainKeyboard(lang) {
  const webAppUrl = process.env.WEBAPP_URL || 'https://web-production-51a9.up.railway.app';
  return {
    reply_markup: {
      keyboard: [
        [{ 
          text: lang === 'ua' ? '🌐 Відкрити веб-портал' : '🌐 Open Web Portal',
          web_app: { url: webAppUrl }
        }],
        [{ text: lang === 'ua' ? 'Надіслати скаргу' : 'Submit a Complaint' }],
        [{ text: lang === 'ua' ? 'Надіслати пропозицію' : 'Submit a Suggestion' }],
        [{ text: lang === 'ua' ? "Адмінка" : "Admin Panel" }],
        [{ text: lang === 'ua' ? "Видалити звернення" : "Delete a Submission" }],
        [{ text: "FAQ" }],
        [{ text: lang === 'ua' ? "Оберіть мову" : "Choose language" }]
      ],
      resize_keyboard: true
    }
  };
}

function getYesNoKeyboard(lang) {
  return {
    reply_markup: {
      keyboard: [
        [{ text: lang === 'ua' ? 'Так' : 'Yes' }],
        [{ text: lang === 'ua' ? 'Ні' : 'No' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

async function handleComplaint(bot, msg, lang) {
  const userData = {
    type: messages[lang].complaintName,
    attachments: [],
  };

  bot.sendMessage(msg.chat.id, messages[lang].writeComplaint);
  
  bot.once('message', async (response) => {
    userData.message = response.text;
    await handleAttachments(bot, msg.chat.id, userData, lang);
  });
}

async function handleSuggestion(bot, msg, lang) {
  const userData = {
    type: messages[lang].suggestionName,
    attachments: [],
  };

  bot.sendMessage(msg.chat.id, messages[lang].writeSuggestion);
  
  bot.once('message', async (response) => {
    userData.message = response.text;
    await handleAttachments(bot, msg.chat.id, userData, lang);
  });
}

async function handleAttachments(bot, chatId, userData, lang) {
  const attachmentKeyboard = {
    reply_markup: {
      keyboard: [[{ text: messages[lang].finishAttachment }]],
      resize_keyboard: true
    }
  };

  await bot.sendMessage(chatId, messages[lang].askForAttachment, getYesNoKeyboard(lang));

  bot.once('message', async (response) => {
    const answer = response.text.toLowerCase();
    const yesResponse = lang === 'ua' ? 'так' : 'yes';
    
    if (answer === yesResponse) {
      await bot.sendMessage(chatId, messages[lang].attachmentPrompt, attachmentKeyboard);
      await collectAttachments(bot, chatId, userData, lang);
    } else {
      await askForContactInfo(bot, chatId, userData, lang);
    }
  });
}

async function collectAttachments(bot, chatId, userData, lang) {
  const maxFiles = 5;
  let collecting = true;

  while (collecting && userData.attachments.length < maxFiles) {
    try {
      const msg = await new Promise(resolve => {
        bot.once('message', resolve);
      });

      if (msg.text === messages[lang].finishAttachment) {
        collecting = false;
        continue;
      }

      if (msg.photo || msg.video) {
        const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.video.file_id;
        const fileType = msg.photo ? 'photo' : 'video';
        
        userData.attachments.push({ type: fileType, fileId: fileId });
        
        if (userData.attachments.length < maxFiles) {
          await bot.sendMessage(chatId, messages[lang].attachmentReceived);
        } else {
          await bot.sendMessage(chatId, messages[lang].maxFilesReached);
          collecting = false;
        }
      } else {
        await bot.sendMessage(chatId, messages[lang].invalidFileType);
      }
    } catch (error) {
      console.error('Error collecting attachments:', error);
      collecting = false;
    }
  }

  await askForContactInfo(bot, chatId, userData, lang);
}

async function askForContactInfo(bot, chatId, userData, lang) {
  await bot.sendMessage(chatId, messages[lang].leaveContactInfo, getYesNoKeyboard(lang));
  
  bot.once('message', async (reply) => {
    const contactPreference = reply.text.toLowerCase();
    const yesResponse = lang === 'ua' ? 'так' : 'yes';
    
    if (contactPreference === yesResponse) {
      await saveComplaint(bot, { chat: { id: chatId }, from: reply.from }, 
        userData.type, userData.message, true, lang, userData.attachments);
      await bot.sendMessage(chatId, messages[lang].complaintSent);
    } else {
      await saveComplaint(bot, { chat: { id: chatId }, from: reply.from }, 
        userData.type, userData.message, false, lang, userData.attachments);
      await bot.sendMessage(chatId, messages[lang].complaintSentNoContact);
    }

    await bot.sendMessage(chatId, 
      lang === 'ua' ? 'Оберіть наступну дію:' : 'Choose your next action:', 
      getMainKeyboard(lang)
    );
  });
}

async function saveComplaint(bot, msg, type, text, includeContactInfo = true, lang, attachments = []) {
  const complaint = new Complaint({
    userId: msg.chat.id,
    type: type,
    message: text,
    contactInfo: includeContactInfo ? (msg.from.username || messages[lang].contactInformation) : messages[lang].contactInformation,
    attachments: attachments
  });

  await complaint.save();

  let adminNotification = `${messages[lang].newComplaint}: ${type}\n${messages[lang].text}: ${text}\n${messages[lang].contactInfo}: ${includeContactInfo ? msg.from.username : messages[lang].contactInformation}`;
  await bot.sendMessage(ADMIN_ID, adminNotification);

  for (const attachment of attachments) {
    if (attachment.type === 'photo') {
      await bot.sendPhoto(ADMIN_ID, attachment.fileId);
    } else if (attachment.type === 'video') {
      await bot.sendVideo(ADMIN_ID, attachment.fileId);
    }
  }
}

async function adminInterface(bot, msg, lang) {
  if (msg.from.id != ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, messages[lang].accessDenied);
  }

  const complaints = await Complaint.find();
  
  if (complaints.length === 0) {
    return bot.sendMessage(msg.chat.id, messages[lang].emptyComplaintList);
  }

  const complaintMap = new Map();
  let complaintNumber = 1;

  let reply = messages[lang].complaintListStart;

  for (const complaint of complaints) {
    complaintMap.set(complaint._id.toString(), complaintNumber);
    
    reply += `${complaintNumber}. ID: ${complaint._id}\n`;
    reply += `${complaint.type}: ${complaint.message}\n`;
    reply += `${messages[lang].contactInfo}: @${complaint.contactInfo}\n`;
    reply += `${messages[lang].status}: ${complaint.status === 'answered' ? messages[lang].answered : messages[lang].notAnswered}\n`;
    
    if (complaint.attachments && complaint.attachments.length > 0) {
      reply += `${lang === 'ua' ? 'Прикріплені файли' : 'Attachments'}: ${complaint.attachments.length}\n`;
    }
    
    reply += '\n';
    complaintNumber++;

    if (reply.length > 3000) {
      await bot.sendMessage(msg.chat.id, reply);
      reply = '';
    }
  }

  if (reply.length > 0) {
    await bot.sendMessage(msg.chat.id, reply);
  }

  for (const complaint of complaints) {
    if (complaint.attachments && complaint.attachments.length > 0) {
      const number = complaintMap.get(complaint._id.toString());
      await bot.sendMessage(msg.chat.id, 
        `${number}. ${lang === 'ua' ? 'Файли для звернення' : 'Files for complaint'}`
      );
      
      for (const attachment of complaint.attachments) {
        try {
          if (attachment.type === 'photo') {
            await bot.sendPhoto(msg.chat.id, attachment.fileId);
          } else if (attachment.type === 'video') {
            await bot.sendVideo(msg.chat.id, attachment.fileId);
          }
        } catch (error) {
          console.error('Error sending attachment:', error);
          await bot.sendMessage(msg.chat.id, 
            lang === 'ua' ? 'Помилка при завантаженні файлу' : 'Error loading file'
          );
        }
      }
    }
  }

  await askForAdminResponse(bot, msg.chat.id, lang);
}

async function replyToUser(bot, userId, complaintText, replyText, lang, attachments = []) {
  const fullMessage = `${messages[lang].userComplaint}: ${complaintText}\n\n${messages[lang].adminReply}: ${replyText}`;
  await bot.sendMessage(userId, fullMessage);

  if (attachments && attachments.length > 0) {
    await bot.sendMessage(userId, 
      lang === 'ua' ? 'Ваші прикріплені файли:' : 'Your attachments:'
    );

    for (const attachment of attachments) {
      try {
        if (attachment.type === 'photo') {
          await bot.sendPhoto(userId, attachment.fileId);
        } else if (attachment.type === 'video') {
          await bot.sendVideo(userId, attachment.fileId);
        }
      } catch (error) {
        console.error('Error sending attachment back to user:', error);
        await bot.sendMessage(userId, 
          lang === 'ua' ? 'Помилка при надсиланні прикріпленого файлу' : 'Error sending attachment'
        );
      }
    }
  }
}

async function requestComplaintIdAndResponse(bot, chatId, lang) {
  try {
    await bot.sendMessage(chatId, messages[lang].enterComplaintId);
    
    const idMsg = await new Promise(resolve => {
      bot.once('message', resolve);
    });
    
    const complaintId = idMsg.text.trim();
    
    if (!mongoose.Types.ObjectId.isValid(complaintId)) {
      await bot.sendMessage(chatId, messages[lang].invalidId);
      return await requestComplaintIdAndResponse(bot, chatId, lang);
    }

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      await bot.sendMessage(chatId, messages[lang].complaintNotFound);
      return await requestComplaintIdAndResponse(bot, chatId, lang);
    }

    await bot.sendMessage(chatId, messages[lang].enterResponse);
    
    const responseMsg = await new Promise(resolve => {
      bot.once('message', resolve);
    });
    
    const responseText = responseMsg.text.trim();
    
    try {
      complaint.status = 'answered';
      await complaint.save();

      await replyToUser(
        bot, 
        complaint.userId, 
        complaint.message, 
        responseText, 
        lang, 
        complaint.attachments
      );
      
      await bot.sendMessage(chatId, `${messages[lang].responseSent}: ${complaint._id}`);

      const updatedComplaint = await Complaint.findById(complaint._id);
      const updatedStatusText = updatedComplaint.status === 'answered' ? 
        messages[lang].answered : messages[lang].notAnswered;
      await bot.sendMessage(chatId, `${messages[lang].updatedStatus}: ${updatedStatusText}`);

      await bot.sendMessage(chatId, 
        lang === 'ua' ? 'Оберіть наступну дію:' : 'Choose your next action:', 
        getMainKeyboard(lang)
      );
    } catch (error) {
      console.error('Error sending response:', error);
      await bot.sendMessage(chatId, messages[lang].errorSendingResponse);
    }
  } catch (error) {
    console.error('Error in complaint response handling:', error);
    await bot.sendMessage(chatId, messages[lang].errorSendingResponse);
  }
}

async function askForAdminResponse(bot, chatId, lang) {
  await bot.sendMessage(chatId, messages[lang].responsePrompt, getYesNoKeyboard(lang));

  const adminReply = await new Promise(resolve => {
    bot.once('message', resolve);
  });
  
  const answer = adminReply.text.toLowerCase().trim();
  const yesResponse = lang === 'ua' ? 'так' : 'yes';
  const noResponse = lang === 'ua' ? 'ні' : 'no';

  if (answer === yesResponse) {
    await requestComplaintIdAndResponse(bot, chatId, lang);
  } else if (answer === noResponse) {
    await bot.sendMessage(chatId, messages[lang].noResponse, getMainKeyboard(lang));
  } else {
    await bot.sendMessage(chatId, messages[lang].invalidResponse);
    await askForAdminResponse(bot, chatId, lang);
  }
}

async function deleteComplaint(bot, msg, lang) {
  if (msg.from.id != ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, messages[lang].accessDenied);
  }

  const complaints = await Complaint.find();
  
  if (complaints.length === 0) {
    return bot.sendMessage(msg.chat.id, messages[lang].emptyComplaintList);
  }

  let replyListener = null;

  await bot.sendMessage(msg.chat.id, messages[lang].enterComplaintIdToDelete);

  try {
    while (true) {
      const adminReply = await new Promise((resolve) => {
        replyListener = async (replyMsg) => {
          if (replyMsg.from.id === msg.from.id && replyMsg.chat.id === msg.chat.id) {
            resolve(replyMsg);
          }
        };
        bot.addListener('message', replyListener);
      });

      bot.removeListener('message', replyListener);
      const complaintId = adminReply.text.trim();

      if (!mongoose.Types.ObjectId.isValid(complaintId)) {
        await bot.sendMessage(msg.chat.id, messages[lang].invalidId);
        continue;
      }

      const complaint = await Complaint.findByIdAndDelete(complaintId);

      if (complaint) {
        await bot.sendMessage(msg.chat.id, `${messages[lang].complaintDeleted}: ${complaintId}`);
        break;
      } else {
        await bot.sendMessage(msg.chat.id, messages[lang].complaintNotFound);
      }
    }

  } catch (error) {
    console.error("Помилка видалення звернення:", error);
    await bot.sendMessage(msg.chat.id, messages[lang].deletionError);
  } finally {
    if (replyListener) {
      bot.removeListener('message', replyListener);
    }
  }
}

async function handleFAQ(bot, msg, lang) {
  const faqs = [
    { question: messages[lang].howToLeaveComplaint, answer: messages[lang].faqAnswer1 },
    { question: messages[lang].howToLeaveSuggestion, answer: messages[lang].faqAnswer2 },
    { question: messages[lang].howToGetResponse, answer: messages[lang].faqAnswer3 }
  ];

  let responseText = messages[lang].faqStart;
  faqs.forEach((faq, index) => {
    responseText += `${index + 1}. ${faq.question}\n${messages[lang].answer}: ${faq.answer}\n\n`;
  });

  await bot.sendMessage(msg.chat.id, responseText);
  await bot.sendMessage(
    msg.chat.id,
    lang === 'ua' ? 'Оберіть наступну дію:' : 'Choose your next action:', 
    getMainKeyboard(lang)
  );
}

module.exports = {handleComplaint, handleSuggestion, adminInterface, handleFAQ, deleteComplaint, getMainKeyboard};