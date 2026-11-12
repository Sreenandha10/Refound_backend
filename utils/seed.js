const User = require('../models/User');
const Category = require('../models/Category');

const defaults = ['Wallets & Bags', 'Phones', 'Electronics', 'Keys', 'Documents & IDs', 'Jewellery', 'Clothing', 'Books & Stationery', 'Pets', 'Others'];

module.exports = async () => {
  if (!(await Category.countDocuments())) await Category.insertMany(defaults.map((name) => ({ name })));

  const email = (process.env.ADMIN_EMAIL || 'admin@refound.com').toLowerCase();
  if (!(await User.exists({ email }))) {
    await User.create({ name: 'REFOUND Admin', email, password: process.env.ADMIN_PASSWORD || 'Admin@123', role: 'admin' });
    console.log(`Admin account created: ${email}`);
  }
};
