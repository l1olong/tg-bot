require('dotenv').config();
const mongoose = require('mongoose');
const Complaint = require('./complaint');

async function migrateComplaints() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const complaints = await Complaint.find({});
        console.log(`Found ${complaints.length} complaints to migrate`);

        for (const complaint of complaints) {
            // Convert userId to string if it's a number
            if (typeof complaint.userId === 'number') {
                complaint.userId = complaint.userId.toString();
            }

            // Set userRole based on userId
            complaint.userRole = complaint.userId === process.env.ADMIN_ID && userId === process.env.ADMIN_ID2 ? 'admin' : 'user';

            // Add adminResponse structure if status is answered but no adminResponse exists
            if (complaint.status === 'answered' && !complaint.adminResponse) {
                complaint.adminResponse = {
                    text: 'Відповідь надано раніше',
                    date: complaint.updatedAt || complaint.createdAt
                };
            }

            await complaint.save();
            console.log(`Migrated complaint ${complaint._id}`);
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Execute migration
migrateComplaints();