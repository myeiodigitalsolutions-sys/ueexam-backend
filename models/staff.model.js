const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: 'staff' },
  exams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }],
}, { timestamps: true });

module.exports = mongoose.model('Staff', staffSchema);