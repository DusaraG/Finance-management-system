const mongoose = require('mongoose');

const investorSchema = mongoose.Schema({
    name: String,
    age: Number,
    email: String
});
module.exports = mongoose.model("Investor", investorSchema);