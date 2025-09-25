// exam.model.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['file'],
    default: 'file',
    required: true 
  },
  fileUrl: { type: String },
  fileType: { type: String },
  fileTypesAllowed: {
    pdf: { type: Boolean, default: false },
    doc: { type: Boolean, default: false },
    docx: { type: Boolean, default: false },
    jpg: { type: Boolean, default: false },
    png: { type: Boolean, default: false }
  }
});

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  description: String,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  duration: { 
    type: Number, 
    required: true,
    min: [1, 'Duration must be at least 1 minute']
  }, // in minutes
  questions: [questionSchema]
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);