const express = require('express');
const router = express.Router();
const classController = require('../controllers/class.controller');

router.get('/', classController.getAllClasses);
router.get('/:id', classController.getClassById); 
router.post('/', classController.createClass);
router.put('/:id', classController.updateClass);
router.delete('/:id', classController.deleteClass);
router.post('/:id/students', classController.addStudent);
router.post('/:id/staff', classController.addStaff);
router.post('/:id/bulk-students', classController.bulkAddStudents);
router.delete('/:id/students/:email', classController.removeStudent);
router.delete('/:id/staff/:email', classController.removeStaff);

module.exports = router;