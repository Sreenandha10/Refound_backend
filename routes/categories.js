const router = require('express').Router();
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', protect, asyncHandler(async (req, res) => res.json(await Category.find().sort('name'))));

module.exports = router;
