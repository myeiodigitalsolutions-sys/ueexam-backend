const admin = require('firebase-admin');
const Student = require('../models/student.model');

exports.getAllStudents = async (req, res) => {
  try {
    console.log('Fetching all students...');
    const students = await Student.find({});
    console.log('Students fetched:', students);
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.createStudent = async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log('Creating student with email:', email);
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Firebase user created with UID:', userRecord.uid);
    const student = new Student({ uid: userRecord.uid, email });
    await student.save();
    console.log('Student saved to MongoDB:', student);
    res.status(201).json(student);
  } catch (error) {
    console.error('Error creating student:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.bulkCreateStudents = async (req, res) => {
  const users = req.body;
  try {
    const created = [];
    const errors = [];
    for (const { email, password } of users) {
      try {
        console.log('Creating student with email:', email);
        const userRecord = await admin.auth().createUser({ email, password });
        console.log('Firebase user created with UID:', userRecord.uid);
        const student = new Student({ uid: userRecord.uid, email });
        await student.save();
        console.log('Student saved to MongoDB:', student);
        created.push(student);
      } catch (err) {
        console.error('Error creating student:', err.message);
        errors.push({ email, error: err.message });
      }
    }
    res.status(201).json({ created, errors });
  } catch (error) {
    console.error('Error bulk creating students:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  const { email } = req.params;
  try {
    console.log('Attempting to delete student with email:', email);
    const student = await Student.findOne({ email });
    if (!student) {
      console.log('Student not found in MongoDB for email:', email);
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('Found student in MongoDB:', student);

    try {
      await admin.auth().deleteUser(student.uid);
      console.log('Firebase user deleted with UID:', student.uid);
    } catch (firebaseError) {
      console.error('Error deleting Firebase user:', firebaseError.message);
      return res.status(400).json({ error: `Failed to delete Firebase user: ${firebaseError.message}` });
    }

    await Student.deleteOne({ email });
    console.log('Student deleted from MongoDB for email:', email);
    res.json({ message: 'Student deleted' });
  } catch (error) {
    console.error('Error deleting student:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};