// models/student.model.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: 'student' },
  exams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }]
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);