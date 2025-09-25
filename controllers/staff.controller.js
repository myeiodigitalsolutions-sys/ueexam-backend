const admin = require('firebase-admin');
const Staff = require('../models/staff.model');

exports.getAllStaff = async (req, res) => {
  try {
    console.log('Fetching all staff...');
    const staff = await Staff.find({});
    console.log('Staff fetched:', staff);
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createStaff = async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log('Creating staff with email:', email);
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Firebase user created with UID:', userRecord.uid);
    const staff = new Staff({ uid: userRecord.uid, email });
    await staff.save();
    console.log('Staff saved to MongoDB:', staff);
    res.status(201).json(staff);
  } catch (error) {
    console.error('Error creating staff:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.bulkCreateStaff = async (req, res) => {
  const users = req.body;
  try {
    const created = [];
    const errors = [];
    for (const { email, password } of users) {
      try {
        const userRecord = await admin.auth().createUser({ email, password });
        const staff = new Staff({ uid: userRecord.uid, email });
        await staff.save();
        created.push(staff);
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }
    res.status(201).json({ created, errors });
  } catch (error) {
    console.error('Error bulk creating staff:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.deleteStaff = async (req, res) => {
  const { email } = req.params;
  try {
    console.log('Attempting to delete staff with email:', email);
    const staff = await Staff.findOne({ email });
    if (!staff) {
      console.log('Staff not found in MongoDB for email:', email);
      return res.status(404).json({ error: 'Staff not found' });
    }
    console.log('Found staff in MongoDB:', staff);

    try {
      await admin.auth().deleteUser(staff.uid);
      console.log('Firebase user deleted with UID:', staff.uid);
    } catch (firebaseError) {
      console.error('Error deleting Firebase user:', firebaseError.message);
      return res.status(400).json({ error: `Failed to delete Firebase user: ${firebaseError.message}` });
    }

    await Staff.deleteOne({ email });
    console.log('Staff deleted from MongoDB for email:', email);
    res.json({ message: 'Staff deleted' });
  } catch (error) {
    console.error('Error deleting staff:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};