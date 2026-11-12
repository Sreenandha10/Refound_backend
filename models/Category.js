const { Schema, model } = require('mongoose');

module.exports = model('Category', new Schema({ name: { type: String, required: true, unique: true, trim: true } }, { timestamps: true }));
