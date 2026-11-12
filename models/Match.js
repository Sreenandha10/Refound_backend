const { Schema, model } = require('mongoose');

const matchSchema = new Schema(
  {
    lostItem: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    foundItem: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    users: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    percentage: { type: Number, required: true },
    breakdown: { type: Object, default: {} },
    status: { type: String, enum: ['pending', 'notified', 'resolved'], default: 'notified' },
  },
  { timestamps: true }
);

matchSchema.index({ lostItem: 1, foundItem: 1 }, { unique: true });

module.exports = model('Match', matchSchema);
