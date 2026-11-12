const { Schema, model } = require('mongoose');

module.exports = model(
  'Notification',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      type: { type: String, enum: ['NEW_MATCH', 'CLAIM_RECEIVED', 'CLAIM_DECISION', 'HANDOVER', 'RECOVERED', 'SYSTEM'], required: true },
      title: { type: String, required: true },
      message: { type: String, default: '' },
      link: { type: String, default: '' },
      read: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);
