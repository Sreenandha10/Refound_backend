const { Schema, model } = require('mongoose');

const flagSchema = new Schema({ by: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String, at: { type: Date, default: Date.now } }, { _id: false });

const itemSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['lost', 'found'], required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, index: true },
    brand: { type: String, default: '', trim: true },
    color: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    location: { type: String, required: true, trim: true },
    geo: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } },
    dateTime: { type: Date, required: true },
    images: [String],
    questions: [String],
    statusNote: { type: String, default: '' },
    status: { type: String, enum: ['REPORTED', 'POTENTIAL_MATCH', 'UNDER_CLAIM', 'RECOVERED'], default: 'REPORTED', index: true },
    verification: { type: String, enum: ['unverified', 'verified', 'rejected'], default: 'unverified' },
    verificationNote: { type: String, default: '' },
    flags: [flagSchema],
    isDeleted: { type: Boolean, default: false },
    recoveredAt: Date,
  },
  { timestamps: true }
);

itemSchema.index({ geo: '2dsphere' });

module.exports = model('Item', itemSchema);
