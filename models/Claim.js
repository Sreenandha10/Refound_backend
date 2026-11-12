const { Schema, model } = require('mongoose');

const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

const claimSchema = new Schema(
  {
    match: ref('Match'),
    foundItem: ref('Item'),
    lostItem: ref('Item'),
    claimer: ref('User'),
    finder: ref('User'),
    proofDetails: { type: String, required: true, maxlength: 1500 },
    proofImages: [String],
    answers: [{ question: String, answer: String, _id: false }],
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'recovered'], default: 'pending' },
    reviewNote: { type: String, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handoverPlan: { type: String, default: '' },
    ownerConfirmed: { type: Boolean, default: false },
    finderConfirmed: { type: Boolean, default: false },
    recoveredAt: Date,
  },
  { timestamps: true }
);

module.exports = model('Claim', claimSchema);
