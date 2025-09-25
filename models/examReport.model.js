// models/examReport.model.js
const mongoose = require('mongoose');

const examReportSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  uid: { type: String, required: true }, 
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  reportUrl: { type: String, required: true }, 
  generatedAt: { type: Date, default: Date.now },
  violations: {
    noFaceDetected: { type: Number, default: 0 },
    multipleBodies: { type: Number, default: 0 },
    tabSwitched: { type: Number, default: 0 },
    copyPasteAttempted: { type: Number, default: 0 },
    voiceDetected: { type: Number, default: 0 },
  },
  totalViolations: { type: Number, default: 0 },
  examStartTime: { type: Date },
  examEndTime: { type: Date },
  wordCounts: { type: Object, default: {} }, 
  userAnswers: { type: Object, default: {} },
  completed: { type: Boolean, default: false }, 
}, { timestamps: true });

module.exports = mongoose.model('ExamReport', examReportSchema);