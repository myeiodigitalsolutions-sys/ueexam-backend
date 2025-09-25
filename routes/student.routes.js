const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');

router.get('/', studentController.getAllStudents);
router.post('/', studentController.createStudent);
router.post('/bulk', studentController.bulkCreateStudents);
router.delete('/:email', studentController.deleteStudent);

module.exports = router;