const Exam = require('../models/exam.model');
const Class = require('../models/class.model');
const Student = require('../models/student.model');
const Submission = require('../models/submission.model');
const ExamReport = require('../models/examReport.model');
const Staff = require('../models/staff.model'); // Add Staff model import
const admin = require('../firebaseAdmin');
const multer = require('multer');
const WebSocket = require('ws');
const mongoose = require('mongoose');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).fields([{ name: 'questionFiles[0]', maxCount: 1 }, { name: 'questionFiles[1]', maxCount: 1 }, { name: 'questionFiles[2]', maxCount: 1 }, { name: 'questionFiles[3]', maxCount: 1 }, { name: 'questionFiles[4]', maxCount: 1 }, { name: 'questionFiles[5]', maxCount: 1 }, { name: 'questionFiles[6]', maxCount: 1 }, { name: 'questionFiles[7]', maxCount: 1 }, { name: 'questionFiles[8]', maxCount: 1 }, { name: 'questionFiles[9]', maxCount: 1 }]);

// Multer for single file upload (student files)
const uploadStudentFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file');

// Multer for report file upload
const uploadReportFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for reports
}).single('reportFile');

// Initialize Firebase Storage bucket
const bucket = admin.storage().bucket();

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.message);
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  if (err.message.includes('Only PDF, JPG, PNG, DOC, DOCX files are allowed') || err.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
};

// Upload exam report PDF
exports.uploadExamReport = [
  uploadReportFile,
  handleMulterError,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { examId, uid, violations, totalViolations, examStartTime, examEndTime, wordCounts, userAnswers } = req.body;

    try {
      const student = await Student.findOne({ uid });
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const exam = await Exam.findById(examId);
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check if exam report already exists
      const existingReport = await ExamReport.findOne({ examId, uid });
      if (existingReport && existingReport.completed) {
        return res.status(403).json({ error: 'Exam already completed' });
      }

      const filename = `exam-reports/${examId}/${uid}/${Date.now()}-exam-report.pdf`;
      const blob = bucket.file(filename);
      const blobStream = blob.createWriteStream({
        metadata: { contentType: req.file.mimetype }
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).json({ error: 'Failed to upload report' });
      });

      blobStream.on('finish', async () => {
        await blob.makePublic();
        const reportUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        console.log('Exam report uploaded to Firebase:', reportUrl);

        // Save or update the report
        const report = existingReport || new ExamReport({
          examId,
          uid,
          studentId: student._id,
          reportUrl,
          violations: JSON.parse(violations || '{}'),
          totalViolations: parseInt(totalViolations || 0),
          examStartTime: new Date(examStartTime),
          examEndTime: new Date(examEndTime),
          wordCounts: JSON.parse(wordCounts || '{}'),
          userAnswers: JSON.parse(userAnswers || '{}'),
          completed: true, // Mark as completed
        });

        if (existingReport) {
          existingReport.reportUrl = reportUrl;
          existingReport.violations = JSON.parse(violations || '{}');
          existingReport.totalViolations = parseInt(totalViolations || 0);
          existingReport.examStartTime = new Date(examStartTime);
          existingReport.examEndTime = new Date(examEndTime);
          existingReport.wordCounts = JSON.parse(wordCounts || '{}');
          existingReport.userAnswers = JSON.parse(userAnswers || '{}');
          existingReport.completed = true;
          await existingReport.save();
          console.log('Exam report updated in MongoDB:', existingReport._id);
        } else {
          await report.save();
          console.log('Exam report saved to MongoDB:', report._id);
        }

        res.json({ reportUrl, message: 'Report uploaded successfully' });
      });

      blobStream.end(req.file.buffer);
    } catch (error) {
      console.error('Error uploading exam report:', error);
      res.status(500).json({ error: 'Failed to upload report' });
    }
  }
];

// Get exam report for a student
exports.getExamReport = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    console.log(`Fetching exam report for exam ID: ${examId}, UID: ${uid}`);
    const report = await ExamReport.findOne({ examId, uid })
      .populate('examId', 'title startDate')
      .populate('studentId', 'name email');
    if (!report) {
      return res.status(404).json({ error: 'No report found' });
    }
    console.log('Exam report fetched:', report._id);
    res.json(report);
  } catch (error) {
    console.error(`Error fetching exam report:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get all reports for an exam (for admin overview)
exports.getExamReports = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all reports for exam ID: ${examId}`);
    const reports = await ExamReport.find({ examId })
      .populate('studentId', 'name email uid')
      .sort({ generatedAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error(`Error fetching exam reports:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get exam details by ID
exports.getExamById = async (req, res) => {
  const { examId } = req.params;
  const { uid } = req.query;
  try {
    console.log(`Fetching exam details for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId).populate('class', 'name');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const currentTime = new Date();
    const endTime = new Date(exam.endDate);
    const isExamOver = currentTime > endTime;

    let report = null;
    let completed = false;
    let attended = false;

    if (uid) {
      report = await ExamReport.findOne({ examId, uid });
      completed = report ? report.completed : false;
      attended = !!report; // If a report exists, the student attended
    }

    console.log(`Exam details fetched for exam ID: ${examId}`);
    res.json({
      ...exam.toObject(),
      isExamOver,
      completed,
      attended,
    });
  } catch (error) {
    console.error(`Error fetching exam details for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get all exams
exports.getAllExams = async (req, res) => {
  try {
    console.log('Fetching all exams...', req.query);
    if (req.query.uid) {
      console.log('Fetching exams for UID:', req.query.uid);
      const student = await Student.findOne({ uid: req.query.uid })
        .populate({
          path: 'exams',
          populate: { path: 'class', select: 'name' }
        });
      const staff = await Staff.findOne({ uid: req.query.uid })
        .populate({
          path: 'exams',
          populate: { path: 'class', select: 'name' }
        });

      if (!student && !staff) {
        console.log('User not found for UID:', req.query.uid);
        return res.status(404).json({ error: 'User not found' });
      }

      const exams = student ? student.exams : staff.exams;
      const role = student ? 'student' : 'staff';

      const currentTime = new Date();
      const examsWithStatus = await Promise.all(
        exams.map(async (exam) => {
          const report = role === 'student' ? await ExamReport.findOne({ examId: exam._id, uid: req.query.uid }) : null;
          const endTime = new Date(exam.endDate);
          return {
            ...exam.toObject(),
            completed: report ? report.completed : false,
            attended: !!report,
            isExamOver: currentTime > endTime,
            role
          };
        })
      );

      console.log(`${role} exams fetched:`, examsWithStatus.length);
      res.json(examsWithStatus);
    } else {
      const exams = await Exam.find({})
        .populate('class', 'name');
      console.log('Exams fetched:', exams.length);
      res.json(exams);
    }
  } catch (error) {
    console.error('Error fetching exams:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get exam questions
exports.getExamQuestions = async (req, res) => {
  const { examId } = req.params;
  const { uid } = req.query;
  try {
    console.log(`Fetching questions for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const currentTime = new Date();
    const endTime = new Date(exam.endDate);
    if (currentTime > endTime) {
      console.log(`Exam has ended for ID: ${examId}`);
      return res.status(403).json({ error: 'Exam has ended' });
    }

    if (uid) {
      const student = await Student.findOne({ uid });
      const staff = await Staff.findOne({ uid });
      if (!student && !staff) {
        console.log(`Access denied for UID: ${uid} on exam ID: ${examId}`);
        return res.status(403).json({ error: 'Access denied: User not enrolled in this exam' });
      }
      if (student && !student.exams.includes(examId)) {
        console.log(`Access denied for student UID: ${uid} on exam ID: ${examId}`);
        return res.status(403).json({ error: 'Access denied: Student not enrolled in this exam' });
      }
      if (staff && !staff.exams.includes(examId)) {
        console.log(`Access denied for staff UID: ${uid} on exam ID: ${examId}`);
        return res.status(403).json({ error: 'Access denied: Staff not assigned to this exam' });
      }

      if (student) {
        const report = await ExamReport.findOne({ examId, uid });
        if (report && report.completed) {
          console.log(`Exam already completed for UID: ${uid} on exam ID: ${examId}`);
          return res.status(403).json({ error: 'Exam already completed' });
        }
      }
    }

    console.log(`Questions fetched for exam ID: ${examId}, count: ${exam.questions.length}`);
    res.json(exam.questions);
  } catch (error) {
    console.error(`Error fetching questions for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Create a new exam
exports.createExam = async (req, res, next) => {
  try {
    console.log('Creating exam:', req.body);
    console.log('Files received:', req.files ? Object.entries(req.files).map(([key, files]) => ({ key, files: files.map(f => ({ name: f.originalname, size: f.size })) })) : 'No files');

    const { title, class: classId, description, startDate, endDate, duration, questions } = req.body;
    let parsedQuestions;
    try {
      parsedQuestions = questions ? JSON.parse(questions) : [];
    } catch (error) {
      console.error('Error parsing questions JSON:', error.message);
      return res.status(400).json({ error: 'Invalid questions JSON format' });
    }

    if (parsedQuestions && Array.isArray(parsedQuestions)) {
      parsedQuestions.forEach((question, index) => {
        if (!question.description || !question.description.trim()) {
          throw new Error(`Description required for question ${index + 1}`);
        }
        if (question.type !== 'file') {
          throw new Error(`Only file type allowed for question ${index + 1}`);
        }
      });
    }

    // Handle file uploads with indexed keys
    if (req.files) {
      const fileUploads = {};
      Object.entries(req.files).forEach(([key, files]) => {
        const match = key.match(/questionFiles\[(\d+)\]/);
        if (match) {
          const index = parseInt(match[1]);
          fileUploads[index] = files[0]; // Assuming one file per index
        }
      });

      const uploadPromises = Object.entries(fileUploads).map(([index, file]) => {
        const filename = `exams/${Date.now()}-${file.originalname}`;
        const blob = bucket.file(filename);
        const blobStream = blob.createWriteStream({
          metadata: { contentType: file.mimetype }
        });

        return new Promise((resolve, reject) => {
          blobStream.on('error', (err) => {
            console.error('Upload stream error:', err);
            reject(err);
          });
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            console.log('File uploaded to Firebase:', url);
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index] && parsedQuestions[index].type === 'file') {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    const newExam = new Exam({
      title,
      class: classId,
      description,
      startDate,
      endDate,
      duration: parseInt(duration),
      questions: parsedQuestions
    });

    await newExam.save();
    console.log('Exam saved to MongoDB:', newExam._id);

    const classDoc = await Class.findById(classId);
    if (classDoc) {
      if (!classDoc.exams.includes(newExam._id)) {
        classDoc.exams.push(newExam._id);
        await classDoc.save();
        console.log('Exam added to class:', classDoc._id);
      }
      // Update students
      if (classDoc.students && classDoc.students.length > 0) {
        const students = await Student.find({ _id: { $in: classDoc.students } });
        for (const student of students) {
          if (!student.exams.includes(newExam._id)) {
            student.exams.push(newExam._id);
            await student.save();
            console.log('Exam added to student:', student.uid);
          }
        }
      }
      // Update staff
      if (classDoc.staff && classDoc.staff.length > 0) {
        const staffMembers = await Staff.find({ _id: { $in: classDoc.staff } });
        for (const staff of staffMembers) {
          if (!staff.exams.includes(newExam._id)) {
            staff.exams.push(newExam._id);
            await staff.save();
            console.log('Exam added to staff:', staff.uid);
          }
        }
      }
    }

    const populatedExam = await Exam.findById(newExam._id).populate('class', 'name');
    res.status(201).json(populatedExam);
  } catch (error) {
    console.error('Error creating exam:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// Apply multer middleware and error handling for createExam
exports.createExam = [upload, handleMulterError, exports.createExam];

// Update an existing exam
exports.updateExam = async (req, res, next) => {
  const { id } = req.params;
  try {
    console.log('Updating exam with ID:', id);
    console.log('Request body:', req.body);
    console.log('Files received:', req.files ? Object.entries(req.files).map(([key, files]) => ({ key, files: files.map(f => ({ name: f.originalname, size: f.size })) })) : 'No files');

    const { title, class: classId, description, startDate, endDate, duration, questions } = req.body;
    let parsedQuestions;
    try {
      parsedQuestions = questions ? JSON.parse(questions) : [];
    } catch (error) {
      console.error('Error parsing questions JSON:', error.message);
      return res.status(400).json({ error: 'Invalid questions JSON format' });
    }

    const oldExam = await Exam.findById(id).populate('class');
    if (!oldExam) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (parsedQuestions && Array.isArray(parsedQuestions)) {
      parsedQuestions.forEach((question, index) => {
        if (!question.description || !question.description.trim()) {
          throw new Error(`Description required for question ${index + 1}`);
        }
        if (question.type !== 'file') {
          throw new Error(`Only file type allowed for question ${index + 1}`);
        }
      });
    }

    // Handle file uploads with indexed keys
    if (req.files) {
      const fileUploads = {};
      Object.entries(req.files).forEach(([key, files]) => {
        const match = key.match(/questionFiles\[(\d+)\]/);
        if (match) {
          const index = parseInt(match[1]);
          fileUploads[index] = files[0]; // Assuming one file per index
        }
      });

      const uploadPromises = Object.entries(fileUploads).map(([index, file]) => {
        const filename = `exams/${Date.now()}-${file.originalname}`;
        const blob = bucket.file(filename);
        const blobStream = blob.createWriteStream({
          metadata: { contentType: file.mimetype }
        });

        return new Promise((resolve, reject) => {
          blobStream.on('error', (err) => {
            console.error('Upload stream error:', err);
            reject(err);
          });
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            console.log('File uploaded to Firebase:', url);
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index] && parsedQuestions[index].type === 'file') {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    const oldFileUrls = oldExam.questions
      .filter(q => q.type === 'file' && q.fileUrl)
      .map(q => q.fileUrl);
    const newFileUrls = parsedQuestions
      .filter(q => q.type === 'file' && q.fileUrl)
      .map(q => q.fileUrl);
    const deletedFileUrls = oldFileUrls.filter(url => !newFileUrls.includes(url));

    if (deletedFileUrls.length > 0) {
      try {
        const deletePromises = deletedFileUrls.map(async (url) => {
          const filePath = url.split(`${bucket.name}/`)[1];
          if (filePath) {
            console.log(`Deleting file from Firebase: ${filePath}`);
            await bucket.file(filePath).delete();
          }
        });
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn(`Failed to delete some files for exam ${id}:`, err.message);
      }
    }

    const updatedExam = await Exam.findByIdAndUpdate(
      id,
      {
        title,
        class: classId,
        description,
        startDate,
        endDate,
        duration: parseInt(duration),
        questions: parsedQuestions
      },
      { new: true }
    ).populate('class', 'name');

    if (!updatedExam) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const oldClassId = oldExam.class?._id.toString();
    const newClassId = classId;
    if (oldClassId && newClassId && oldClassId !== newClassId) {
      const oldClassDoc = await Class.findById(oldClassId);
      if (oldClassDoc) {
        oldClassDoc.exams.pull(id);
        await oldClassDoc.save();
        console.log('Exam removed from old class:', oldClassId);
        // Remove from old students
        if (oldClassDoc.students && oldClassDoc.students.length > 0) {
          const oldStudents = await Student.find({ _id: { $in: oldClassDoc.students } });
          for (const student of oldStudents) {
            student.exams.pull(id);
            await student.save();
            console.log('Exam removed from old student:', student.uid);
          }
        }
        // Remove from old staff
        if (oldClassDoc.staff && oldClassDoc.staff.length > 0) {
          const oldStaff = await Staff.find({ _id: { $in: oldClassDoc.staff } });
          for (const staff of oldStaff) {
            staff.exams.pull(id);
            await staff.save();
            console.log('Exam removed from old staff:', staff.uid);
          }
        }
      }
      const newClassDoc = await Class.findById(newClassId);
      if (newClassDoc) {
        if (!newClassDoc.exams.includes(id)) {
          newClassDoc.exams.push(id);
          await newClassDoc.save();
          console.log('Exam added to new class:', newClassId);
        }
        // Add to new students
        if (newClassDoc.students && newClassDoc.students.length > 0) {
          const newStudents = await Student.find({ _id: { $in: newClassDoc.students } });
          for (const student of newStudents) {
            if (!student.exams.includes(id)) {
              student.exams.push(id);
              await student.save();
              console.log('Exam added to new student:', student.uid);
            }
          }
        }
        // Add to new staff
        if (newClassDoc.staff && newClassDoc.staff.length > 0) {
          const newStaff = await Staff.find({ _id: { $in: newClassDoc.staff } });
          for (const staff of newStaff) {
            if (!staff.exams.includes(id)) {
              staff.exams.push(id);
              await staff.save();
              console.log('Exam added to new staff:', staff.uid);
            }
          }
        }
      }
    } else if (newClassId) {
      const currentClassDoc = await Class.findById(newClassId);
      if (currentClassDoc) {
        // Update students
        if (currentClassDoc.students && currentClassDoc.students.length > 0) {
          const currentStudents = await Student.find({ _id: { $in: currentClassDoc.students } });
          for (const student of currentStudents) {
            if (!student.exams.includes(id)) {
              student.exams.push(id);
              await student.save();
              console.log('Exam added to existing student:', student.uid);
            }
          }
        }
        // Update staff
        if (currentClassDoc.staff && currentClassDoc.staff.length > 0) {
          const currentStaff = await Staff.find({ _id: { $in: currentClassDoc.staff } });
          for (const staff of currentStaff) {
            if (!staff.exams.includes(id)) {
              staff.exams.push(id);
              await staff.save();
              console.log('Exam added to existing staff:', staff.uid);
            }
          }
        }
      }
    }

    console.log('Exam updated in MongoDB:', updatedExam._id);
    res.json(updatedExam);
  } catch (error) {
    console.error('Error updating exam:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// Apply multer middleware and error handling for updateExam
exports.updateExam = [upload, handleMulterError, exports.updateExam];

// Delete an exam
exports.deleteExam = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting exam with ID:', id);
    const examDoc = await Exam.findById(id).populate('class');
    if (!examDoc) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const fileUrls = examDoc.questions
      .filter(q => q.type === 'file' && q.fileUrl)
      .map(q => q.fileUrl);
    if (fileUrls.length > 0) {
      try {
        const deletePromises = fileUrls.map(async (url) => {
          const filePath = url.split(`${bucket.name}/`)[1];
          if (filePath) {
            console.log(`Deleting file from Firebase: ${filePath}`);
            await bucket.file(filePath).delete();
          }
        });
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn(`Failed to delete some files for exam ${id}:`, err.message);
      }
    }

    await Exam.findByIdAndDelete(id);
    if (examDoc.class) {
      const classDoc = await Class.findById(examDoc.class._id);
      if (classDoc) {
        classDoc.exams.pull(id);
        await classDoc.save();
        console.log('Exam removed from class:', examDoc.class._id);
        // Remove from students
        if (classDoc.students && classDoc.students.length > 0) {
          const students = await Student.find({ _id: { $in: classDoc.students } });
          for (const student of students) {
            student.exams.pull(id);
            await student.save();
            console.log('Exam removed from student:', student.uid);
          }
        }
        // Remove from staff
        if (classDoc.staff && classDoc.staff.length > 0) {
          const staff = await Staff.find({ _id: { $in: classDoc.staff } });
          for (const staffMember of staff) {
            staffMember.exams.pull(id);
            await staffMember.save();
            console.log('Exam removed from staff:', staffMember.uid);
          }
        }
      }
    }

    console.log('Exam deleted from MongoDB:', id);
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Error deleting exam:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Upload student file
exports.uploadStudentFile = [
  uploadStudentFile,
  handleMulterError,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { examId, questionId, uid } = req.body;

    try {
      const student = await Student.findOne({ uid });
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const filename = `student-submissions/${uid}/${examId}/${questionId}/${Date.now()}-${req.file.originalname}`;
      const blob = bucket.file(filename);
      const blobStream = blob.createWriteStream({
        metadata: { contentType: req.file.mimetype }
      });

      blobStream.on('error', (err) => {
        console.error('Upload stream error:', err);
        res.status(500).json({ error: 'Failed to upload file' });
      });

      blobStream.on('finish', async () => {
        await blob.makePublic();
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        console.log('Student file uploaded to Firebase:', fileUrl);

        const submission = new Submission({
          examId,
          questionId,
          uid,
          studentId: student._id,
          fileUrl
        });
        await submission.save();
        console.log('Submission saved to MongoDB:', submission._id);

        res.json({ fileUrl });
      });

      blobStream.end(req.file.buffer);
    } catch (error) {
      console.error('Error uploading student file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
];

// Get student submissions
exports.getStudentSubmissions = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    console.log(`Fetching submissions for exam ID: ${examId}, UID: ${uid}`);
    const submissions = await Submission.find({ examId, uid })
      .populate('studentId', 'name uid email');
    if (!submissions || submissions.length === 0) {
      console.log(`No submissions found for exam ID: ${examId}, UID: ${uid}`);
      return res.status(404).json({ error: 'No submissions found' });
    }
    console.log(`Found ${submissions.length} submissions for exam ID: ${examId}, UID: ${uid}`);
    res.json(submissions);
  } catch (error) {
    console.error(`Error fetching submissions for exam ID: ${examId}, UID: ${uid}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get students by exam submissions
exports.getStudentsByExamSubmissions = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching students for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).populate('class', 'students staff');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const classId = exam.class?._id;
    if (!classId) {
      console.log(`No class associated with exam ID: ${examId}`);
      return res.status(404).json({ error: 'No class associated with this exam' });
    }

    const students = await Student.find({ _id: { $in: exam.class.students } })
      .select('email uid name')
      .lean();
    const staff = await Staff.find({ _id: { $in: exam.class.staff } })
      .select('email uid name')
      .lean();

    const submissions = await Submission.find({ examId })
      .select('studentId')
      .lean();

    const studentsWithSubmissions = new Set(
      submissions.map((submission) => submission.studentId.toString())
    );

    const participantsWithAttendance = [
      ...students.map((student) => ({
        _id: student._id,
        email: student.email,
        uid: student.uid,
        name: student.name || `Student_${student.uid.substring(0, 8)}`,
        role: 'student',
        attended: studentsWithSubmissions.has(student._id.toString()),
      })),
      ...staff.map((staff) => ({
        _id: staff._id,
        email: staff.email,
        uid: staff.uid,
        name: staff.name || `Staff_${staff.uid.substring(0, 8)}`,
        role: 'staff',
        attended: false, // Staff don't submit, so no attendance
      }))
    ];

    console.log(`Found ${participantsWithAttendance.length} participants for exam ID: ${examId}`);
    res.json(participantsWithAttendance);
  } catch (error) {
    console.error(`Error fetching participants for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get live monitoring data
exports.getLiveMonitoringData = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`=== FETCHING LIVE MONITORING DATA FOR EXAM: ${examId} ===`);

    // Step 1: Validate examId
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      console.log('ERROR: Invalid exam ID format');
      return res.status(400).json({ error: 'Invalid exam ID' });
    }

    // Step 2: Get exam details with proper population
    console.log('Step 2: Finding exam...');
    const exam = await Exam.findById(examId)
      .populate({
        path: 'class',
        select: 'name students staff',
        populate: [
          { path: 'students', select: 'name fullName email uid _id' },
          { path: 'staff', select: 'name fullName email uid _id' }
        ]
      })
      .lean();

    console.log('Exam found:', exam ? 'YES' : 'NO', exam?._id);

    if (!exam) {
      console.log('ERROR: Exam not found');
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Step 3: Extract students and staff with enhanced name handling
    console.log('Step 3: Extracting students and staff from class...');
    console.log('Class ID:', exam.class?._id);
    console.log('Raw class students:', exam.class?.students);
    console.log('Raw class staff:', exam.class?.staff);

    let students = [];
    let staff = [];
    let studentIdsToFetch = [];
    let staffIdsToFetch = [];

    // Process students
    if (exam.class && exam.class.students && exam.class.students.length > 0) {
      exam.class.students.forEach((studentData, index) => {
        console.log(`Processing student ${index}:`, typeof studentData, studentData);

        if (typeof studentData === 'object' && studentData._id) {
          const studentName = studentData.name || studentData.fullName || `Student_${studentData.uid.substring(0, 8)}`;
          console.log(`Full student object ${index}: ${studentName} (${studentData.uid})`);

          students.push({
            _id: studentData._id.toString(),
            name: studentName,
            email: studentData.email || 'No email',
            uid: studentData.uid,
            role: 'student'
          });
        } else if (mongoose.Types.ObjectId.isValid(studentData)) {
          studentIdsToFetch.push(studentData.toString());
          console.log(`Student ObjectId found ${index}: ${studentData}`);
        } else {
          console.warn(`Invalid student data at index ${index}:`, studentData);
        }
      });

      console.log(`Initial students found: ${students.length}, Student IDs to fetch: ${studentIdsToFetch.length}`);

      // Fetch additional students if needed
      if (studentIdsToFetch.length > 0) {
        try {
          const additionalStudents = await Student.find({
            _id: { $in: studentIdsToFetch }
          })
            .select('name fullName email uid _id')
            .lean();

          additionalStudents.forEach(student => {
            const studentName = student.name || student.fullName || `Student_${student.uid.substring(0, 8)}`;
            students.push({
              _id: student._id.toString(),
              name: studentName,
              email: student.email || 'No email',
              uid: student.uid,
              role: 'student'
            });
          });

          console.log(`✅ Additional students fetched: ${additionalStudents.length}`);
        } catch (fetchError) {
          console.error('❌ Error fetching additional students:', fetchError.message);
        }
      }
    } else {
      console.log('⚠️ No class or no students in class');
    }

    // Process staff
    if (exam.class && exam.class.staff && exam.class.staff.length > 0) {
      exam.class.staff.forEach((staffData, index) => {
        console.log(`Processing staff ${index}:`, typeof staffData, staffData);

        if (typeof staffData === 'object' && staffData._id) {
          const staffName = staffData.name || staffData.fullName || `Staff_${staffData.uid.substring(0, 8)}`;
          console.log(`Full staff object ${index}: ${staffName} (${staffData.uid})`);

          staff.push({
            _id: staffData._id.toString(),
            name: staffName,
            email: staffData.email || 'No email',
            uid: staffData.uid,
            role: 'staff'
          });
        } else if (mongoose.Types.ObjectId.isValid(staffData)) {
          staffIdsToFetch.push(staffData.toString());
          console.log(`Staff ObjectId found ${index}: ${staffData}`);
        } else {
          console.warn(`Invalid staff data at index ${index}:`, staffData);
        }
      });

      console.log(`Initial staff found: ${staff.length}, Staff IDs to fetch: ${staffIdsToFetch.length}`);

      // Fetch additional staff if needed
      if (staffIdsToFetch.length > 0) {
        try {
          const additionalStaff = await Staff.find({
            _id: { $in: staffIdsToFetch }
          })
            .select('name fullName email uid _id')
            .lean();

          additionalStaff.forEach(staffMember => {
            const staffName = staffMember.name || staffMember.fullName || `Staff_${staffMember.uid.substring(0, 8)}`;
            staff.push({
              _id: staffMember._id.toString(),
              name: staffName,
              email: staffMember.email || 'No email',
              uid: staffMember.uid,
              role: 'staff'
            });
          });

          console.log(`✅ Additional staff fetched: ${additionalStaff.length}`);
        } catch (fetchError) {
          console.error('❌ Error fetching additional staff:', fetchError.message);
        }
      }
    } else {
      console.log('⚠️ No class or no staff in class');
    }

    console.log(`Total students found: ${students.length}, Total staff found: ${staff.length}`);
    if (students.length > 0) {
      console.log('Students list:', students.map(s => ({
        name: s.name,
        uid: s.uid,
        email: s.email.substring(0, 20) + (s.email.length > 20 ? '...' : ''),
        role: s.role
      })));
    }
    if (staff.length > 0) {
      console.log('Staff list:', staff.map(s => ({
        name: s.name,
        uid: s.uid,
        email: s.email.substring(0, 20) + (s.email.length > 20 ? '...' : ''),
        role: s.role
      })));
    }

    // Step 4: Get exam reports (for students only)
    console.log('Step 4: Finding exam reports...');
    let reports = [];
    try {
      reports = await ExamReport.find({ examId })
        .select('uid violations completed examStartTime')
        .lean();
      console.log(`Reports found: ${reports.length}`);
    } catch (reportError) {
      console.error('❌ Error fetching reports:', reportError.message);
      reports = [];
    }

    // Step 5: Get active video streams
    console.log('Step 5: Getting active streams...');
    let activeStreams = new Map();
    try {
      if (global.videoStreamServer && typeof global.videoStreamServer.getActiveStreams === 'function') {
        activeStreams = global.videoStreamServer.getActiveStreams();
        const examStreams = activeStreams.get(examId) || new Map();
        console.log(`Active streams for exam ${examId}: ${examStreams.size}`);
        console.log('All active exam streams:', Array.from(activeStreams.keys()));

        examStreams.forEach((streamData, uid) => {
          console.log(`Active stream: ${uid}, isStreaming: ${streamData.isStreaming}, connections: ${streamData.connections?.length || 0}, lastUpdate: ${new Date(streamData.lastUpdate).toLocaleTimeString()}`);
        });
      } else {
        console.warn('⚠️ videoStreamServer not initialized');
      }
    } catch (streamError) {
      console.error('❌ Error accessing streams:', streamError.message);
      activeStreams = new Map();
    }

    // Step 6: Map student and staff data with live status
    console.log('Step 6: Mapping participant data...');
    const participantsWithStatus = [...students, ...staff].map(participant => {
      const report = reports.find(r => r.uid === participant.uid);
      const streamData = activeStreams.get(examId)?.get(participant.uid);

      const status = participant.role === 'student' && report?.completed ? 'completed' :
        (streamData && Date.now() - (streamData.lastUpdate || 0) < 30000) ? 'attending' : 'not-attending';
      const isStreaming = !!streamData && streamData.isStreaming;

      console.log(`${participant.role} ${participant.name} (${participant.uid}): status=${status}, isStreaming=${isStreaming}, streamData=${!!streamData}`);

      return {
        id: participant._id,
        name: participant.name,
        email: participant.email,
        uid: participant.uid,
        role: participant.role,
        status,
        violations: participant.role === 'student' && report ? Object.entries(report.violations || {})
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => ({
            type: type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            count,
            time: report.examStartTime ? new Date(report.examStartTime).toLocaleTimeString() : new Date().toLocaleTimeString()
          })) : [],
        isStreaming,
        lastUpdate: streamData ? new Date(streamData.lastUpdate).toLocaleTimeString() : null,
        currentQuestion: participant.role === 'student' && report ? `Q${Math.max(1, Math.floor(Math.random() * 10) + 1)}` : null,
        connectionCount: streamData?.connections?.length || 0
      };
    });

    // Step 7: Prepare exam details
    console.log('Step 7: Preparing exam details...');
    const examDetails = {
      id: exam._id.toString(),
      title: exam.title || 'Untitled Exam',
      duration: exam.duration || 0,
      startDate: exam.startDate,
      endDate: exam.endDate,
      totalParticipants: participantsWithStatus.length,
      totalStudents: students.length,
      totalStaff: staff.length,
      attendingCount: participantsWithStatus.filter(s => s.status === 'attending').length,
      completedCount: participantsWithStatus.filter(s => s.status === 'completed').length,
      isStreamingCount: participantsWithStatus.filter(s => s.isStreaming).length,
      className: exam.class?.name || 'Unknown Class'
    };

    console.log('=== SUCCESS: Returning monitoring data ===');
    console.log('Exam:', examDetails.title);
    console.log('Total participants:', examDetails.totalParticipants);
    console.log('Total students:', examDetails.totalStudents);
    console.log('Total staff:', examDetails.totalStaff);
    console.log('Attending:', examDetails.attendingCount);
    console.log('Streaming:', examDetails.isStreamingCount);
    console.log('Participants with status:', participantsWithStatus.map(p => ({
      name: p.name,
      uid: p.uid,
      role: p.role,
      status: p.status,
      streaming: p.isStreaming,
      connectionCount: p.connectionCount
    })));

    res.json({
      exam: examDetails,
      participants: participantsWithStatus
    });
  } catch (error) {
    console.error(`=== ERROR in getLiveMonitoringData for exam ${examId} ===`);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    console.error('=== END ERROR ===');
    res.status(500).json({
      error: 'Failed to fetch monitoring data',
      details: error.message,
      examId
    });
  }
};

// Get video chunk
exports.getVideoChunk = async (req, res) => {
  const { examId, uid } = req.params;
  
  try {
    const activeStreams = global.videoStreamServer ? global.videoStreamServer.getActiveStreams() : new Map();
    const examStreams = activeStreams.get(examId) || new Map();
    const participantData = examStreams.get(uid);
    
    if (!participantData || !participantData.lastChunk) {
      return res.status(404).json({ error: 'No video stream available' });
    }

    // Convert buffer to readable stream
    const buffer = Buffer.from(participantData.lastChunk);
    res.set({
      'Content-Type': 'video/webm',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache',
      'Connection': 'close'
    });
    
    res.send(buffer);
  } catch (error) {
    console.error('Error serving video chunk:', error);
    res.status(500).json({ error: 'Failed to serve video chunk' });
  }
};

// Add endpoint to get staff for a class
exports.getClassStaff = async (req, res) => {
  const { classId } = req.params;
  try {
    console.log(`Fetching staff for class ID: ${classId}`);
    const classData = await Class.findById(classId).populate('staff', 'uid email name');
    if (!classData) {
      console.log(`Class not found for ID: ${classId}`);
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(classData.staff || []);
  } catch (error) {
    console.error('Error fetching class staff:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.upload = upload;