const Class = require('../models/class.model');
const Student = require('../models/student.model');
const Staff = require('../models/staff.model');

exports.getAllClasses = async (req, res) => {
  try {
    console.log('Fetching all classes...');
    const classes = await Class.find({})
      .populate('students', 'email')
      .populate('staff', 'email');
    console.log('Classes fetched:', classes);
    res.json(classes);
  } catch (error) {
    console.error('Error fetching classes:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.createClass = async (req, res) => {
  const { name } = req.body;
  try {
    console.log('Creating class with name:', name);
    if (!name) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    const newClass = new Class({
      name,
      staff: [],
      students: [],
    });
    await newClass.save();
    console.log('Class saved to MongoDB:', newClass);
    const populatedClass = await Class.findById(newClass._id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.status(201).json(populatedClass);
  } catch (error) {
    console.error('Error creating class:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.getClassById = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Fetching class with ID:', id);
    const classDoc = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    console.log('Class fetched:', classDoc);
    res.json(classDoc);
  } catch (error) {
    console.error('Error fetching class:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.updateClass = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    console.log('Updating class with ID:', id);
    if (!name) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    const updatedClass = await Class.findByIdAndUpdate(
      id,
      { $set: { name } },
      { new: true }
    )
      .populate('students', 'email')
      .populate('staff', 'email');
    if (!updatedClass) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    console.log('Class updated in MongoDB:', updatedClass);
    res.json(updatedClass);
  } catch (error) {
    console.error('Error updating class:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('Deleting class with ID:', id);
    const classDoc = await Class.findByIdAndDelete(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    console.log('Class deleted from MongoDB:', classDoc);
    res.json({ message: 'Class deleted' });
  } catch (error) {
    console.error('Error deleting class:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.addStudent = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  try {
    console.log('Adding student with email:', email, 'to class ID:', id);
    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) {
      console.log('Student not found for email:', email);
      return res.status(404).json({ error: 'Student not found in database' });
    }
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    if (classDoc.students.includes(student._id)) {
      console.log('Student already in class:', email);
      return res.status(400).json({ error: 'Student already in class' });
    }
    classDoc.students.push(student._id);
    await classDoc.save();
    console.log('Student added to class:', classDoc);

    // Synchronize exams: Add all class exams to the student's exams array
    if (classDoc.exams && classDoc.exams.length > 0) {
      for (const examId of classDoc.exams) {
        if (!student.exams.includes(examId)) {
          student.exams.push(examId);
        }
      }
      await student.save();
      console.log('Existing exams added to student:', student.uid);
    }

    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.json(populatedClass);
  } catch (error) {
    console.error('Error adding student:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.addStaff = async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  try {
    console.log('Adding staff with email:', email, 'to class ID:', id);
    const staff = await Staff.findOne({ email: email.toLowerCase() });
    if (!staff) {
      console.log('Staff not found for email:', email);
      return res.status(404).json({ error: 'Staff not found in database' });
    }
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    if (classDoc.staff.includes(staff._id)) {
      console.log('Staff already in class:', email);
      return res.status(400).json({ error: 'Staff already in class' });
    }
    classDoc.staff.push(staff._id);
    await classDoc.save();
    console.log('Staff added to class:', classDoc);

    // Synchronize exams: Add all class exams to the staff's exams array
    if (classDoc.exams && classDoc.exams.length > 0) {
      for (const examId of classDoc.exams) {
        if (!staff.exams.includes(examId)) {
          staff.exams.push(examId);
        }
      }
      await staff.save();
      console.log('Existing exams added to staff:', staff.uid);
    }

    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.json(populatedClass);
  } catch (error) {
    console.error('Error adding staff:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.bulkAddStudents = async (req, res) => {
  const { id } = req.params;
  const { students } = req.body;
  try {
    console.log('Bulk adding students to class ID:', id);
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    const created = [];
    const errors = [];
    for (const { email } of students) {
      try {
        console.log('Processing student with email:', email);
        const student = await Student.findOne({ email: email.toLowerCase() });
        if (!student) {
          console.error('Student not found for email:', email);
          errors.push({ email, error: 'Student not found in database' });
          continue;
        }
        if (classDoc.students.includes(student._id)) {
          console.log('Student already in class:', email);
          errors.push({ email, error: 'Student already in class' });
          continue;
        }
        classDoc.students.push(student._id);
        created.push({ email });

        // Synchronize exams: Add all class exams to the student's exams array
        if (classDoc.exams && classDoc.exams.length > 0) {
          for (const examId of classDoc.exams) {
            if (!student.exams.includes(examId)) {
              student.exams.push(examId);
            }
          }
          await student.save();
          console.log('Existing exams added to student:', student.uid);
        }
      } catch (err) {
        console.error('Error processing student:', email, err.message);
        errors.push({ email, error: err.message });
      }
    }
    await classDoc.save();
    console.log('Bulk students added to class:', classDoc);
    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.status(201).json({ created, errors, class: populatedClass });
  } catch (error) {
    console.error('Error bulk adding students:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.bulkAddStaff = async (req, res) => {
  const { id } = req.params;
  const { staff } = req.body;
  try {
    console.log('Bulk adding staff to class ID:', id);
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    const created = [];
    const errors = [];
    for (const { email } of staff) {
      try {
        console.log('Processing staff with email:', email);
        const staffMember = await Staff.findOne({ email: email.toLowerCase() });
        if (!staffMember) {
          console.error('Staff not found for email:', email);
          errors.push({ email, error: 'Staff not found in database' });
          continue;
        }
        if (classDoc.staff.includes(staffMember._id)) {
          console.log('Staff already in class:', email);
          errors.push({ email, error: 'Staff already in class' });
          continue;
        }
        classDoc.staff.push(staffMember._id);
        created.push({ email });

        // Synchronize exams: Add all class exams to the staff's exams array
        if (classDoc.exams && classDoc.exams.length > 0) {
          for (const examId of classDoc.exams) {
            if (!staffMember.exams.includes(examId)) {
              staffMember.exams.push(examId);
            }
          }
          await staffMember.save();
          console.log('Existing exams added to staff:', staffMember.uid);
        }
      } catch (err) {
        console.error('Error processing staff:', email, err.message);
        errors.push({ email, error: err.message });
      }
    }
    await classDoc.save();
    console.log('Bulk staff added to class:', classDoc);
    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.status(201).json({ created, errors, class: populatedClass });
  } catch (error) {
    console.error('Error bulk adding staff:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.removeStudent = async (req, res) => {
  const { id, email } = req.params;
  try {
    console.log('Removing student with email:', email, 'from class ID:', id);
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) {
      console.log('Student not found for email:', email);
      return res.status(404).json({ error: 'Student not found' });
    }
    classDoc.students = classDoc.students.filter(s => s.toString() !== student._id.toString());
    await classDoc.save();
    console.log('Student removed from class:', classDoc);

    // Synchronize exams: Remove all class exams from the student's exams array
    if (classDoc.exams && classDoc.exams.length > 0) {
      for (const examId of classDoc.exams) {
        student.exams.pull(examId);
      }
      await student.save();
      console.log('Class exams removed from student:', student.uid);
    }

    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.json(populatedClass);
  } catch (error) {
    console.error('Error removing student:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

exports.removeStaff = async (req, res) => {
  const { id, email } = req.params;
  try {
    console.log('Removing staff with email:', email, 'from class ID:', id);
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      console.log('Class not found for ID:', id);
      return res.status(404).json({ error: 'Class not found' });
    }
    const staff = await Staff.findOne({ email: email.toLowerCase() });
    if (!staff) {
      console.log('Staff not found for email:', email);
      return res.status(404).json({ error: 'Staff not found' });
    }
    classDoc.staff = classDoc.staff.filter(s => s.toString() !== staff._id.toString());
    await classDoc.save();
    console.log('Staff removed from class:', classDoc);

    if (classDoc.exams && classDoc.exams.length > 0) {
      for (const examId of classDoc.exams) {
        staff.exams.pull(examId);
      }
      await staff.save();
      console.log('Class exams removed from staff:', staff.uid);
    }

    const populatedClass = await Class.findById(id)
      .populate('students', 'email')
      .populate('staff', 'email');
    res.json(populatedClass);
  } catch (error) {
    console.error('Error removing staff:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};