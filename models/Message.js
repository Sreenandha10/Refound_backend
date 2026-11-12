const { Schema, model } = require('mongoose');

module.exports = model(
  'Message',
  new Schema(
    {
      match: { type: Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
      sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      text: { type: String, required: true, maxlength: 1000 },
    },
    { timestamps: true }
  )
);
