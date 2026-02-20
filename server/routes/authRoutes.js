const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
// POST /api/register - Register new user
router.post('/register', authController.register);
// POST /api/login - Login user
router.post('/login', authController.login);
module.exports = router;
